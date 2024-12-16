const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");
const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;
const mv = testHelpers.MoneyValues;
const timeValues = testHelpers.TimeValues;

const ZERO = toBN("0");
const ZERO_ADDRESS = th.ZERO_ADDRESS;
const maxBytes32 = th.maxBytes32;

const GAS_PRICE = 10000000;

const getFrontEndTag = async (stabilityPool, depositor) => {
  return (await stabilityPool.deposits(depositor))[1];
};

contract("StabilityPool", async () => {
  let owner,
    defaulter_1,
    defaulter_2,
    defaulter_3,
    whale,
    alice,
    bob,
    carol,
    dennis,
    erin,
    flyn,
    A,
    B,
    C,
    D,
    E,
    F,
    frontEnd_1,
    frontEnd_2,
    frontEnd_3;
  let lpRewardsAddress, multisig;
  let frontEnds;

  let contracts;
  let priceFeed;
  let debtToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let protocolToken;
  let communityIssuance;

  const getOpenTroveDebtTokenAmount = async (totalDebt) =>
    th.getOpenTroveDebtTokenAmount(contracts, totalDebt);
  const openTrove = async (params) => th.openTrove(contracts, params);
  const assertRevert = th.assertRevert;

  before(async () => {
    const signers = await ethers.getSigners();

    [
      owner,
      defaulter_1,
      defaulter_2,
      defaulter_3,
      whale,
      alice,
      bob,
      carol,
      dennis,
      erin,
      flyn,
      A,
      B,
      C,
      D,
      E,
      F,
      frontEnd_1,
      frontEnd_2,
      frontEnd_3,
    ] = signers;
    [lpRewardsAddress, multisig] = signers.slice(998, 1000);
    frontEnds = [frontEnd_1, frontEnd_2, frontEnd_3];
  });

  describe("Stability Pool Mechanisms", async () => {
    beforeEach(async () => {
      await hre.network.provider.send("hardhat_reset");

      const transactionCount = await owner.getTransactionCount();
      const cpTesterContracts = await deploymentHelper.computeContractAddresses(
        owner.address,
        transactionCount,
        5,
      );
      const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
        owner.address,
        transactionCount + 5,
      );

      // Overwrite contracts with computed tester addresses
      cpContracts.troveManager = cpTesterContracts[2];
      cpContracts.debtToken = cpTesterContracts[4];

      const troveManagerTester = await deploymentHelper.deployTroveManagerTester(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
        cpContracts,
      );
      const debtTokenTester = await deploymentHelper.deployDebtTokenTester(cpContracts);

      contracts = await deploymentHelper.deployProtocolCore(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
        cpContracts,
      );

      contracts.troveManager = troveManagerTester;
      contracts.debtToken = debtTokenTester;

      const protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
        owner.address,
        cpContracts,
      );

      const allocation = [
        { address: multisig.address, amount: toBN(dec(67000000, 18)) },
        { address: lpRewardsAddress.address, amount: toBN(dec(1000000, 18)) },
        {
          address: protocolTokenContracts.communityIssuance.address,
          amount: toBN(dec(32000000, 18)),
        },
      ];
      await deploymentHelper.allocateProtocolToken(protocolTokenContracts, allocation);

      priceFeed = contracts.priceFeedTestnet;
      debtToken = contracts.debtToken;
      sortedTroves = contracts.sortedTroves;
      troveManager = contracts.troveManager;
      activePool = contracts.activePool;
      stabilityPool = contracts.stabilityPool;
      defaultPool = contracts.defaultPool;
      borrowerOperations = contracts.borrowerOperations;
      hintHelpers = contracts.hintHelpers;

      protocolToken = protocolTokenContracts.protocolToken;
      communityIssuance = protocolTokenContracts.communityIssuance;

      // Register 3 front ends
      await th.registerFrontEnds(frontEnds, stabilityPool);
    });

    // --- provideToSP() ---
    // increases recorded DebtToken at Stability Pool
    it("provideToSP(): increases the Stability Pool DebtToken balance", async () => {
      // --- SETUP --- Give Alice a least 200
      await openTrove({
        extraDebtTokenAmount: toBN(200),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });

      // --- TEST ---

      // provideToSP()
      await stabilityPool.connect(alice).provideToSP(200, ZERO_ADDRESS);

      // check DebtToken balances after
      const stabilityPool_debtToken_After = await stabilityPool.getTotalDebtTokenDeposits();
      assert.equal(stabilityPool_debtToken_After, 200);
    });

    it("provideToSP(): updates the user's deposit record in StabilityPool", async () => {
      // --- SETUP --- Give Alice a least 200
      await openTrove({
        extraDebtTokenAmount: toBN(200),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });

      // --- TEST ---
      // check user's deposit record before
      const alice_depositRecord_Before = await stabilityPool.deposits(alice.address);
      assert.equal(alice_depositRecord_Before[0], 0);

      // provideToSP()
      await stabilityPool.connect(alice).provideToSP(200, frontEnd_1.address);

      // check user's deposit record after
      const alice_depositRecord_After = (await stabilityPool.deposits(alice.address))[0];
      assert.equal(alice_depositRecord_After, 200);
    });

    it("provideToSP(): reduces the user's DebtToken balance by the correct amount", async () => {
      // --- SETUP --- Give Alice a least 200
      await openTrove({
        extraDebtTokenAmount: toBN(200),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });

      // --- TEST ---
      // get user's deposit record before
      const alice_debtTokenBalance_Before = await debtToken.balanceOf(alice.address);

      // provideToSP()
      await stabilityPool.connect(alice).provideToSP(200, frontEnd_1.address);

      // check user's DebtToken balance change
      const alice_debtTokenBalance_After = await debtToken.balanceOf(alice.address);
      assert.equal(alice_debtTokenBalance_Before.sub(alice_debtTokenBalance_After), "200");
    });

    it("provideToSP(): increases totalDebtTokenDeposits by correct amount", async () => {
      // --- SETUP ---

      // Whale opens Trove with 50 FIL, adds 2000 DebtToken to StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(2000, 18), frontEnd_1.address);

      const totalDebtTokenDeposits = await stabilityPool.getTotalDebtTokenDeposits();
      assert.equal(totalDebtTokenDeposits, dec(2000, 18));
    });

    it("provideToSP(): Correctly updates user snapshots of accumulated rewards per unit staked", async () => {
      // --- SETUP ---

      // Whale opens Trove and deposits to SP
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });
      const whaleDebtToken = await debtToken.balanceOf(whale.address);
      await stabilityPool.connect(whale).provideToSP(whaleDebtToken, frontEnd_1.address);

      // 2 Troves opened, each withdraws minimum debt
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_2 },
      });

      // Alice makes Trove and withdraws 100 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(5, 18)),
        extraParams: { from: alice, value: dec(50, "ether") },
      });

      // price drops: defaulter's Troves fall below MCR, whale doesn't
      await priceFeed.setPrice(dec(105, 18));

      const spDebtToken_Before = await stabilityPool.getTotalDebtTokenDeposits();

      // Troves are closed
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      // Confirm SP has decreased
      const spDebtToken_After = await stabilityPool.getTotalDebtTokenDeposits();
      assert.isTrue(spDebtToken_After.lt(spDebtToken_Before));

      // --- TEST ---
      const P_Before = await stabilityPool.P();
      const S_Before = await stabilityPool.epochToScaleToSum(0, 0);
      const G_Before = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(P_Before.gt(toBN("0")));
      assert.isTrue(S_Before.gt(toBN("0")));

      // Check 'Before' snapshots
      const alice_snapshot_Before = await stabilityPool.depositSnapshots(alice.address);
      const alice_snapshot_S_Before = alice_snapshot_Before[0].toString();
      const alice_snapshot_P_Before = alice_snapshot_Before[1].toString();
      const alice_snapshot_G_Before = alice_snapshot_Before[2].toString();
      assert.equal(alice_snapshot_S_Before, "0");
      assert.equal(alice_snapshot_P_Before, "0");
      assert.equal(alice_snapshot_G_Before, "0");

      // Make deposit
      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);

      // Check 'After' snapshots
      const alice_snapshot_After = await stabilityPool.depositSnapshots(alice.address);
      const alice_snapshot_S_After = alice_snapshot_After[0].toString();
      const alice_snapshot_P_After = alice_snapshot_After[1].toString();
      const alice_snapshot_G_After = alice_snapshot_After[2].toString();

      assert.equal(alice_snapshot_S_After, S_Before);
      assert.equal(alice_snapshot_P_After, P_Before);
      assert.equal(alice_snapshot_G_After, G_Before);
    });

    it("provideToSP(), multiple deposits: updates user's deposit and snapshots", async () => {
      // --- SETUP ---
      // Whale opens Trove and deposits to SP
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });
      const whaleDebtToken = await debtToken.balanceOf(whale.address);
      await stabilityPool.connect(whale).provideToSP(whaleDebtToken, frontEnd_1.address);

      // 3 Troves opened. Two users withdraw 160 DebtToken each
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1, value: dec(50, "ether") },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_2, value: dec(50, "ether") },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_3, value: dec(50, "ether") },
      });

      // --- TEST ---

      // Alice makes deposit #1: 150 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(250, 18)),
        ICR: toBN(dec(3, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(150, 18), frontEnd_1.address);

      const alice_Snapshot_0 = await stabilityPool.depositSnapshots(alice.address);
      const alice_Snapshot_S_0 = alice_Snapshot_0[0];
      const alice_Snapshot_P_0 = alice_Snapshot_0[1];
      assert.equal(alice_Snapshot_S_0, 0);
      assert.equal(alice_Snapshot_P_0, "1000000000000000000");

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 users with Trove with 180 DebtToken drawn are closed
      await troveManager.connect(owner).liquidate(defaulter_1.address); // 180 DebtToken closed
      await troveManager.connect(owner).liquidate(defaulter_2.address); // 180 DebtToken closed

      const alice_compoundedDeposit_1 = await stabilityPool.getCompoundedDebtTokenDeposit(
        alice.address,
      );

      // Alice makes deposit #2
      const alice_topUp_1 = toBN(dec(100, 18));
      await stabilityPool.connect(alice).provideToSP(alice_topUp_1, frontEnd_1.address);

      const alice_newDeposit_1 = (await stabilityPool.deposits(alice.address))[0].toString();
      assert.equal(alice_compoundedDeposit_1.add(alice_topUp_1), alice_newDeposit_1);

      // get system reward terms
      const P_1 = await stabilityPool.P();
      const S_1 = await stabilityPool.epochToScaleToSum(0, 0);
      assert.isTrue(P_1.lt(toBN(dec(1, 18))));
      assert.isTrue(S_1.gt(toBN("0")));

      // check Alice's new snapshot is correct
      const alice_Snapshot_1 = await stabilityPool.depositSnapshots(alice.address);
      const alice_Snapshot_S_1 = alice_Snapshot_1[0];
      const alice_Snapshot_P_1 = alice_Snapshot_1[1];
      assert.isTrue(alice_Snapshot_S_1.eq(S_1));
      assert.isTrue(alice_Snapshot_P_1.eq(P_1));

      // Bob withdraws DebtToken and deposits to StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await stabilityPool.connect(alice).provideToSP(dec(427, 18), frontEnd_1.address);

      // Defaulter 3 Trove is closed
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      const alice_compoundedDeposit_2 = await stabilityPool.getCompoundedDebtTokenDeposit(
        alice.address,
      );

      const P_2 = await stabilityPool.P();
      const S_2 = await stabilityPool.epochToScaleToSum(0, 0);
      assert.isTrue(P_2.lt(P_1));
      assert.isTrue(S_2.gt(S_1));

      // Alice makes deposit #3:  100DebtToken
      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);

      // check Alice's new snapshot is correct
      const alice_Snapshot_2 = await stabilityPool.depositSnapshots(alice.address);
      const alice_Snapshot_S_2 = alice_Snapshot_2[0];
      const alice_Snapshot_P_2 = alice_Snapshot_2[1];
      assert.isTrue(alice_Snapshot_S_2.eq(S_2));
      assert.isTrue(alice_Snapshot_P_2.eq(P_2));
    });

    it("provideToSP(): reverts if user tries to provide more than their DebtToken balance", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice, value: dec(50, "ether") },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob, value: dec(50, "ether") },
      });
      const aliceDebtTokenBal = await debtToken.balanceOf(alice.address);
      const bobDebtTokenBal = await debtToken.balanceOf(bob.address);

      // Alice, attempts to deposit 1 wei more than her balance

      const aliceTxPromise = stabilityPool
        .connect(alice)
        .provideToSP(aliceDebtTokenBal.add(toBN(1)), frontEnd_1.address);
      await assertRevert(aliceTxPromise, "revert");

      // Bob, attempts to deposit 235534 more than his balance

      const bobTxPromise = stabilityPool
        .connect(bob)
        .provideToSP(bobDebtTokenBal.add(toBN(dec(235534, 18))), frontEnd_1.address);
      await assertRevert(bobTxPromise, "revert");
    });

    it("provideToSP(): reverts if user tries to provide 2^256-1 DebtToken, which exceeds their balance", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice, value: dec(50, "ether") },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob, value: dec(50, "ether") },
      });

      const maxBytes32 = toBN("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

      // Alice attempts to deposit 2^256-1 DebtToken
      try {
        aliceTx = await stabilityPool.connect(alice).provideToSP(maxBytes32, frontEnd_1.address);
        assert.isFalse(tx.receipt.status);
      } catch (error) {
        assert.include(error.message, "revert");
      }
    });

    it("provideToSP(): reverts if cannot receive FIL Gain", async () => {
      // --- SETUP ---
      // Whale deposits 1850 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });
      await stabilityPool.connect(whale).provideToSP(dec(1850, 18), frontEnd_1.address);

      // Defaulter Troves opened
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_2 },
      });

      // --- TEST ---

      const nonPayableFactory = await deploymentHelper.getFactory("NonPayable");
      nonPayable = await nonPayableFactory.deploy();
      await debtToken.connect(whale).transfer(nonPayable.address, dec(250, 18));

      // NonPayable makes deposit #1: 150 DebtToken
      const txData1 = th.getTransactionData("provideToSP(uint256,address)", [
        web3.utils.toHex(dec(150, 18)),
        frontEnd_1.address,
      ]);
      const tx1 = await nonPayable.forward(stabilityPool.address, txData1);

      const gain_0 = await stabilityPool.getDepositorFILGain(nonPayable.address);
      assert.isTrue(gain_0.eq(toBN(0)), "NonPayable should not have accumulated gains");

      // price drops: defaulters' Troves fall below MCR, nonPayable and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 defaulters are closed
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      const gain_1 = await stabilityPool.getDepositorFILGain(nonPayable.address);
      assert.isTrue(gain_1.gt(toBN(0)), "NonPayable should have some accumulated gains");

      // NonPayable tries to make deposit #2: 100DebtToken (which also attempts to withdraw FIL gain)
      const txData2 = th.getTransactionData("provideToSP(uint256,address)", [
        web3.utils.toHex(dec(100, 18)),
        frontEnd_1.address,
      ]);
      await th.assertRevert(
        nonPayable.forward(stabilityPool.address, txData2),
        "StabilityPool: sending FIL failed",
      );
    });

    it("provideToSP(): doesn't impact other users' deposits or FIL gains", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await stabilityPool.connect(alice).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(2000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(3000, 18), frontEnd_1.address);

      // D opens a trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: dennis },
      });

      // Would-be defaulters open troves
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_2 },
      });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      // Defaulters are liquidated
      await troveManager.liquidate(defaulter_1.address);
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      const alice_debtTokenDeposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      const bob_debtTokenDeposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();
      const carol_debtTokenDeposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(carol.address)
      ).toString();

      const alice_FILGain_Before = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();
      const bob_FILGain_Before = (await stabilityPool.getDepositorFILGain(bob.address)).toString();
      const carol_FILGain_Before = (
        await stabilityPool.getDepositorFILGain(carol.address)
      ).toString();

      //check non-zero DebtToken and FILGain in the Stability Pool
      const DebtTokenInSP = await stabilityPool.getTotalDebtTokenDeposits();
      const FILinSP = await stabilityPool.getFIL();
      assert.isTrue(DebtTokenInSP.gt(mv._zeroBN));
      assert.isTrue(FILinSP.gt(mv._zeroBN));

      // D makes an SP deposit
      await stabilityPool.connect(dennis).provideToSP(dec(1000, 18), frontEnd_1.address);
      assert.equal(
        (await stabilityPool.getCompoundedDebtTokenDeposit(dennis.address)).toString(),
        dec(1000, 18),
      );

      const alice_debtTokenDeposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      const bob_debtTokenDeposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();
      const carol_debtTokenDeposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(carol.address)
      ).toString();

      const alice_FILGain_After = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();
      const bob_FILGain_After = (await stabilityPool.getDepositorFILGain(bob.address)).toString();
      const carol_FILGain_After = (
        await stabilityPool.getDepositorFILGain(carol.address)
      ).toString();

      // Check compounded deposits and FIL gains for A, B and C have not changed
      assert.equal(alice_debtTokenDeposit_Before, alice_debtTokenDeposit_After);
      assert.equal(bob_debtTokenDeposit_Before, bob_debtTokenDeposit_After);
      assert.equal(carol_debtTokenDeposit_Before, carol_debtTokenDeposit_After);

      assert.equal(alice_FILGain_Before, alice_FILGain_After);
      assert.equal(bob_FILGain_Before, bob_FILGain_After);
      assert.equal(carol_FILGain_Before, carol_FILGain_After);
    });

    it("provideToSP(): doesn't impact system debt, collateral or TCR", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await stabilityPool.connect(alice).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(2000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(3000, 18), frontEnd_1.address);

      // D opens a trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: dennis },
      });

      // Would-be defaulters open troves
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });
      await openTrove({
        extraDebtTokenAmount: 0,
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_2 },
      });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      // Defaulters are liquidated
      await troveManager.liquidate(defaulter_1.address);
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      const activeDebt_Before = (await activePool.getDebt()).toString();
      const defaultedDebt_Before = (await defaultPool.getDebt()).toString();
      const activeColl_Before = (await activePool.getFIL()).toString();
      const defaultedColl_Before = (await defaultPool.getFIL()).toString();
      const TCR_Before = (await th.getTCR(contracts)).toString();

      // D makes an SP deposit
      await stabilityPool.connect(dennis).provideToSP(dec(1000, 18), frontEnd_1.address);
      assert.equal(
        (await stabilityPool.getCompoundedDebtTokenDeposit(dennis.address)).toString(),
        dec(1000, 18),
      );

      const activeDebt_After = (await activePool.getDebt()).toString();
      const defaultedDebt_After = (await defaultPool.getDebt()).toString();
      const activeColl_After = (await activePool.getFIL()).toString();
      const defaultedColl_After = (await defaultPool.getFIL()).toString();
      const TCR_After = (await th.getTCR(contracts)).toString();

      // Check total system debt, collateral and TCR have not changed after a Stability deposit is made
      assert.equal(activeDebt_Before, activeDebt_After);
      assert.equal(defaultedDebt_Before, defaultedDebt_After);
      assert.equal(activeColl_Before, activeColl_After);
      assert.equal(defaultedColl_Before, defaultedColl_After);
      assert.equal(TCR_Before, TCR_After);
    });

    it("provideToSP(): doesn't impact any troves, including the caller's trove", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A and B provide to SP
      await stabilityPool.connect(alice).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(2000, 18), frontEnd_1.address);

      // D opens a trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: dennis },
      });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();

      // Get debt, collateral and ICR of all existing troves
      const whale_Debt_Before = (await troveManager.Troves(whale.address))[0].toString();
      const alice_Debt_Before = (await troveManager.Troves(alice.address))[0].toString();
      const bob_Debt_Before = (await troveManager.Troves(bob.address))[0].toString();
      const carol_Debt_Before = (await troveManager.Troves(carol.address))[0].toString();
      const dennis_Debt_Before = (await troveManager.Troves(dennis.address))[0].toString();

      const whale_Coll_Before = (await troveManager.Troves(whale.address))[1].toString();
      const alice_Coll_Before = (await troveManager.Troves(alice.address))[1].toString();
      const bob_Coll_Before = (await troveManager.Troves(bob.address))[1].toString();
      const carol_Coll_Before = (await troveManager.Troves(carol.address))[1].toString();
      const dennis_Coll_Before = (await troveManager.Troves(dennis.address))[1].toString();

      const whale_ICR_Before = (await troveManager.getCurrentICR(whale.address, price)).toString();
      const alice_ICR_Before = (await troveManager.getCurrentICR(alice.address, price)).toString();
      const bob_ICR_Before = (await troveManager.getCurrentICR(bob.address, price)).toString();
      const carol_ICR_Before = (await troveManager.getCurrentICR(carol.address, price)).toString();
      const dennis_ICR_Before = (
        await troveManager.getCurrentICR(dennis.address, price)
      ).toString();

      // D makes an SP deposit
      await stabilityPool.connect(dennis).provideToSP(dec(1000, 18), frontEnd_1.address);
      assert.equal(
        (await stabilityPool.getCompoundedDebtTokenDeposit(dennis.address)).toString(),
        dec(1000, 18),
      );

      const whale_Debt_After = (await troveManager.Troves(whale.address))[0].toString();
      const alice_Debt_After = (await troveManager.Troves(alice.address))[0].toString();
      const bob_Debt_After = (await troveManager.Troves(bob.address))[0].toString();
      const carol_Debt_After = (await troveManager.Troves(carol.address))[0].toString();
      const dennis_Debt_After = (await troveManager.Troves(dennis.address))[0].toString();

      const whale_Coll_After = (await troveManager.Troves(whale.address))[1].toString();
      const alice_Coll_After = (await troveManager.Troves(alice.address))[1].toString();
      const bob_Coll_After = (await troveManager.Troves(bob.address))[1].toString();
      const carol_Coll_After = (await troveManager.Troves(carol.address))[1].toString();
      const dennis_Coll_After = (await troveManager.Troves(dennis.address))[1].toString();

      const whale_ICR_After = (await troveManager.getCurrentICR(whale.address, price)).toString();
      const alice_ICR_After = (await troveManager.getCurrentICR(alice.address, price)).toString();
      const bob_ICR_After = (await troveManager.getCurrentICR(bob.address, price)).toString();
      const carol_ICR_After = (await troveManager.getCurrentICR(carol.address, price)).toString();
      const dennis_ICR_After = (await troveManager.getCurrentICR(dennis.address, price)).toString();

      assert.equal(whale_Debt_Before, whale_Debt_After);
      assert.equal(alice_Debt_Before, alice_Debt_After);
      assert.equal(bob_Debt_Before, bob_Debt_After);
      assert.equal(carol_Debt_Before, carol_Debt_After);
      assert.equal(dennis_Debt_Before, dennis_Debt_After);

      assert.equal(whale_Coll_Before, whale_Coll_After);
      assert.equal(alice_Coll_Before, alice_Coll_After);
      assert.equal(bob_Coll_Before, bob_Coll_After);
      assert.equal(carol_Coll_Before, carol_Coll_After);
      assert.equal(dennis_Coll_Before, dennis_Coll_After);

      assert.equal(whale_ICR_Before, whale_ICR_After);
      assert.equal(alice_ICR_Before, alice_ICR_After);
      assert.equal(bob_ICR_Before, bob_ICR_After);
      assert.equal(carol_ICR_Before, carol_ICR_After);
      assert.equal(dennis_ICR_Before, dennis_ICR_After);
    });

    it("provideToSP(): doesn't protect the depositor's trove from liquidation", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A, B provide 100 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(1000, 18), frontEnd_1.address);

      // Confirm Bob has an active trove in the system
      assert.isTrue(await sortedTroves.contains(bob.address));
      assert.equal((await troveManager.getTroveStatus(bob.address)).toString(), "1"); // Confirm Bob's trove status is active

      // Confirm Bob has a Stability deposit
      assert.equal(
        (await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)).toString(),
        dec(1000, 18),
      );

      // Price drops
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();

      // Liquidate bob
      await troveManager.liquidate(bob.address);

      // Check Bob's trove has been removed from the system
      assert.isFalse(await sortedTroves.contains(bob.address));
      assert.equal((await troveManager.getTroveStatus(bob.address)).toString(), "3"); // check Bob's trove status was closed by liquidation
    });

    it("provideToSP(): providing 0 DebtToken reverts", async () => {
      // --- SETUP ---
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A, B, C provides 100, 50, 30 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(50, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30, 18), frontEnd_1.address);

      const bob_Deposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();
      const DebtTokenInSP_Before = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

      assert.equal(DebtTokenInSP_Before, dec(180, 18));

      // Bob provides 0 DebtToken to the Stability Pool

      const txPromise_B = stabilityPool.connect(bob).provideToSP(0, frontEnd_1.address);
      await th.assertRevert(txPromise_B);
    });

    // --- ProtocolToken functionality ---
    it("provideToSP(), new deposit: when SP > 0, triggers ProtocolToken reward event - increases the sum G", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A provides to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);

      let currentEpoch = await stabilityPool.currentEpoch();
      let currentScale = await stabilityPool.currentScale();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // B provides to SP
      await stabilityPool.connect(B).provideToSP(dec(1000, 18), frontEnd_1.address);

      currentEpoch = await stabilityPool.currentEpoch();
      currentScale = await stabilityPool.currentScale();
      const G_After = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Expect G has increased from the ProtocolToken reward event triggered
      assert.isTrue(G_After.gt(G_Before));
    });

    it("provideToSP(), new deposit: when SP is empty, doesn't update G", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A provides to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A withdraws
      await stabilityPool.connect(A).withdrawFromSP(dec(1000, 18));

      // Check SP is empty
      assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), "0");

      // Check G is non-zero
      let currentEpoch = await stabilityPool.currentEpoch();
      let currentScale = await stabilityPool.currentScale();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      assert.isTrue(G_Before.gt(toBN("0")));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // B provides to SP
      await stabilityPool.connect(B).provideToSP(dec(1000, 18), frontEnd_1.address);

      currentEpoch = await stabilityPool.currentEpoch();
      currentScale = await stabilityPool.currentScale();
      const G_After = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Expect G has not changed
      assert.isTrue(G_After.eq(G_Before));
    });

    it("provideToSP(), new deposit: sets the correct front end tag", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, C, D open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      // Check A, B, C D have no front end tags
      const A_tagBefore = await getFrontEndTag(stabilityPool, A.address);
      const B_tagBefore = await getFrontEndTag(stabilityPool, B.address);
      const C_tagBefore = await getFrontEndTag(stabilityPool, C.address);
      const D_tagBefore = await getFrontEndTag(stabilityPool, D.address);

      assert.equal(A_tagBefore, ZERO_ADDRESS);
      assert.equal(B_tagBefore, ZERO_ADDRESS);
      assert.equal(C_tagBefore, ZERO_ADDRESS);
      assert.equal(D_tagBefore, ZERO_ADDRESS);

      // A, B, C, D provides to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(3000, 18), frontEnd_3.address);
      await stabilityPool.connect(D).provideToSP(dec(4000, 18), ZERO_ADDRESS); // transacts directly, no front end

      // Check A, B, C D have no front end tags
      const A_tagAfter = await getFrontEndTag(stabilityPool, A.address);
      const B_tagAfter = await getFrontEndTag(stabilityPool, B.address);
      const C_tagAfter = await getFrontEndTag(stabilityPool, C.address);
      const D_tagAfter = await getFrontEndTag(stabilityPool, D.address);

      // Check front end tags are correctly set
      assert.equal(A_tagAfter, frontEnd_1.address);
      assert.equal(B_tagAfter, frontEnd_2.address);
      assert.equal(C_tagAfter, frontEnd_3.address);
      assert.equal(D_tagAfter, ZERO_ADDRESS);
    });

    it("provideToSP(), new deposit: depositor does not receive any ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale, value: dec(50, "ether") },
      });

      // A, B, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });

      // Get A, B, C ProtocolToken balances before and confirm they're zero
      const A_protocolTokenBalance_Before = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_Before = await protocolToken.balanceOf(B.address);

      assert.equal(A_protocolTokenBalance_Before, "0");
      assert.equal(B_protocolTokenBalance_Before, "0");

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A, B provide to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), ZERO_ADDRESS);

      // Get A, B, C ProtocolToken balances after, and confirm they're still zero
      const A_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);

      assert.equal(A_protocolTokenBalance_After, "0");
      assert.equal(B_protocolTokenBalance_After, "0");
    });

    it("provideToSP(), new deposit after past full withdrawal: depositor does not receive any ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(4000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---

      const initialDeposit_A = await debtToken.balanceOf(A.address);
      const initialDeposit_B = await debtToken.balanceOf(B.address);
      // A, B provide to SP
      await stabilityPool.connect(A).provideToSP(initialDeposit_A, frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(initialDeposit_B, frontEnd_2.address);

      // time passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // C deposits. A, and B earn ProtocolToken
      await stabilityPool.connect(C).provideToSP(dec(5, 18), ZERO_ADDRESS);

      // Price drops, defaulter is liquidated, A, B and C earn FIL
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      // price bounces back to 200
      await priceFeed.setPrice(dec(200, 18));

      // A and B fully withdraw from the pool
      await stabilityPool.connect(A).withdrawFromSP(initialDeposit_A);
      await stabilityPool.connect(B).withdrawFromSP(initialDeposit_B);

      // --- TEST ---

      // Get A, B, C ProtocolToken balances before and confirm they're non-zero
      const A_protocolTokenBalance_Before = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_Before = await protocolToken.balanceOf(B.address);
      assert.isTrue(A_protocolTokenBalance_Before.gt(toBN("0")));
      assert.isTrue(B_protocolTokenBalance_Before.gt(toBN("0")));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A, B provide to SP
      await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(200, 18), ZERO_ADDRESS);

      // Get A, B, C ProtocolToken balances after, and confirm they have not changed
      const A_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);

      assert.isTrue(A_protocolTokenBalance_After.eq(A_protocolTokenBalance_Before));
      assert.isTrue(B_protocolTokenBalance_After.eq(B_protocolTokenBalance_Before));
    });

    it("provideToSP(), new eligible deposit: tagged front end receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: F },
      });

      // D, E, F provide to SP
      await stabilityPool.connect(D).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(F).provideToSP(dec(3000, 18), frontEnd_3.address);

      // Get F1, F2, F3 ProtocolToken balances before, and confirm they're zero
      const frontEnd_1_protocolTokenBalance_Before = await protocolToken.balanceOf(
        frontEnd_1.address,
      );
      const frontEnd_2_protocolTokenBalance_Before = await protocolToken.balanceOf(
        frontEnd_2.address,
      );
      const frontEnd_3_protocolTokenBalance_Before = await protocolToken.balanceOf(
        frontEnd_3.address,
      );

      assert.equal(frontEnd_1_protocolTokenBalance_Before, "0");
      assert.equal(frontEnd_2_protocolTokenBalance_Before, "0");
      assert.equal(frontEnd_3_protocolTokenBalance_Before, "0");

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // console.log(`protocolTokenSupplyCap before: ${await communityIssuance.protocolTokenSupplyCap()}`)
      // console.log(`totalProtocolTokenIssued before: ${await communityIssuance.totalProtocolTokenIssued()}`)
      // console.log(`ProtocolToken balance of CI before: ${await protocolToken.balanceOf(communityIssuance.address)}`)

      // A, B, C provide to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(3000, 18), frontEnd_3.address);

      // console.log(`protocolTokenSupplyCap after: ${await communityIssuance.protocolTokenSupplyCap()}`)
      // console.log(`totalProtocolTokenIssued after: ${await communityIssuance.totalProtocolTokenIssued()}`)
      // console.log(`ProtocolToken balance of CI after: ${await protocolToken.balanceOf(communityIssuance.address)}`)

      // Get F1, F2, F3 ProtocolToken balances after, and confirm they have increased
      const frontEnd_1_protocolTokenBalance_After = await protocolToken.balanceOf(
        frontEnd_1.address,
      );
      const frontEnd_2_protocolTokenBalance_After = await protocolToken.balanceOf(
        frontEnd_2.address,
      );
      const frontEnd_3_protocolTokenBalance_After = await protocolToken.balanceOf(
        frontEnd_3.address,
      );

      assert.isTrue(
        frontEnd_1_protocolTokenBalance_After.gt(frontEnd_1_protocolTokenBalance_Before),
      );
      assert.isTrue(
        frontEnd_2_protocolTokenBalance_After.gt(frontEnd_2_protocolTokenBalance_Before),
      );
      assert.isTrue(
        frontEnd_3_protocolTokenBalance_After.gt(frontEnd_3_protocolTokenBalance_Before),
      );
    });

    it("provideToSP(), new eligible deposit: tagged front end's stake increases", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // Get front ends' stakes before
      const F1_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_3.address);

      const deposit_A = dec(1000, 18);
      const deposit_B = dec(2000, 18);
      const deposit_C = dec(3000, 18);

      // A, B, C provide to SP
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      // Get front ends' stakes after
      const F1_Stake_After = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_After = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_After = await stabilityPool.frontEndStakes(frontEnd_3.address);

      const F1_Diff = F1_Stake_After.sub(F1_Stake_Before);
      const F2_Diff = F2_Stake_After.sub(F2_Stake_Before);
      const F3_Diff = F3_Stake_After.sub(F3_Stake_Before);

      // Check front ends' stakes have increased by amount equal to the deposit made through them
      assert.equal(F1_Diff, deposit_A);
      assert.equal(F2_Diff, deposit_B);
      assert.equal(F3_Diff, deposit_C);
    });

    it("provideToSP(), new eligible deposit: tagged front end's snapshots update", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // D opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(4000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---

      await stabilityPool.connect(D).provideToSP(dec(2000, 18), ZERO_ADDRESS);

      // fastforward time then  make an SP deposit, to make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
      await stabilityPool.connect(D).provideToSP(dec(2000, 18), ZERO_ADDRESS);

      // Perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // Get front ends' snapshots before
      for (const frontEnd of [frontEnd_1, frontEnd_2, frontEnd_3]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends, since S corresponds to FIL gain)
        assert.equal(snapshot[1], "0"); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      const deposit_A = dec(1000, 18);
      const deposit_B = dec(2000, 18);
      const deposit_C = dec(3000, 18);

      // --- TEST ---

      // A, B, C provide to SP
      const G1 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);

      const G2 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);

      const G3 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      const frontEndAddresses = [frontEnd_1.address, frontEnd_2.address, frontEnd_3.address];
      const G_Values = [G1, G2, G3];

      // Map frontEndAddresses to the value of G at time the deposit was made
      const frontEndToG = th.zipToObject(frontEndAddresses, G_Values);

      // Get front ends' snapshots after
      for (const [frontEnd, G] of Object.entries(frontEndToG)) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd);

        // Check snapshots are the expected values
        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends)
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].eq(G)); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("provideToSP(), new deposit: depositor does not receive FIL gains", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // Whale transfers DebtToken to A, B
      await debtToken.connect(whale).transfer(A.address, dec(100, 18));
      await debtToken.connect(whale).transfer(B.address, dec(200, 18));

      // C, D open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      // --- TEST ---

      // get current FIL balances
      const A_FILBalance_Before = await web3.eth.getBalance(A.address);
      const B_FILBalance_Before = await web3.eth.getBalance(B.address);
      const C_FILBalance_Before = await web3.eth.getBalance(C.address);
      const D_FILBalance_Before = await web3.eth.getBalance(D.address);

      // A, B, C, D provide to SP
      const A_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const B_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(B).provideToSP(dec(200, 18), ZERO_ADDRESS, {
          gasPrice: GAS_PRICE,
        }),
      );
      const C_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(C).provideToSP(dec(300, 18), frontEnd_2.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const D_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(D).provideToSP(dec(400, 18), ZERO_ADDRESS, {
          gasPrice: GAS_PRICE,
        }),
      );

      // FIL balances before minus gas used
      const A_expectedBalance = A_FILBalance_Before - A_GAS_Used;
      const B_expectedBalance = B_FILBalance_Before - B_GAS_Used;
      const C_expectedBalance = C_FILBalance_Before - C_GAS_Used;
      const D_expectedBalance = D_FILBalance_Before - D_GAS_Used;

      // Get  FIL balances after
      const A_FILBalance_After = await web3.eth.getBalance(A.address);
      const B_FILBalance_After = await web3.eth.getBalance(B.address);
      const C_FILBalance_After = await web3.eth.getBalance(C.address);
      const D_FILBalance_After = await web3.eth.getBalance(D.address);

      // Check FIL balances have not changed
      assert.equal(A_FILBalance_After, A_expectedBalance);
      assert.equal(B_FILBalance_After, B_expectedBalance);
      assert.equal(C_FILBalance_After, C_expectedBalance);
      assert.equal(D_FILBalance_After, D_expectedBalance);
    });

    it("provideToSP(), new deposit after past full withdrawal: depositor does not receive FIL gains", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // Whale transfers DebtToken to A, B
      await debtToken.connect(whale).transfer(A.address, dec(1000, 18));
      await debtToken.connect(whale).transfer(B.address, dec(1000, 18));

      // C, D open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(4000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(5000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---
      // A, B, C, D provide to SP
      await stabilityPool.connect(A).provideToSP(dec(105, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(105, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(105, 18), frontEnd_1.address);
      await stabilityPool.connect(D).provideToSP(dec(105, 18), ZERO_ADDRESS);

      // time passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // B deposits. A,B,C,D earn ProtocolToken
      await stabilityPool.connect(B).provideToSP(dec(5, 18), ZERO_ADDRESS);

      // Price drops, defaulter is liquidated, A, B, C, D earn FIL
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      // Price bounces back
      await priceFeed.setPrice(dec(200, 18));

      // A B,C, D fully withdraw from the pool
      await stabilityPool.connect(A).withdrawFromSP(dec(105, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(105, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(105, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(105, 18));

      // --- TEST ---

      // get current FIL balances
      const A_FILBalance_Before = await web3.eth.getBalance(A.address);
      const B_FILBalance_Before = await web3.eth.getBalance(B.address);
      const C_FILBalance_Before = await web3.eth.getBalance(C.address);
      const D_FILBalance_Before = await web3.eth.getBalance(D.address);

      // A, B, C, D provide to SP
      const A_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const B_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(B).provideToSP(dec(200, 18), ZERO_ADDRESS, {
          gasPrice: GAS_PRICE,
        }),
      );
      const C_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(C).provideToSP(dec(300, 18), frontEnd_2.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const D_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(D).provideToSP(dec(400, 18), ZERO_ADDRESS, {
          gasPrice: GAS_PRICE,
        }),
      );

      // FIL balances before minus gas used
      const A_expectedBalance = A_FILBalance_Before - A_GAS_Used;
      const B_expectedBalance = B_FILBalance_Before - B_GAS_Used;
      const C_expectedBalance = C_FILBalance_Before - C_GAS_Used;
      const D_expectedBalance = D_FILBalance_Before - D_GAS_Used;

      // Get  FIL balances after
      const A_FILBalance_After = await web3.eth.getBalance(A.address);
      const B_FILBalance_After = await web3.eth.getBalance(B.address);
      const C_FILBalance_After = await web3.eth.getBalance(C.address);
      const D_FILBalance_After = await web3.eth.getBalance(D.address);

      // Check FIL balances have not changed
      assert.equal(A_FILBalance_After, A_expectedBalance);
      assert.equal(B_FILBalance_After, B_expectedBalance);
      assert.equal(C_FILBalance_After, C_expectedBalance);
      assert.equal(D_FILBalance_After, D_expectedBalance);
    });

    it("provideToSP(), topup: triggers ProtocolToken reward event - increases the sum G", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C provide to SP
      await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(50, 18), frontEnd_1.address);
      await stabilityPool.connect(C).provideToSP(dec(50, 18), frontEnd_1.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      const G_Before = await stabilityPool.epochToScaleToG(0, 0);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // B tops up
      await stabilityPool.connect(B).provideToSP(dec(100, 18), frontEnd_1.address);

      const G_After = await stabilityPool.epochToScaleToG(0, 0);

      // Expect G has increased from the ProtocolToken reward event triggered by B's topup
      assert.isTrue(G_After.gt(G_Before));
    });

    it("provideToSP(), topup from different front end: doesn't change the front end tag", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // whale transfer to troves D and E
      await debtToken.connect(whale).transfer(D.address, dec(100, 18));
      await debtToken.connect(whale).transfer(E.address, dec(200, 18));

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, D, E provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).provideToSP(dec(40, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(50, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A, B, C, D, E top up, from different front ends
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_2.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_1.address);
      await stabilityPool.connect(C).provideToSP(dec(15, 18), frontEnd_3.address);
      await stabilityPool.connect(D).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(E).provideToSP(dec(30, 18), frontEnd_3.address);

      const frontEndTag_A = (await stabilityPool.deposits(A.address))[1];
      const frontEndTag_B = (await stabilityPool.deposits(B.address))[1];
      const frontEndTag_C = (await stabilityPool.deposits(C.address))[1];
      const frontEndTag_D = (await stabilityPool.deposits(D.address))[1];
      const frontEndTag_E = (await stabilityPool.deposits(E.address))[1];

      // Check deposits are still tagged with their original front end
      assert.equal(frontEndTag_A, frontEnd_1.address);
      assert.equal(frontEndTag_B, frontEnd_2.address);
      assert.equal(frontEndTag_C, ZERO_ADDRESS);
      assert.equal(frontEndTag_D, frontEnd_1.address);
      assert.equal(frontEndTag_E, ZERO_ADDRESS);
    });

    it("provideToSP(), topup: depositor receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get A, B, C ProtocolToken balance before
      const A_protocolTokenBalance_Before = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_Before = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_Before = await protocolToken.balanceOf(C.address);

      // A, B, C top up
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), ZERO_ADDRESS);

      // Get ProtocolToken balance after
      const A_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_After = await protocolToken.balanceOf(C.address);

      // Check ProtocolToken Balance of A, B, C has increased
      assert.isTrue(A_protocolTokenBalance_After.gt(A_protocolTokenBalance_Before));
      assert.isTrue(B_protocolTokenBalance_After.gt(B_protocolTokenBalance_Before));
      assert.isTrue(C_protocolTokenBalance_After.gt(C_protocolTokenBalance_Before));
    });

    it("provideToSP(), topup: tagged front end receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get front ends' ProtocolToken balance before
      const F1_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_1.address);
      const F2_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_2.address);
      const F3_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_3.address);

      // A, B, C top up  (front end param passed here is irrelevant)
      await stabilityPool.connect(A).provideToSP(dec(10, 18), ZERO_ADDRESS); // provides no front end param
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_1.address); // provides front end that doesn't match his tag
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address); // provides front end that matches his tag

      // Get front ends' ProtocolToken balance after
      const F1_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const F2_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);
      const F3_protocolTokenBalance_After = await protocolToken.balanceOf(C.address);

      // Check ProtocolToken Balance of front ends has increased
      assert.isTrue(F1_protocolTokenBalance_After.gt(F1_protocolTokenBalance_Before));
      assert.isTrue(F2_protocolTokenBalance_After.gt(F2_protocolTokenBalance_Before));
      assert.isTrue(F3_protocolTokenBalance_After.gt(F3_protocolTokenBalance_Before));
    });

    it("provideToSP(), topup: tagged front end's stake increases", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, D, E, F open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(300, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: F },
      });

      // A, B, C, D, E, F provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address);
      await stabilityPool.connect(D).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(F).provideToSP(dec(30, 18), frontEnd_3.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get front ends' stake before
      const F1_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_3.address);

      // A, B, C top up  (front end param passed here is irrelevant)
      await stabilityPool.connect(A).provideToSP(dec(10, 18), ZERO_ADDRESS); // provides no front end param
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_1.address); // provides front end that doesn't match his tag
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address); // provides front end that matches his tag

      // Get front ends' stakes after
      const F1_Stake_After = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_After = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_After = await stabilityPool.frontEndStakes(frontEnd_3.address);

      // Check front ends' stakes have increased
      assert.isTrue(F1_Stake_After.gt(F1_Stake_Before));
      assert.isTrue(F2_Stake_After.gt(F2_Stake_Before));
      assert.isTrue(F3_Stake_After.gt(F3_Stake_Before));
    });

    it("provideToSP(), topup: tagged front end's snapshots update", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(200, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(400, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(600, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // D opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---

      const deposit_A = dec(100, 18);
      const deposit_B = dec(200, 18);
      const deposit_C = dec(300, 18);

      // A, B, C make their initial deposits
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      // fastforward time then make an SP deposit, to make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      await stabilityPool
        .connect(D)
        .provideToSP(await debtToken.balanceOf(D.address), ZERO_ADDRESS);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(100, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // Get front ends' snapshots before
      for (const frontEnd of [frontEnd_1, frontEnd_2, frontEnd_3]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends, since S corresponds to FIL gain)
        assert.equal(snapshot[1], dec(1, 18)); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      // --- TEST ---

      // A, B, C top up their deposits. Grab G at each stage, as it can increase a bit
      // between topups, because some block.timestamp time passes (and ProtocolToken is issued) between ops
      const G1 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);

      const G2 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);

      const G3 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      const frontEnds = [frontEnd_1.address, frontEnd_2.address, frontEnd_3.address];
      const G_Values = [G1, G2, G3];

      // Map frontEnds to the value of G at time the deposit was made
      frontEndToG = th.zipToObject(frontEnds, G_Values);

      // Get front ends' snapshots after
      for (const [frontEnd, G] of Object.entries(frontEndToG)) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd);

        // Check snapshots are the expected values
        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends)
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].eq(G)); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("provideToSP(): reverts when amount is zero", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(2000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });

      // Whale transfers DebtToken to C, D
      await debtToken.connect(whale).transfer(C.address, dec(100, 18));
      await debtToken.connect(whale).transfer(D.address, dec(100, 18));

      txPromise_A = stabilityPool.connect(A).provideToSP(0, frontEnd_1.address);
      txPromise_B = stabilityPool.connect(B).provideToSP(0, ZERO_ADDRESS);
      txPromise_C = stabilityPool.connect(C).provideToSP(0, frontEnd_2.address);
      txPromise_D = stabilityPool.connect(D).provideToSP(0, ZERO_ADDRESS);

      await th.assertRevert(txPromise_A, "StabilityPool: Amount must be non-zero");
      await th.assertRevert(txPromise_B, "StabilityPool: Amount must be non-zero");
      await th.assertRevert(txPromise_C, "StabilityPool: Amount must be non-zero");
      await th.assertRevert(txPromise_D, "StabilityPool: Amount must be non-zero");
    });

    it("provideToSP(): reverts if user is a registered front end", async () => {
      // C, D, E, F open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: F },
      });

      // C, E, F registers as front end
      await stabilityPool.connect(C).registerFrontEnd(dec(1, 18));
      await stabilityPool.connect(E).registerFrontEnd(dec(1, 18));
      await stabilityPool.connect(F).registerFrontEnd(dec(1, 18));

      const txPromise_C = stabilityPool.connect(C).provideToSP(dec(10, 18), ZERO_ADDRESS);
      const txPromise_E = stabilityPool.connect(E).provideToSP(dec(10, 18), frontEnd_1.address);
      const txPromise_F = stabilityPool.connect(F).provideToSP(dec(10, 18), F.address);
      await th.assertRevert(
        txPromise_C,
        "StabilityPool: must not already be a registered front end",
      );
      await th.assertRevert(
        txPromise_E,
        "StabilityPool: must not already be a registered front end",
      );
      await th.assertRevert(
        txPromise_F,
        "StabilityPool: must not already be a registered front end",
      );

      const txD = await stabilityPool.connect(D).provideToSP(dec(10, 18), frontEnd_1.address);
      const receiptD = await txD.wait();
      assert.equal(receiptD.status, 1);
    });

    it("provideToSP(): reverts if provided tag is not a registered front end", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });

      const txPromise_C = stabilityPool.connect(C).provideToSP(dec(10, 18), A.address); // passes another EOA
      const txPromise_D = stabilityPool.connect(D).provideToSP(dec(10, 18), troveManager.address);
      const txPromise_E = stabilityPool.connect(E).provideToSP(dec(10, 18), stabilityPool.address);
      const txPromise_F = stabilityPool.connect(F).provideToSP(dec(10, 18), F.address); // passes itself

      await th.assertRevert(
        txPromise_C,
        "StabilityPool: Tag must be a registered front end, or the zero address",
      );
      await th.assertRevert(
        txPromise_D,
        "StabilityPool: Tag must be a registered front end, or the zero address",
      );
      await th.assertRevert(
        txPromise_E,
        "StabilityPool: Tag must be a registered front end, or the zero address",
      );
      await th.assertRevert(
        txPromise_F,
        "StabilityPool: Tag must be a registered front end, or the zero address",
      );
    });

    // --- withdrawFromSP ---

    it("withdrawFromSP(): reverts when user has no active deposit", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });

      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);

      const alice_initialDeposit = (await stabilityPool.deposits(alice.address))[0].toString();
      const bob_initialDeposit = (await stabilityPool.deposits(bob.address))[0].toString();

      assert.equal(alice_initialDeposit, dec(100, 18));
      assert.equal(bob_initialDeposit, "0");

      const txAlice = await stabilityPool.connect(alice).withdrawFromSP(dec(100, 18));
      const receiptAlice = await txAlice.wait();
      assert.equal(receiptAlice.status, 1);

      try {
        const txBob = await stabilityPool.connect(bob).withdrawFromSP(dec(100, 18));
        assert.isFalse(txBob.receipt.status);
      } catch (err) {
        assert.include(err.message, "revert");
        // TODO: infamous issue #99
        //assert.include(err.message, "User must have a non-zero deposit")
      }
    });

    it("withdrawFromSP(): reverts when amount > 0 and system has an undercollateralized trove", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });

      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);

      const alice_initialDeposit = (await stabilityPool.deposits(alice.address))[0].toString();
      assert.equal(alice_initialDeposit, dec(100, 18));

      // defaulter opens trove
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // FIL drops, defaulter is in liquidation range (but not liquidated yet)
      await priceFeed.setPrice(dec(100, 18));

      await th.assertRevert(stabilityPool.connect(alice).withdrawFromSP(dec(100, 18)));
    });

    it("withdrawFromSP(): partial retrieval - retrieves correct DebtToken amount and the entire FIL Gain, and updates deposit", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1, 24)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // 2 Troves opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 users with Trove with 170 DebtToken drawn are closed
      const liquidationTX_1 = await troveManager.connect(owner).liquidate(defaulter_1.address); // 170 DebtToken closed
      const liquidationTX_2 = await troveManager.connect(owner).liquidate(defaulter_2.address); // 170 DebtToken closed

      const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(liquidationTX_1);
      const [liquidatedDebt_2] = await th.getEmittedLiquidationValues(liquidationTX_2);

      // Alice DebtTokenLoss is ((15000/200000) * liquidatedDebt), for each liquidation
      const expectedDebtTokenLoss_A = liquidatedDebt_1
        .mul(toBN(dec(15000, 18)))
        .div(toBN(dec(200000, 18)))
        .add(liquidatedDebt_2.mul(toBN(dec(15000, 18))).div(toBN(dec(200000, 18))));

      const expectedCompoundedDebtTokenDeposit_A = toBN(dec(15000, 18)).sub(
        expectedDebtTokenLoss_A,
      );
      const compoundedDebtTokenDeposit_A = await stabilityPool.getCompoundedDebtTokenDeposit(
        alice.address,
      );

      assert.isAtMost(
        th.getDifference(expectedCompoundedDebtTokenDeposit_A, compoundedDebtTokenDeposit_A),
        100000,
      );

      // Alice retrieves part of her entitled DebtToken: 9000 DebtToken
      await stabilityPool.connect(alice).withdrawFromSP(dec(9000, 18));

      const expectedNewDeposit_A = compoundedDebtTokenDeposit_A.sub(toBN(dec(9000, 18)));

      // check Alice's deposit has been updated to equal her compounded deposit minus her withdrawal */
      const newDeposit = (await stabilityPool.deposits(alice.address))[0].toString();
      assert.isAtMost(th.getDifference(newDeposit, expectedNewDeposit_A), 100000);

      // Expect Alice has withdrawn all FIL gain
      const alice_pendingFILGain = await stabilityPool.getDepositorFILGain(alice.address);
      assert.equal(alice_pendingFILGain, 0);
    });

    it("withdrawFromSP(): partial retrieval - leaves the correct amount of DebtToken in the Stability Pool", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1, 24)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // 2 Troves opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });
      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      const SP_debtToken_Before = await stabilityPool.getTotalDebtTokenDeposits();
      assert.equal(SP_debtToken_Before, dec(200000, 18));

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 users liquidated
      const liquidationTX_1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const liquidationTX_2 = await troveManager.connect(owner).liquidate(defaulter_2.address);

      const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(liquidationTX_1);
      const [liquidatedDebt_2] = await th.getEmittedLiquidationValues(liquidationTX_2);

      // Alice retrieves part of her entitled DebtToken: 9000 DebtToken
      await stabilityPool.connect(alice).withdrawFromSP(dec(9000, 18));

      /* Check SP has reduced from 2 liquidations and Alice's withdrawal
      Expect DebtToken in SP = (200000 - liquidatedDebt_1 - liquidatedDebt_2 - 9000) */
      const expectedspDebtToken = toBN(dec(200000, 18))
        .sub(toBN(liquidatedDebt_1))
        .sub(toBN(liquidatedDebt_2))
        .sub(toBN(dec(9000, 18)));

      const SP_debtToken_After = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

      th.assertIsApproximatelyEqual(SP_debtToken_After, expectedspDebtToken);
    });

    it("withdrawFromSP(): full retrieval - leaves the correct amount of DebtToken in the Stability Pool", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // 2 Troves opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // --- TEST ---

      // Alice makes deposit #1
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      const SP_debtToken_Before = await stabilityPool.getTotalDebtTokenDeposits();
      assert.equal(SP_debtToken_Before, dec(200000, 18));

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 defaulters liquidated
      const liquidationTX_1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const liquidationTX_2 = await troveManager.connect(owner).liquidate(defaulter_2.address);

      const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(liquidationTX_1);
      const [liquidatedDebt_2] = await th.getEmittedLiquidationValues(liquidationTX_2);

      // Alice DebtTokenLoss is ((15000/200000) * liquidatedDebt), for each liquidation
      const expectedDebtTokenLoss_A = liquidatedDebt_1
        .mul(toBN(dec(15000, 18)))
        .div(toBN(dec(200000, 18)))
        .add(liquidatedDebt_2.mul(toBN(dec(15000, 18))).div(toBN(dec(200000, 18))));

      const expectedCompoundedDebtTokenDeposit_A = toBN(dec(15000, 18)).sub(
        expectedDebtTokenLoss_A,
      );
      const compoundedDebtTokenDeposit_A = await stabilityPool.getCompoundedDebtTokenDeposit(
        alice.address,
      );

      assert.isAtMost(
        th.getDifference(expectedCompoundedDebtTokenDeposit_A, compoundedDebtTokenDeposit_A),
        100000,
      );

      const DebtTokenInSPBefore = await stabilityPool.getTotalDebtTokenDeposits();

      // Alice retrieves all of her entitled DebtToken:
      await stabilityPool.connect(alice).withdrawFromSP(dec(15000, 18));

      const expectedDebtTokenInSPAfter = DebtTokenInSPBefore.sub(compoundedDebtTokenDeposit_A);

      const DebtTokenInSPAfter = await stabilityPool.getTotalDebtTokenDeposits();
      assert.isAtMost(th.getDifference(expectedDebtTokenInSPAfter, DebtTokenInSPAfter), 100000);
    });

    it("withdrawFromSP(): Subsequent deposit and withdrawal attempt from same account, with no intermediate liquidations, withdraws zero FIL", async () => {
      // --- SETUP ---
      // Whale deposits 1850 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(18500, 18), frontEnd_1.address);

      // 2 defaulters open
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Alice retrieves all of her entitled DebtToken:
      await stabilityPool.connect(alice).withdrawFromSP(dec(15000, 18));
      assert.equal(await stabilityPool.getDepositorFILGain(alice.address), 0);

      // Alice makes second deposit
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      assert.equal(await stabilityPool.getDepositorFILGain(alice.address), 0);

      const FILinSP_Before = (await stabilityPool.getFIL()).toString();

      // Alice attempts second withdrawal
      await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      assert.equal(await stabilityPool.getDepositorFILGain(alice.address), 0);

      // Check FIL in pool does not change
      const FILinSP_1 = (await stabilityPool.getFIL()).toString();
      assert.equal(FILinSP_Before, FILinSP_1);

      // Third deposit
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      assert.equal(await stabilityPool.getDepositorFILGain(alice.address), 0);

      // Alice attempts third withdrawal (this time, frm SP to Trove)
      const txPromise_A = stabilityPool
        .connect(alice)
        .withdrawFILGainToTrove(alice.address, alice.address);
      await th.assertRevert(txPromise_A);
    });

    it("withdrawFromSP(): it correctly updates the user's DebtToken and FIL snapshots of entitled reward per unit staked", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // 2 defaulters open
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // check 'Before' snapshots
      const alice_snapshot_Before = await stabilityPool.depositSnapshots(alice.address);
      const alice_snapshot_S_Before = alice_snapshot_Before[0].toString();
      const alice_snapshot_P_Before = alice_snapshot_Before[1].toString();
      assert.equal(alice_snapshot_S_Before, 0);
      assert.equal(alice_snapshot_P_Before, "1000000000000000000");

      // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // 2 defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Alice retrieves part of her entitled DebtToken: 9000 DebtToken
      await stabilityPool.connect(alice).withdrawFromSP(dec(9000, 18));

      const P = (await stabilityPool.P()).toString();
      const S = (await stabilityPool.epochToScaleToSum(0, 0)).toString();
      // check 'After' snapshots
      const alice_snapshot_After = await stabilityPool.depositSnapshots(alice.address);
      const alice_snapshot_S_After = alice_snapshot_After[0].toString();
      const alice_snapshot_P_After = alice_snapshot_After[1].toString();
      assert.equal(alice_snapshot_S_After, S);
      assert.equal(alice_snapshot_P_After, P);
    });

    it("withdrawFromSP(): decreases StabilityPool FIL", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // 1 defaulter opens
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // price drops: defaulter's Trove falls below MCR, alice and whale Trove remain active
      await priceFeed.setPrice("100000000000000000000");

      // defaulter's Trove is closed.
      const liquidationTx_1 = await troveManager.connect(owner).liquidate(defaulter_1.address); // 180 DebtToken closed
      const [, liquidatedColl] = await th.getEmittedLiquidationValues(liquidationTx_1);

      //Get ActivePool and StabilityPool Ether before retrieval:
      const active_FIL_Before = await activePool.getFIL();
      const stability_FIL_Before = await stabilityPool.getFIL();

      // Expect alice to be entitled to 15000/200000 of the liquidated coll
      const aliceExpectedFILGain = liquidatedColl
        .mul(toBN(dec(15000, 18)))
        .div(toBN(dec(200000, 18)));
      const aliceFILGain = await stabilityPool.getDepositorFILGain(alice.address);
      assert.isTrue(aliceExpectedFILGain.eq(aliceFILGain));

      // Alice retrieves all of her deposit
      await stabilityPool.connect(alice).withdrawFromSP(dec(15000, 18));

      const active_FIL_After = await activePool.getFIL();
      const stability_FIL_After = await stabilityPool.getFIL();

      const active_FIL_Difference = active_FIL_Before.sub(active_FIL_After);
      const stability_FIL_Difference = stability_FIL_Before.sub(stability_FIL_After);

      assert.equal(active_FIL_Difference, "0");

      // Expect StabilityPool to have decreased by Alice's FILGain
      assert.isAtMost(th.getDifference(stability_FIL_Difference, aliceFILGain), 10000);
    });

    it("withdrawFromSP(): All depositors are able to withdraw from the SP to their account", async () => {
      // Whale opens trove
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } });

      // 1 defaulter open
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // 6 Accounts open troves and provide to SP
      const depositors = [alice, bob, carol, dennis, erin, flyn];
      for (account of depositors) {
        await openTrove({
          extraDebtTokenAmount: toBN(dec(10000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: account },
        });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), frontEnd_1.address);
      }

      await priceFeed.setPrice(dec(105, 18));
      await troveManager.liquidate(defaulter_1.address);

      await priceFeed.setPrice(dec(200, 18));

      // All depositors attempt to withdraw
      await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");
      await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");
      await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");
      await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");
      await stabilityPool.connect(erin).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");
      await stabilityPool.connect(flyn).withdrawFromSP(dec(10000, 18));
      assert.equal((await stabilityPool.deposits(alice.address))[0].toString(), "0");

      const totalDeposits = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

      assert.isAtMost(th.getDifference(totalDeposits, "0"), 100000);
    });

    it("withdrawFromSP(): increases depositor's DebtToken token balance by the expected amount", async () => {
      // Whale opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // 1 defaulter opens trove
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      const defaulterDebt = (await troveManager.getEntireDebtAndColl(defaulter_1.address))[0];

      // 6 Accounts open troves and provide to SP
      const depositors = [alice, bob, carol, dennis, erin, flyn];
      for (account of depositors) {
        await openTrove({
          extraDebtTokenAmount: toBN(dec(10000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: account },
        });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), frontEnd_1.address);
      }

      await priceFeed.setPrice(dec(105, 18));
      await troveManager.liquidate(defaulter_1.address);

      const aliceBalBefore = await debtToken.balanceOf(alice.address);
      const bobBalBefore = await debtToken.balanceOf(bob.address);

      /* From an offset of 10000 DebtToken, each depositor receives
      DebtTokenLoss = 1666.6666666666666666 DebtToken

      and thus with a deposit of 10000 DebtToken, each should withdraw 8333.3333333333333333 DebtToken (in practice, slightly less due to rounding error)
      */

      // Price bounces back to $200 per FIL
      await priceFeed.setPrice(dec(200, 18));

      // Bob issues a further 5000 DebtToken from his trove
      await borrowerOperations
        .connect(bob)
        .withdrawDebtToken(th._100pct, dec(5000, 18), bob.address, bob.address);

      // Expect Alice's DebtToken balance increase be very close to 8333.3333333333333333 DebtToken
      await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const aliceBalance = await debtToken.balanceOf(alice.address);

      assert.isAtMost(
        th.getDifference(aliceBalance.sub(aliceBalBefore), "8333333333333333333333"),
        100000,
      );

      // expect Bob's DebtToken balance increase to be very close to  13333.33333333333333333 DebtToken
      await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const bobBalance = await debtToken.balanceOf(bob.address);
      assert.isAtMost(
        th.getDifference(bobBalance.sub(bobBalBefore), "13333333333333333333333"),
        100000,
      );
    });

    it("withdrawFromSP(): doesn't impact other users Stability deposits or FIL gains", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), frontEnd_1.address);

      // Would-be defaulters open troves
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      // Defaulters are liquidated
      await troveManager.liquidate(defaulter_1.address);
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      const alice_debtTokenDeposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      const bob_debtTokenDeposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();

      const alice_FILGain_Before = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();
      const bob_FILGain_Before = (await stabilityPool.getDepositorFILGain(bob.address)).toString();

      //check non-zero DebtToken and FILGain in the Stability Pool
      const DebtTokenInSP = await stabilityPool.getTotalDebtTokenDeposits();
      const FILinSP = await stabilityPool.getFIL();
      assert.isTrue(DebtTokenInSP.gt(mv._zeroBN));
      assert.isTrue(FILinSP.gt(mv._zeroBN));

      // Price rises
      await priceFeed.setPrice(dec(200, 18));

      // Carol withdraws her Stability deposit
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), dec(30000, 18));
      await stabilityPool.connect(carol).withdrawFromSP(dec(30000, 18));
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), "0");

      const alice_debtTokenDeposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      const bob_debtTokenDeposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();

      const alice_FILGain_After = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();
      const bob_FILGain_After = (await stabilityPool.getDepositorFILGain(bob.address)).toString();

      // Check compounded deposits and FIL gains for A and B have not changed
      assert.equal(alice_debtTokenDeposit_Before, alice_debtTokenDeposit_After);
      assert.equal(bob_debtTokenDeposit_Before, bob_debtTokenDeposit_After);

      assert.equal(alice_FILGain_Before, alice_FILGain_After);
      assert.equal(bob_FILGain_Before, bob_FILGain_After);
    });

    it("withdrawFromSP(): doesn't impact system debt, collateral or TCR ", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), frontEnd_1.address);

      // Would-be defaulters open troves
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      // Defaulters are liquidated
      await troveManager.liquidate(defaulter_1.address);
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      // Price rises
      await priceFeed.setPrice(dec(200, 18));

      const activeDebt_Before = (await activePool.getDebt()).toString();
      const defaultedDebt_Before = (await defaultPool.getDebt()).toString();
      const activeColl_Before = (await activePool.getFIL()).toString();
      const defaultedColl_Before = (await defaultPool.getFIL()).toString();
      const TCR_Before = (await th.getTCR(contracts)).toString();

      // Carol withdraws her Stability deposit
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), dec(30000, 18));
      await stabilityPool.connect(carol).withdrawFromSP(dec(30000, 18));
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), "0");

      const activeDebt_After = (await activePool.getDebt()).toString();
      const defaultedDebt_After = (await defaultPool.getDebt()).toString();
      const activeColl_After = (await activePool.getFIL()).toString();
      const defaultedColl_After = (await defaultPool.getFIL()).toString();
      const TCR_After = (await th.getTCR(contracts)).toString();

      // Check total system debt, collateral and TCR have not changed after a Stability deposit is made
      assert.equal(activeDebt_Before, activeDebt_After);
      assert.equal(defaultedDebt_Before, defaultedDebt_After);
      assert.equal(activeColl_Before, activeColl_After);
      assert.equal(defaultedColl_Before, defaultedColl_After);
      assert.equal(TCR_Before, TCR_After);
    });

    it("withdrawFromSP(): doesn't impact any troves, including the caller's trove", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A, B and C provide to SP
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), frontEnd_1.address);

      // Price drops
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();

      // Get debt, collateral and ICR of all existing troves
      const whale_Debt_Before = (await troveManager.Troves(whale.address))[0].toString();
      const alice_Debt_Before = (await troveManager.Troves(alice.address))[0].toString();
      const bob_Debt_Before = (await troveManager.Troves(bob.address))[0].toString();
      const carol_Debt_Before = (await troveManager.Troves(carol.address))[0].toString();

      const whale_Coll_Before = (await troveManager.Troves(whale.address))[1].toString();
      const alice_Coll_Before = (await troveManager.Troves(alice.address))[1].toString();
      const bob_Coll_Before = (await troveManager.Troves(bob.address))[1].toString();
      const carol_Coll_Before = (await troveManager.Troves(carol.address))[1].toString();

      const whale_ICR_Before = (await troveManager.getCurrentICR(whale.address, price)).toString();
      const alice_ICR_Before = (await troveManager.getCurrentICR(alice.address, price)).toString();
      const bob_ICR_Before = (await troveManager.getCurrentICR(bob.address, price)).toString();
      const carol_ICR_Before = (await troveManager.getCurrentICR(carol.address, price)).toString();

      // price rises
      await priceFeed.setPrice(dec(200, 18));

      // Carol withdraws her Stability deposit
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), dec(30000, 18));
      await stabilityPool.connect(carol).withdrawFromSP(dec(30000, 18));
      assert.equal((await stabilityPool.deposits(carol.address))[0].toString(), "0");

      const whale_Debt_After = (await troveManager.Troves(whale.address))[0].toString();
      const alice_Debt_After = (await troveManager.Troves(alice.address))[0].toString();
      const bob_Debt_After = (await troveManager.Troves(bob.address))[0].toString();
      const carol_Debt_After = (await troveManager.Troves(carol.address))[0].toString();

      const whale_Coll_After = (await troveManager.Troves(whale.address))[1].toString();
      const alice_Coll_After = (await troveManager.Troves(alice.address))[1].toString();
      const bob_Coll_After = (await troveManager.Troves(bob.address))[1].toString();
      const carol_Coll_After = (await troveManager.Troves(carol.address))[1].toString();

      const whale_ICR_After = (await troveManager.getCurrentICR(whale.address, price)).toString();
      const alice_ICR_After = (await troveManager.getCurrentICR(alice.address, price)).toString();
      const bob_ICR_After = (await troveManager.getCurrentICR(bob.address, price)).toString();
      const carol_ICR_After = (await troveManager.getCurrentICR(carol.address, price)).toString();

      // Check all troves are unaffected by Carol's Stability deposit withdrawal
      assert.equal(whale_Debt_Before, whale_Debt_After);
      assert.equal(alice_Debt_Before, alice_Debt_After);
      assert.equal(bob_Debt_Before, bob_Debt_After);
      assert.equal(carol_Debt_Before, carol_Debt_After);

      assert.equal(whale_Coll_Before, whale_Coll_After);
      assert.equal(alice_Coll_Before, alice_Coll_After);
      assert.equal(bob_Coll_Before, bob_Coll_After);
      assert.equal(carol_Coll_Before, carol_Coll_After);

      assert.equal(whale_ICR_Before, whale_ICR_After);
      assert.equal(alice_ICR_Before, alice_ICR_After);
      assert.equal(bob_ICR_Before, bob_ICR_After);
      assert.equal(carol_ICR_Before, carol_ICR_After);
    });

    it("withdrawFromSP(): succeeds when amount is 0 and system has an undercollateralized trove", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });

      await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address);

      const A_initialDeposit = (await stabilityPool.deposits(A.address))[0].toString();
      assert.equal(A_initialDeposit, dec(100, 18));

      // defaulters opens trove
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });

      // FIL drops, defaulters are in liquidation range
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();
      assert.isTrue(await th.ICRbetween100and110(defaulter_1, troveManager, price));

      await th.fastForwardTime(timeValues.MINUTES_IN_ONE_WEEK, web3.currentProvider);

      // Liquidate d1
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Check d2 is undercollateralized
      assert.isTrue(await th.ICRbetween100and110(defaulter_2, troveManager, price));
      assert.isTrue(await sortedTroves.contains(defaulter_2.address));

      const A_FILBalBefore = toBN(await web3.eth.getBalance(A.address));
      const A_protocolTokenBalBefore = await protocolToken.balanceOf(A.address);

      // Check Alice has gains to withdraw
      const A_pendingFILGain = await stabilityPool.getDepositorFILGain(A.address);
      const A_pendingProtocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(
        A.address,
      );
      assert.isTrue(A_pendingFILGain.gt(toBN("0")));
      assert.isTrue(A_pendingProtocolTokenGain.gt(toBN("0")));

      // Check withdrawal of 0 succeeds
      const tx = await stabilityPool.connect(A).withdrawFromSP(0, { gasPrice: GAS_PRICE });
      const receipt = await tx.wait();
      assert.equal(receipt.status, 1);

      const A_expectedBalance = A_FILBalBefore.sub(toBN((await th.gasUsed(tx)) * GAS_PRICE));

      const A_FILBalAfter = toBN(await web3.eth.getBalance(A.address));

      const A_protocolTokenBalAfter = await protocolToken.balanceOf(A.address);
      const A_protocolTokenBalDiff = A_protocolTokenBalAfter.sub(A_protocolTokenBalBefore);

      // Check A's FIL and ProtocolToken balances have increased correctly
      assert.isTrue(A_FILBalAfter.sub(A_expectedBalance).eq(A_pendingFILGain));
      assert.isAtMost(th.getDifference(A_protocolTokenBalDiff, A_pendingProtocolTokenGain), 1000);
    });

    it("withdrawFromSP(): withdrawing 0 DebtToken doesn't alter the caller's deposit or the total DebtToken in the Stability Pool", async () => {
      // --- SETUP ---
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A, B, C provides 100, 50, 30 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(50, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30, 18), frontEnd_1.address);

      const bob_Deposit_Before = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();
      const DebtTokenInSP_Before = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

      assert.equal(DebtTokenInSP_Before, dec(180, 18));

      // Bob withdraws 0 DebtToken from the Stability Pool
      await stabilityPool.connect(bob).withdrawFromSP(0);

      // check Bob's deposit and total DebtToken in Stability Pool has not changed
      const bob_Deposit_After = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();
      const DebtTokenInSP_After = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

      assert.equal(bob_Deposit_Before, bob_Deposit_After);
      assert.equal(DebtTokenInSP_Before, DebtTokenInSP_After);
    });

    it("withdrawFromSP(): withdrawing 0 FIL Gain does not alter the caller's FIL balance, their trove collateral, or the FIL  in the Stability Pool", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // Would-be defaulter open trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      assert.isFalse(await th.checkRecoveryMode(contracts));

      // Defaulter 1 liquidated, full offset
      await troveManager.liquidate(defaulter_1.address);

      // Dennis opens trove and deposits to Stability Pool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: dennis },
      });
      await stabilityPool.connect(dennis).provideToSP(dec(100, 18), frontEnd_1.address);

      // Check Dennis has 0 FILGain
      const dennis_FILGain = (await stabilityPool.getDepositorFILGain(dennis.address)).toString();
      assert.equal(dennis_FILGain, "0");

      const dennis_FILBalance_Before = web3.eth.getBalance(dennis.address).toString();
      const dennis_Collateral_Before = (await troveManager.Troves(dennis.address))[1].toString();
      const FILinSP_Before = (await stabilityPool.getFIL()).toString();

      await priceFeed.setPrice(dec(200, 18));

      // Dennis withdraws his full deposit and FILGain to his account
      await stabilityPool.connect(dennis).withdrawFromSP(dec(100, 18), { gasPrice: GAS_PRICE });

      // Check withdrawal does not alter Dennis' FIL balance or his trove's collateral
      const dennis_FILBalance_After = web3.eth.getBalance(dennis.address).toString();
      const dennis_Collateral_After = (await troveManager.Troves(dennis.address))[1].toString();
      const FILinSP_After = (await stabilityPool.getFIL()).toString();

      assert.equal(dennis_FILBalance_Before, dennis_FILBalance_After);
      assert.equal(dennis_Collateral_Before, dennis_Collateral_After);

      // Check withdrawal has not altered the FIL in the Stability Pool
      assert.equal(FILinSP_Before, FILinSP_After);
    });

    it("withdrawFromSP(): Request to withdraw > caller's deposit only withdraws the caller's compounded deposit", async () => {
      // --- SETUP ---
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });

      // A, B, C provide DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), frontEnd_1.address);

      // Price drops
      await priceFeed.setPrice(dec(105, 18));

      // Liquidate defaulter 1
      await troveManager.liquidate(defaulter_1.address);

      const alice_debtToken_Balance_Before = await debtToken.balanceOf(alice.address);
      const bob_debtToken_Balance_Before = await debtToken.balanceOf(bob.address);

      const alice_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(alice.address);
      const bob_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(bob.address);

      const DebtTokenInSP_Before = await stabilityPool.getTotalDebtTokenDeposits();

      await priceFeed.setPrice(dec(200, 18));

      // Bob attempts to withdraws 1 wei more than his compounded deposit from the Stability Pool
      await stabilityPool.connect(bob).withdrawFromSP(bob_Deposit_Before.add(toBN(1)));

      // Check Bob's DebtToken balance has risen by only the value of his compounded deposit
      const bob_expectedDebtTokenBalance = bob_debtToken_Balance_Before
        .add(bob_Deposit_Before)
        .toString();
      const bob_debtToken_Balance_After = (await debtToken.balanceOf(bob.address)).toString();
      assert.equal(bob_debtToken_Balance_After, bob_expectedDebtTokenBalance);

      // Alice attempts to withdraws 2309842309.000000000000000000 DebtToken from the Stability Pool
      await stabilityPool.connect(alice).withdrawFromSP("2309842309000000000000000000");

      // Check Alice's DebtToken balance has risen by only the value of her compounded deposit
      const alice_expectedDebtTokenBalance = alice_debtToken_Balance_Before
        .add(alice_Deposit_Before)
        .toString();
      const alice_debtToken_Balance_After = (await debtToken.balanceOf(alice.address)).toString();
      assert.equal(alice_debtToken_Balance_After, alice_expectedDebtTokenBalance);

      // Check DebtToken in Stability Pool has been reduced by only Alice's compounded deposit and Bob's compounded deposit
      const expectedDebtTokenInSP = DebtTokenInSP_Before.sub(alice_Deposit_Before)
        .sub(bob_Deposit_Before)
        .toString();
      const DebtTokenInSP_After = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
      assert.equal(DebtTokenInSP_After, expectedDebtTokenInSP);
    });

    it("withdrawFromSP(): Request to withdraw 2^256-1 DebtToken only withdraws the caller's compounded deposit", async () => {
      // --- SETUP ---
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      // A, B, C open troves
      // A, B, C open troves
      // A, B, C open troves
      // A, B, C open troves
      // A, B, C open troves
      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // A, B, C provides 100, 50, 30 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(100, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(50, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(30, 18), frontEnd_1.address);

      // Price drops
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate defaulter 1
      await troveManager.liquidate(defaulter_1.address);

      const bob_debtToken_Balance_Before = await debtToken.balanceOf(bob.address);

      const bob_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(bob.address);

      const DebtTokenInSP_Before = await stabilityPool.getTotalDebtTokenDeposits();

      const maxBytes32 = toBN("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

      // Price drops
      await priceFeed.setPrice(dec(200, 18));

      // Bob attempts to withdraws maxBytes32 DebtToken from the Stability Pool
      await stabilityPool.connect(bob).withdrawFromSP(maxBytes32);

      // Check Bob's DebtToken balance has risen by only the value of his compounded deposit
      const bob_expectedDebtTokenBalance = bob_debtToken_Balance_Before
        .add(bob_Deposit_Before)
        .toString();
      const bob_debtToken_Balance_After = (await debtToken.balanceOf(bob.address)).toString();
      assert.equal(bob_debtToken_Balance_After, bob_expectedDebtTokenBalance);

      // Check DebtToken in Stability Pool has been reduced by only  Bob's compounded deposit
      const expectedDebtTokenInSP = DebtTokenInSP_Before.sub(bob_Deposit_Before).toString();
      const DebtTokenInSP_After = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
      assert.equal(DebtTokenInSP_After, expectedDebtTokenInSP);
    });

    it("withdrawFromSP(): caller can withdraw full deposit and FIL gain during Recovery Mode", async () => {
      // --- SETUP ---

      // Price doubles
      await priceFeed.setPrice(dec(400, 18));
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: whale },
      });
      // Price halves
      await priceFeed.setPrice(dec(200, 18));

      // A, B, C open troves and make Stability Pool deposits
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(4, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(4, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(4, 18)),
        extraParams: { from: carol },
      });

      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      // A, B, C provides 10000, 5000, 3000 DebtToken to SP
      const A_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const B_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(bob).provideToSP(dec(5000, 18), frontEnd_1.address, {
          gasPrice: GAS_PRICE,
        }),
      );
      const C_GAS_Used = await th.gasUsed(
        await stabilityPool.connect(carol).provideToSP(dec(3000, 18), frontEnd_1.address, {
          gasPrice: GAS_PRICE,
        }),
      );

      // Price drops
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();

      assert.isTrue(await th.checkRecoveryMode(contracts));

      // Liquidate defaulter 1
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      const alice_debtToken_Balance_Before = await debtToken.balanceOf(alice.address);
      const bob_debtToken_Balance_Before = await debtToken.balanceOf(bob.address);
      const carol_debtToken_Balance_Before = await debtToken.balanceOf(carol.address);

      const alice_FIL_Balance_Before = toBN(await web3.eth.getBalance(alice.address));
      const bob_FIL_Balance_Before = toBN(await web3.eth.getBalance(bob.address));
      const carol_FIL_Balance_Before = toBN(await web3.eth.getBalance(carol.address));

      const alice_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(alice.address);
      const bob_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(bob.address);
      const carol_Deposit_Before = await stabilityPool.getCompoundedDebtTokenDeposit(carol.address);

      const alice_FILGain_Before = await stabilityPool.getDepositorFILGain(alice.address);
      const bob_FILGain_Before = await stabilityPool.getDepositorFILGain(bob.address);
      const carol_FILGain_Before = await stabilityPool.getDepositorFILGain(carol.address);

      const DebtTokenInSP_Before = await stabilityPool.getTotalDebtTokenDeposits();

      // Price rises
      await priceFeed.setPrice(dec(220, 18));

      assert.isTrue(await th.checkRecoveryMode(contracts));

      // A, B, C withdraw their full deposits from the Stability Pool
      const A_GAS_Deposit = await th.gasUsed(
        await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18), { gasPrice: GAS_PRICE }),
      );
      const B_GAS_Deposit = await th.gasUsed(
        await stabilityPool.connect(bob).withdrawFromSP(dec(5000, 18), { gasPrice: GAS_PRICE }),
      );
      const C_GAS_Deposit = await th.gasUsed(
        await stabilityPool.connect(carol).withdrawFromSP(dec(3000, 18), { gasPrice: GAS_PRICE }),
      );

      // Check DebtToken balances of A, B, C have risen by the value of their compounded deposits, respectively
      const alice_expectedDebtTokenBalance = alice_debtToken_Balance_Before
        .add(alice_Deposit_Before)
        .toString();

      const bob_expectedDebtTokenBalance = bob_debtToken_Balance_Before
        .add(bob_Deposit_Before)
        .toString();
      const carol_expectedDebtTokenBalance = carol_debtToken_Balance_Before
        .add(carol_Deposit_Before)
        .toString();

      const alice_debtToken_Balance_After = (await debtToken.balanceOf(alice.address)).toString();

      const bob_debtToken_Balance_After = (await debtToken.balanceOf(bob.address)).toString();
      const carol_debtToken_Balance_After = (await debtToken.balanceOf(carol.address)).toString();

      assert.equal(alice_debtToken_Balance_After, alice_expectedDebtTokenBalance);
      assert.equal(bob_debtToken_Balance_After, bob_expectedDebtTokenBalance);
      assert.equal(carol_debtToken_Balance_After, carol_expectedDebtTokenBalance);

      // Check FIL balances of A, B, C have increased by the value of their FIL gain from liquidations, respectively
      const alice_expectedFILBalance = alice_FIL_Balance_Before
        .add(alice_FILGain_Before)
        .toString();
      const bob_expectedFILBalance = bob_FIL_Balance_Before.add(bob_FILGain_Before).toString();
      const carol_expectedFILBalance = carol_FIL_Balance_Before
        .add(carol_FILGain_Before)
        .toString();

      const alice_FILBalance_After = (await web3.eth.getBalance(alice.address)).toString();
      const bob_FILBalance_After = (await web3.eth.getBalance(bob.address)).toString();
      const carol_FILBalance_After = (await web3.eth.getBalance(carol.address)).toString();

      // FIL balances before minus gas used
      const alice_FILBalance_After_Gas = alice_FILBalance_After - A_GAS_Used;
      const bob_FILBalance_After_Gas = bob_FILBalance_After - B_GAS_Used;
      const carol_FILBalance_After_Gas = carol_FILBalance_After - C_GAS_Used;

      assert.equal(alice_expectedFILBalance, alice_FILBalance_After_Gas);
      assert.equal(bob_expectedFILBalance, bob_FILBalance_After_Gas);
      assert.equal(carol_expectedFILBalance, carol_FILBalance_After_Gas);

      // Check DebtToken in Stability Pool has been reduced by A, B and C's compounded deposit
      const expectedDebtTokenInSP = DebtTokenInSP_Before.sub(alice_Deposit_Before)
        .sub(bob_Deposit_Before)
        .sub(carol_Deposit_Before)
        .toString();
      const DebtTokenInSP_After = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
      assert.equal(DebtTokenInSP_After, expectedDebtTokenInSP);

      // Check FIL in SP has reduced to zero
      const FILinSP_After = (await stabilityPool.getFIL()).toString();
      assert.isAtMost(th.getDifference(FILinSP_After, "0"), 100000);
    });

    it("getDepositorFILGain(): depositor does not earn further FIL gains from liquidations while their compounded deposit == 0: ", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1, 24)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // defaulters open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: defaulter_1 },
      });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_2 } });
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_3 } });

      // A, B, provide 10000, 5000 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(5000, 18), frontEnd_1.address);

      //price drops
      await priceFeed.setPrice(dec(105, 18));

      // Liquidate defaulter 1. Empties the Pool
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      const DebtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
      assert.equal(DebtTokenInSP, "0");

      // Check Stability deposits have been fully cancelled with debt, and are now all zero
      const alice_Deposit = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      const bob_Deposit = (
        await stabilityPool.getCompoundedDebtTokenDeposit(bob.address)
      ).toString();

      assert.equal(alice_Deposit, "0");
      assert.equal(bob_Deposit, "0");

      // Get FIL gain for A and B
      const alice_FILGain_1 = (await stabilityPool.getDepositorFILGain(alice.address)).toString();
      const bob_FILGain_1 = (await stabilityPool.getDepositorFILGain(bob.address)).toString();

      // Whale deposits 10000 DebtToken to Stability Pool
      await stabilityPool.connect(whale).provideToSP(dec(1, 24), frontEnd_1.address);

      // Liquidation 2
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      // Check Alice and Bob have not received FIL gain from liquidation 2 while their deposit was 0
      const alice_FILGain_2 = (await stabilityPool.getDepositorFILGain(alice.address)).toString();
      const bob_FILGain_2 = (await stabilityPool.getDepositorFILGain(bob.address)).toString();

      assert.equal(alice_FILGain_1, alice_FILGain_2);
      assert.equal(bob_FILGain_1, bob_FILGain_2);

      // Liquidation 3
      await troveManager.liquidate(defaulter_3.address);
      assert.isFalse(await sortedTroves.contains(defaulter_3.address));

      // Check Alice and Bob have not received FIL gain from liquidation 3 while their deposit was 0
      const alice_FILGain_3 = (await stabilityPool.getDepositorFILGain(alice.address)).toString();
      const bob_FILGain_3 = (await stabilityPool.getDepositorFILGain(bob.address)).toString();

      assert.equal(alice_FILGain_1, alice_FILGain_3);
      assert.equal(bob_FILGain_1, bob_FILGain_3);
    });

    // --- ProtocolToken functionality ---
    it("withdrawFromSP(): triggers ProtocolToken reward event - increases the sum G", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1, 24)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A and B provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      const G_Before = await stabilityPool.epochToScaleToG(0, 0);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A withdraws from SP
      await stabilityPool.connect(A).withdrawFromSP(dec(5000, 18));

      const G_1 = await stabilityPool.epochToScaleToG(0, 0);

      // Expect G has increased from the ProtocolToken reward event triggered
      assert.isTrue(G_1.gt(G_Before));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A withdraws from SP
      await stabilityPool.connect(B).withdrawFromSP(dec(5000, 18));

      const G_2 = await stabilityPool.epochToScaleToG(0, 0);

      // Expect G has increased from the ProtocolToken reward event triggered
      assert.isTrue(G_2.gt(G_1));
    });

    it("withdrawFromSP(), partial withdrawal: doesn't change the front end tag", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // whale transfer to troves D and E
      await debtToken.connect(whale).transfer(D.address, dec(100, 18));
      await debtToken.connect(whale).transfer(E.address, dec(200, 18));

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, D, E provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).provideToSP(dec(40, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(50, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // A, B, C, D, E withdraw, from different front ends
      await stabilityPool.connect(A).withdrawFromSP(dec(5, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(10, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(15, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(20, 18));
      await stabilityPool.connect(E).withdrawFromSP(dec(25, 18));

      const frontEndTag_A = (await stabilityPool.deposits(A.address))[1];
      const frontEndTag_B = (await stabilityPool.deposits(B.address))[1];
      const frontEndTag_C = (await stabilityPool.deposits(C.address))[1];
      const frontEndTag_D = (await stabilityPool.deposits(D.address))[1];
      const frontEndTag_E = (await stabilityPool.deposits(E.address))[1];

      // Check deposits are still tagged with their original front end
      assert.equal(frontEndTag_A, frontEnd_1.address);
      assert.equal(frontEndTag_B, frontEnd_2.address);
      assert.equal(frontEndTag_C, ZERO_ADDRESS);
      assert.equal(frontEndTag_D, frontEnd_1.address);
      assert.equal(frontEndTag_E, ZERO_ADDRESS);
    });

    it("withdrawFromSP(), partial withdrawal: depositor receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get A, B, C ProtocolToken balance before
      const A_protocolTokenBalance_Before = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_Before = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_Before = await protocolToken.balanceOf(C.address);

      // A, B, C withdraw
      await stabilityPool.connect(A).withdrawFromSP(dec(1, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(2, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(3, 18));

      // Get ProtocolToken balance after
      const A_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_After = await protocolToken.balanceOf(C.address);

      // Check ProtocolToken Balance of A, B, C has increased
      assert.isTrue(A_protocolTokenBalance_After.gt(A_protocolTokenBalance_Before));
      assert.isTrue(B_protocolTokenBalance_After.gt(B_protocolTokenBalance_Before));
      assert.isTrue(C_protocolTokenBalance_After.gt(C_protocolTokenBalance_Before));
    });

    it("withdrawFromSP(), partial withdrawal: tagged front end receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get front ends' ProtocolToken balance before
      const F1_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_1.address);
      const F2_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_2.address);
      const F3_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_3.address);

      // A, B, C withdraw
      await stabilityPool.connect(A).withdrawFromSP(dec(1, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(2, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(3, 18));

      // Get front ends' ProtocolToken balance after
      const F1_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const F2_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);
      const F3_protocolTokenBalance_After = await protocolToken.balanceOf(C.address);

      // Check ProtocolToken Balance of front ends has increased
      assert.isTrue(F1_protocolTokenBalance_After.gt(F1_protocolTokenBalance_Before));
      assert.isTrue(F2_protocolTokenBalance_After.gt(F2_protocolTokenBalance_Before));
      assert.isTrue(F3_protocolTokenBalance_After.gt(F3_protocolTokenBalance_Before));
    });

    it("withdrawFromSP(), partial withdrawal: tagged front end's stake decreases", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, D, E, F open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: F },
      });

      // A, B, C, D, E, F provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_3.address);
      await stabilityPool.connect(D).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(20, 18), frontEnd_2.address);
      await stabilityPool.connect(F).provideToSP(dec(30, 18), frontEnd_3.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get front ends' stake before
      const F1_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_3.address);

      // A, B, C withdraw
      await stabilityPool.connect(A).withdrawFromSP(dec(1, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(2, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(3, 18));

      // Get front ends' stakes after
      const F1_Stake_After = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_After = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_After = await stabilityPool.frontEndStakes(frontEnd_3.address);

      // Check front ends' stakes have decreased
      assert.isTrue(F1_Stake_After.lt(F1_Stake_Before));
      assert.isTrue(F2_Stake_After.lt(F2_Stake_Before));
      assert.isTrue(F3_Stake_After.lt(F3_Stake_Before));
    });

    it("withdrawFromSP(), partial withdrawal: tagged front end's snapshots update", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(40000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(60000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // D opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---

      const deposit_A = dec(10000, 18);
      const deposit_B = dec(20000, 18);
      const deposit_C = dec(30000, 18);

      // A, B, C make their initial deposits
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      // fastforward time then make an SP deposit, to make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      await stabilityPool.connect(D).provideToSP(dec(1000, 18), ZERO_ADDRESS);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // Get front ends' snapshots before
      for (frontEnd of [frontEnd_1, frontEnd_2, frontEnd_3]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends, since S corresponds to FIL gain)
        assert.equal(snapshot[1], dec(1, 18)); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      // --- TEST ---

      await priceFeed.setPrice(dec(200, 18));

      // A, B, C top withdraw part of their deposits. Grab G at each stage, as it can increase a bit
      // between topups, because some block.timestamp time passes (and ProtocolToken is issued) between ops
      const G1 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(A).withdrawFromSP(dec(1, 18));

      const G2 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(B).withdrawFromSP(dec(2, 18));

      const G3 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(C).withdrawFromSP(dec(3, 18));

      const frontEnds = [frontEnd_1.address, frontEnd_2.address, frontEnd_3.address];
      const G_Values = [G1, G2, G3];

      // Map frontEnds to the value of G at time the deposit was made
      frontEndToG = th.zipToObject(frontEnds, G_Values);

      // Get front ends' snapshots after
      for (const [frontEnd, G] of Object.entries(frontEndToG)) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd);

        // Check snapshots are the expected values
        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends)
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].eq(G)); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("withdrawFromSP(), full withdrawal: removes deposit's front end tag", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // Whale transfers to A, B
      await debtToken.connect(whale).transfer(A.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(B.address, dec(20000, 18));

      //C, D open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(40000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      // A, B, C, D make their initial deposits
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), frontEnd_2.address);
      await stabilityPool.connect(D).provideToSP(dec(40000, 18), ZERO_ADDRESS);

      // Check deposits are tagged with correct front end
      const A_tagBefore = await getFrontEndTag(stabilityPool, A.address);
      const B_tagBefore = await getFrontEndTag(stabilityPool, B.address);
      const C_tagBefore = await getFrontEndTag(stabilityPool, C.address);
      const D_tagBefore = await getFrontEndTag(stabilityPool, D.address);

      assert.equal(A_tagBefore, frontEnd_1.address);
      assert.equal(B_tagBefore, ZERO_ADDRESS);
      assert.equal(C_tagBefore, frontEnd_2.address);
      assert.equal(D_tagBefore, ZERO_ADDRESS);

      // All depositors make full withdrawal
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(20000, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(30000, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(40000, 18));

      // Check all deposits now have no front end tag
      const A_tagAfter = await getFrontEndTag(stabilityPool, A.address);
      const B_tagAfter = await getFrontEndTag(stabilityPool, B.address);
      const C_tagAfter = await getFrontEndTag(stabilityPool, C.address);
      const D_tagAfter = await getFrontEndTag(stabilityPool, D.address);

      assert.equal(A_tagAfter, ZERO_ADDRESS);
      assert.equal(B_tagAfter, ZERO_ADDRESS);
      assert.equal(C_tagAfter, ZERO_ADDRESS);
      assert.equal(D_tagAfter, ZERO_ADDRESS);
    });

    it("withdrawFromSP(), full withdrawal: zero's depositor's snapshots", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      //  SETUP: Execute a series of operations to make G, S > 0 and P < 1

      // E opens trove and makes a deposit
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: E },
      });
      await stabilityPool.connect(E).provideToSP(dec(10000, 18), frontEnd_3.address);

      // Fast-forward time and make a second deposit, to trigger ProtocolToken reward and make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
      await stabilityPool.connect(E).provideToSP(dec(10000, 18), frontEnd_3.address);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // --- TEST ---

      // Whale transfers to A, B
      await debtToken.connect(whale).transfer(A.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(B.address, dec(20000, 18));

      await priceFeed.setPrice(dec(200, 18));

      // C, D open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(40000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: D },
      });

      // A, B, C, D make their initial deposits
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), frontEnd_2.address);
      await stabilityPool.connect(D).provideToSP(dec(40000, 18), ZERO_ADDRESS);

      // Check deposits snapshots are non-zero

      for (depositor of [A, B, C, D]) {
        const snapshot = await stabilityPool.depositSnapshots(depositor.address);

        const ZERO = toBN("0");
        // Check S,P, G snapshots are non-zero
        assert.isTrue(snapshot[0].eq(S_Before)); // S
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].gt(ZERO)); // GL increases a bit between each depositor op, so just check it is non-zero
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      // All depositors make full withdrawal
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(20000, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(30000, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(40000, 18));

      // Check all depositors' snapshots have been zero'd
      for (depositor of [A, B, C, D]) {
        const snapshot = await stabilityPool.depositSnapshots(depositor.address);

        // Check S, P, G snapshots are now zero
        assert.equal(snapshot[0], "0"); // S
        assert.equal(snapshot[1], "0"); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("withdrawFromSP(), full withdrawal that reduces front end stake to 0: zero’s the front end’s snapshots", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      //  SETUP: Execute a series of operations to make G, S > 0 and P < 1

      // E opens trove and makes a deposit
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await stabilityPool.connect(E).provideToSP(dec(10000, 18), frontEnd_3.address);

      // Fast-forward time and make a second deposit, to trigger ProtocolToken reward and make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
      await stabilityPool.connect(E).provideToSP(dec(10000, 18), frontEnd_3.address);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // --- TEST ---

      // A, B open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(40000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });

      // A, B, make their initial deposits
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), frontEnd_2.address);

      // Check frontend snapshots are non-zero
      for (frontEnd of [frontEnd_1, frontEnd_2]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        const ZERO = toBN("0");
        // Check S,P, G snapshots are non-zero
        assert.equal(snapshot[0], "0"); // S  (always zero for front-end)
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].gt(ZERO)); // GL increases a bit between each depositor op, so just check it is non-zero
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      await priceFeed.setPrice(dec(200, 18));

      // All depositors make full withdrawal
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(20000, 18));

      // Check all front ends' snapshots have been zero'd
      for (frontEnd of [frontEnd_1, frontEnd_2]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        // Check S, P, G snapshots are now zero
        assert.equal(snapshot[0], "0"); // S  (always zero for front-end)
        assert.equal(snapshot[1], "0"); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("withdrawFromSP(), reverts when initial deposit value is 0", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A opens trove and join the Stability Pool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10100, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      //  SETUP: Execute a series of operations to trigger ProtocolToken and FIL rewards for depositor A

      // Fast-forward time and make a second deposit, to trigger ProtocolToken reward and make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
      await stabilityPool.connect(A).provideToSP(dec(100, 18), frontEnd_1.address);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      await priceFeed.setPrice(dec(200, 18));

      // A successfully withraws deposit and all gains
      await stabilityPool.connect(A).withdrawFromSP(dec(10100, 18));

      // Confirm A's recorded deposit is 0
      const A_deposit = (await stabilityPool.deposits(A.address))[0]; // get initialValue property on deposit struct
      assert.equal(A_deposit, "0");

      // --- TEST ---
      const expectedRevertMessage = "StabilityPool: User must have a non-zero deposit";

      // Further withdrawal attempt from A
      const withdrawalPromise_A = stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await th.assertRevert(withdrawalPromise_A, expectedRevertMessage);

      // Withdrawal attempt of a non-existent deposit, from C
      const withdrawalPromise_C = stabilityPool.connect(C).withdrawFromSP(dec(10000, 18));
      await th.assertRevert(withdrawalPromise_C, expectedRevertMessage);
    });

    // --- withdrawFILGainToTrove ---

    it("withdrawFILGainToTrove(): reverts when user has no active deposit", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });

      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);

      const alice_initialDeposit = (await stabilityPool.deposits(alice.address))[0].toString();
      const bob_initialDeposit = (await stabilityPool.deposits(bob.address))[0].toString();

      assert.equal(alice_initialDeposit, dec(10000, 18));
      assert.equal(bob_initialDeposit, "0");

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      const txAlice = await stabilityPool
        .connect(alice)
        .withdrawFILGainToTrove(alice.address, alice.address);
      const receiptAlice = await txAlice.wait();
      assert.equal(receiptAlice.status, 1);

      const txPromise_B = stabilityPool
        .connect(bob)
        .withdrawFILGainToTrove(bob.address, bob.address);
      await th.assertRevert(txPromise_B);
    });

    it("withdrawFILGainToTrove(): Applies DebtTokenLoss to user's deposit, and redirects FIL reward to user's Trove", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // Defaulter opens trove
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // check Alice's Trove recorded FIL Before:
      const aliceTrove_Before = await troveManager.Troves(alice.address);
      const aliceTrove_FIL_Before = aliceTrove_Before[1];
      assert.isTrue(aliceTrove_FIL_Before.gt(toBN("0")));

      // price drops: defaulter's Trove falls below MCR, alice and whale Trove remain active
      await priceFeed.setPrice(dec(105, 18));

      // Defaulter's Trove is closed
      const liquidationTx_1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const [liquidatedDebt, liquidatedColl, ,] =
        await th.getEmittedLiquidationValues(liquidationTx_1);

      const FILGain_A = await stabilityPool.getDepositorFILGain(alice.address);
      const compoundedDeposit_A = await stabilityPool.getCompoundedDebtTokenDeposit(alice.address);

      // Alice should receive rewards proportional to her deposit as share of total deposits
      const expectedFILGain_A = liquidatedColl.mul(toBN(dec(15000, 18))).div(toBN(dec(200000, 18)));
      const expectedDebtTokenLoss_A = liquidatedDebt
        .mul(toBN(dec(15000, 18)))
        .div(toBN(dec(200000, 18)));
      const expectedCompoundedDeposit_A = toBN(dec(15000, 18)).sub(expectedDebtTokenLoss_A);

      assert.isAtMost(th.getDifference(expectedCompoundedDeposit_A, compoundedDeposit_A), 100000);

      // Alice sends her FIL Gains to her Trove
      await stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address);

      // check Alice's DebtTokenLoss has been applied to her deposit expectedCompoundedDeposit_A
      alice_deposit_afterDefault = (await stabilityPool.deposits(alice.address))[0];
      assert.isAtMost(
        th.getDifference(alice_deposit_afterDefault, expectedCompoundedDeposit_A),
        100000,
      );

      // check alice's Trove recorded FIL has increased by the expected reward amount
      const aliceTrove_After = await troveManager.Troves(alice.address);
      const aliceTrove_FIL_After = aliceTrove_After[1];

      const Trove_FIL_Increase = aliceTrove_FIL_After.sub(aliceTrove_FIL_Before).toString();

      assert.equal(Trove_FIL_Increase, FILGain_A);
    });

    it("withdrawFILGainToTrove(): reverts if it would leave trove with ICR < MCR", async () => {
      // --- SETUP ---
      // Whale deposits 1850 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // defaulter opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // check alice's Trove recorded FIL Before:
      const aliceTrove_Before = await troveManager.Troves(alice.address);
      const aliceTrove_FIL_Before = aliceTrove_Before[1];
      assert.isTrue(aliceTrove_FIL_Before.gt(toBN("0")));

      // price drops: defaulter's Trove falls below MCR
      await priceFeed.setPrice(dec(10, 18));

      // defaulter's Trove is closed.
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // Alice attempts to  her FIL Gains to her Trove
      await assertRevert(
        stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address),
        "BorrowerOps: An operation that would result in ICR < MCR is not permitted",
      );
    });

    it("withdrawFILGainToTrove(): Subsequent deposit and withdrawal attempt from same account, with no intermediate liquidations, withdraws zero FIL", async () => {
      // --- SETUP ---
      // Whale deposits 1850 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // defaulter opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // check alice's Trove recorded FIL Before:
      const aliceTrove_Before = await troveManager.Troves(alice.address);
      const aliceTrove_FIL_Before = aliceTrove_Before[1];
      assert.isTrue(aliceTrove_FIL_Before.gt(toBN("0")));

      // price drops: defaulter's Trove falls below MCR
      await priceFeed.setPrice(dec(105, 18));

      // defaulter's Trove is closed.
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // price bounces back
      await priceFeed.setPrice(dec(200, 18));

      // Alice sends her FIL Gains to her Trove
      await stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address);

      assert.equal(await stabilityPool.getDepositorFILGain(alice.address), 0);

      const FILinSP_Before = (await stabilityPool.getFIL()).toString();

      // Alice attempts second withdrawal from SP to Trove - reverts, due to 0 FIL Gain
      const txPromise_A = stabilityPool
        .connect(alice)
        .withdrawFILGainToTrove(alice.address, alice.address);
      await th.assertRevert(txPromise_A);

      // Check FIL in pool does not change
      const FILinSP_1 = (await stabilityPool.getFIL()).toString();
      assert.equal(FILinSP_Before, FILinSP_1);

      await priceFeed.setPrice(dec(200, 18));

      // Alice attempts third withdrawal (this time, from SP to her own account)
      await stabilityPool.connect(alice).withdrawFromSP(dec(15000, 18));

      // Check FIL in pool does not change
      const FILinSP_2 = (await stabilityPool.getFIL()).toString();
      assert.equal(FILinSP_Before, FILinSP_2);
    });

    it("withdrawFILGainToTrove(): decreases StabilityPool FIL and increases activePool FIL", async () => {
      // --- SETUP ---
      // Whale deposits 185000 DebtToken in StabilityPool
      await openTrove({
        extraDebtTokenAmount: toBN(dec(1000000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });
      await stabilityPool.connect(whale).provideToSP(dec(185000, 18), frontEnd_1.address);

      // defaulter opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- TEST ---

      // Alice makes deposit #1: 15000 DebtToken
      await openTrove({
        extraDebtTokenAmount: toBN(dec(15000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await stabilityPool.connect(alice).provideToSP(dec(15000, 18), frontEnd_1.address);

      // price drops: defaulter's Trove falls below MCR
      await priceFeed.setPrice(dec(100, 18));

      // defaulter's Trove is closed.
      const liquidationTx = await troveManager.liquidate(defaulter_1.address);
      const [liquidatedDebt, liquidatedColl, gasComp] =
        await th.getEmittedLiquidationValues(liquidationTx);

      // Expect alice to be entitled to 15000/200000 of the liquidated coll
      const aliceExpectedFILGain = liquidatedColl
        .mul(toBN(dec(15000, 18)))
        .div(toBN(dec(200000, 18)));
      const aliceFILGain = await stabilityPool.getDepositorFILGain(alice.address);
      assert.isTrue(aliceExpectedFILGain.eq(aliceFILGain));

      // price bounces back
      await priceFeed.setPrice(dec(200, 18));

      //check activePool and StabilityPool Ether before retrieval:
      const active_FIL_Before = await activePool.getFIL();
      const stability_FIL_Before = await stabilityPool.getFIL();

      // Alice retrieves redirects FIL gain to her Trove
      await stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address);

      const active_FIL_After = await activePool.getFIL();
      const stability_FIL_After = await stabilityPool.getFIL();

      const active_FIL_Difference = active_FIL_After.sub(active_FIL_Before); // AP FIL should increase
      const stability_FIL_Difference = stability_FIL_Before.sub(stability_FIL_After); // SP FIL should decrease

      // check Pool FIL values change by Alice's FILGain, i.e 0.075 FIL
      assert.isAtMost(th.getDifference(active_FIL_Difference, aliceFILGain), 10000);
      assert.isAtMost(th.getDifference(stability_FIL_Difference, aliceFILGain), 10000);
    });

    it("withdrawFILGainToTrove(): All depositors are able to withdraw their FIL gain from the SP to their Trove", async () => {
      // Whale opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // Defaulter opens trove
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // 6 Accounts open troves and provide to SP
      const depositors = [alice, bob, carol, dennis, erin, flyn];
      for (account of depositors) {
        await openTrove({
          extraDebtTokenAmount: toBN(dec(10000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: account },
        });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), frontEnd_1.address);
      }

      await priceFeed.setPrice(dec(105, 18));
      await troveManager.liquidate(defaulter_1.address);

      // price bounces back
      await priceFeed.setPrice(dec(200, 18));

      // All depositors attempt to withdraw
      const tx1 = await stabilityPool
        .connect(alice)
        .withdrawFILGainToTrove(alice.address, alice.address);
      const receipt1 = await tx1.wait();
      assert.equal(receipt1.status, 1);

      const tx2 = await stabilityPool.connect(bob).withdrawFILGainToTrove(bob.address, bob.address);
      const receipt2 = await tx2.wait();
      assert.equal(receipt2.status, 1);

      const tx3 = await stabilityPool
        .connect(carol)
        .withdrawFILGainToTrove(carol.address, carol.address);
      const receipt3 = await tx3.wait();
      assert.equal(receipt3.status, 1);

      const tx4 = await stabilityPool
        .connect(dennis)
        .withdrawFILGainToTrove(dennis.address, dennis.address);
      const receipt4 = await tx4.wait();
      assert.equal(receipt4.status, 1);

      const tx5 = await stabilityPool
        .connect(erin)
        .withdrawFILGainToTrove(erin.address, erin.address);
      const receipt5 = await tx5.wait();
      assert.equal(receipt5.status, 1);

      const tx6 = await stabilityPool
        .connect(flyn)
        .withdrawFILGainToTrove(flyn.address, flyn.address);
      const receipt6 = await tx6.wait();
      assert.equal(receipt6.status, 1);
    });

    it("withdrawFILGainToTrove(): All depositors withdraw, each withdraw their correct FIL gain", async () => {
      // Whale opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // defaulter opened
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // 6 Accounts open troves and provide to SP
      const depositors = [alice, bob, carol, dennis, erin, flyn];
      for (account of depositors) {
        await openTrove({
          extraDebtTokenAmount: toBN(dec(10000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: account },
        });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), frontEnd_1.address);
      }
      const collBefore = (await troveManager.Troves(alice.address))[1]; // all troves have same coll before

      await priceFeed.setPrice(dec(105, 18));
      const liquidationTx = await troveManager.liquidate(defaulter_1.address);
      const [, liquidatedColl, ,] = await th.getEmittedLiquidationValues(liquidationTx);

      /* All depositors attempt to withdraw their FIL gain to their Trove. Each depositor 
      receives (liquidatedColl/ 6).

      Thus, expected new collateral for each depositor with 1 Ether in their trove originally, is 
      (1 + liquidatedColl/6)
      */

      const expectedCollGain = liquidatedColl.div(toBN("6"));

      await priceFeed.setPrice(dec(200, 18));

      await stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address);
      const aliceCollAfter = (await troveManager.Troves(alice.address))[1];
      assert.isAtMost(th.getDifference(aliceCollAfter.sub(collBefore), expectedCollGain), 10000);

      await stabilityPool.connect(bob).withdrawFILGainToTrove(bob.address, bob.address);
      const bobCollAfter = (await troveManager.Troves(bob.address))[1];
      assert.isAtMost(th.getDifference(bobCollAfter.sub(collBefore), expectedCollGain), 10000);

      await stabilityPool.connect(carol).withdrawFILGainToTrove(carol.address, carol.address);
      const carolCollAfter = (await troveManager.Troves(carol.address))[1];
      assert.isAtMost(th.getDifference(carolCollAfter.sub(collBefore), expectedCollGain), 10000);

      await stabilityPool.connect(dennis).withdrawFILGainToTrove(dennis.address, dennis.address);
      const dennisCollAfter = (await troveManager.Troves(dennis.address))[1];
      assert.isAtMost(th.getDifference(dennisCollAfter.sub(collBefore), expectedCollGain), 10000);

      await stabilityPool.connect(erin).withdrawFILGainToTrove(erin.address, erin.address);
      const erinCollAfter = (await troveManager.Troves(erin.address))[1];
      assert.isAtMost(th.getDifference(erinCollAfter.sub(collBefore), expectedCollGain), 10000);

      await stabilityPool.connect(flyn).withdrawFILGainToTrove(flyn.address, flyn.address);
      const flynCollAfter = (await troveManager.Troves(flyn.address))[1];
      assert.isAtMost(th.getDifference(flynCollAfter.sub(collBefore), expectedCollGain), 10000);
    });

    it("withdrawFILGainToTrove(): caller can withdraw full deposit and FIL gain to their trove during Recovery Mode", async () => {
      // --- SETUP ---

      // Defaulter opens
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // A, B, C provides 10000, 5000, 3000 DebtToken to SP
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(bob).provideToSP(dec(5000, 18), frontEnd_1.address);
      await stabilityPool.connect(carol).provideToSP(dec(3000, 18), frontEnd_1.address);

      assert.isFalse(await th.checkRecoveryMode(contracts));

      // Price drops to 105,
      await priceFeed.setPrice(dec(105, 18));
      const price = await priceFeed.getPrice();

      assert.isTrue(await th.checkRecoveryMode(contracts));

      // Check defaulter 1 has ICR: 100% < ICR < 110%.
      assert.isTrue(await th.ICRbetween100and110(defaulter_1, troveManager, price));

      const alice_Collateral_Before = (await troveManager.Troves(alice.address))[1];
      const bob_Collateral_Before = (await troveManager.Troves(bob.address))[1];
      const carol_Collateral_Before = (await troveManager.Troves(carol.address))[1];

      // Liquidate defaulter 1
      assert.isTrue(await sortedTroves.contains(defaulter_1.address));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      const alice_FILGain_Before = await stabilityPool.getDepositorFILGain(alice.address);
      const bob_FILGain_Before = await stabilityPool.getDepositorFILGain(bob.address);
      const carol_FILGain_Before = await stabilityPool.getDepositorFILGain(carol.address);

      // A, B, C withdraw their full FIL gain from the Stability Pool to their trove
      await stabilityPool.connect(alice).withdrawFILGainToTrove(alice.address, alice.address);
      await stabilityPool.connect(bob).withdrawFILGainToTrove(bob.address, bob.address);
      await stabilityPool.connect(carol).withdrawFILGainToTrove(carol.address, carol.address);

      // Check collateral of troves A, B, C has increased by the value of their FIL gain from liquidations, respectively
      const alice_expectedCollateral = alice_Collateral_Before.add(alice_FILGain_Before).toString();
      const bob_expectedColalteral = bob_Collateral_Before.add(bob_FILGain_Before).toString();
      const carol_expectedCollateral = carol_Collateral_Before.add(carol_FILGain_Before).toString();

      const alice_Collateral_After = (await troveManager.Troves(alice.address))[1];
      const bob_Collateral_After = (await troveManager.Troves(bob.address))[1];
      const carol_Collateral_After = (await troveManager.Troves(carol.address))[1];

      assert.equal(alice_expectedCollateral, alice_Collateral_After);
      assert.equal(bob_expectedColalteral, bob_Collateral_After);
      assert.equal(carol_expectedCollateral, carol_Collateral_After);

      // Check FIL in SP has reduced to zero
      const FILinSP_After = (await stabilityPool.getFIL()).toString();
      assert.isAtMost(th.getDifference(FILinSP_After, "0"), 100000);
    });

    it("withdrawFILGainToTrove(): reverts if user has no trove", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: alice },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: bob },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: carol },
      });

      // Defaulter opens
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // A transfers DebtToken to D
      await debtToken.connect(alice).transfer(dennis.address, dec(10000, 18));

      // D deposits to Stability Pool
      await stabilityPool.connect(dennis).provideToSP(dec(10000, 18), frontEnd_1.address);

      //Price drops
      await priceFeed.setPrice(dec(105, 18));

      //Liquidate defaulter 1
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      await priceFeed.setPrice(dec(200, 18));

      // D attempts to withdraw his FIL gain to Trove
      await th.assertRevert(
        stabilityPool.connect(dennis).withdrawFILGainToTrove(dennis.address, dennis.address),
        "caller must have an active trove to withdraw FILGain to",
      );
    });

    it("withdrawFILGainToTrove(): triggers ProtocolToken reward event - increases the sum G", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A and B provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      const G_Before = await stabilityPool.epochToScaleToG(0, 0);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      await priceFeed.setPrice(dec(200, 18));

      // A withdraws from SP
      await stabilityPool.connect(A).withdrawFromSP(dec(50, 18));

      const G_1 = await stabilityPool.epochToScaleToG(0, 0);

      // Expect G has increased from the ProtocolToken reward event triggered
      assert.isTrue(G_1.gt(G_Before));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Check B has non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));

      // B withdraws to trove
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);

      const G_2 = await stabilityPool.epochToScaleToG(0, 0);

      // Expect G has increased from the ProtocolToken reward event triggered
      assert.isTrue(G_2.gt(G_1));
    });

    it("withdrawFILGainToTrove(), partial withdrawal: doesn't change the front end tag", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, D, E provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Check A, B, C have non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(A.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(C.address)).gt(ZERO));

      await priceFeed.setPrice(dec(200, 18));

      // A, B, C withdraw to trove
      await stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);
      await stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);

      const frontEndTag_A = (await stabilityPool.deposits(A.address))[1];
      const frontEndTag_B = (await stabilityPool.deposits(B.address))[1];
      const frontEndTag_C = (await stabilityPool.deposits(C.address))[1];

      // Check deposits are still tagged with their original front end
      assert.equal(frontEndTag_A, frontEnd_1.address);
      assert.equal(frontEndTag_B, frontEnd_2.address);
      assert.equal(frontEndTag_C, ZERO_ADDRESS);
    });

    it("withdrawFILGainToTrove(), eligible deposit: depositor receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(3000, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Get A, B, C ProtocolToken balance before
      const A_protocolTokenBalance_Before = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_Before = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_Before = await protocolToken.balanceOf(C.address);

      // Check A, B, C have non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(A.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(C.address)).gt(ZERO));

      await priceFeed.setPrice(dec(200, 18));

      // A, B, C withdraw to trove
      await stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);
      await stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);

      // Get ProtocolToken balance after
      const A_protocolTokenBalance_After = await protocolToken.balanceOf(A.address);
      const B_protocolTokenBalance_After = await protocolToken.balanceOf(B.address);
      const C_protocolTokenBalance_After = await protocolToken.balanceOf(C.address);

      // Check ProtocolToken Balance of A, B, C has increased
      assert.isTrue(A_protocolTokenBalance_After.gt(A_protocolTokenBalance_Before));
      assert.isTrue(B_protocolTokenBalance_After.gt(B_protocolTokenBalance_Before));
      assert.isTrue(C_protocolTokenBalance_After.gt(C_protocolTokenBalance_Before));
    });

    it("withdrawFILGainToTrove(), eligible deposit: tagged front end receives ProtocolToken rewards", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // A, B, C, provide to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(3000, 18), frontEnd_3.address);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Get front ends' ProtocolToken balance before
      const F1_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_1.address);
      const F2_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_2.address);
      const F3_protocolTokenBalance_Before = await protocolToken.balanceOf(frontEnd_3.address);

      await priceFeed.setPrice(dec(200, 18));

      // Check A, B, C have non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(A.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(C.address)).gt(ZERO));

      // A, B, C withdraw
      await stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);
      await stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);

      // Get front ends' ProtocolToken balance after
      const F1_protocolTokenBalance_After = await protocolToken.balanceOf(frontEnd_1.address);
      const F2_protocolTokenBalance_After = await protocolToken.balanceOf(frontEnd_2.address);
      const F3_protocolTokenBalance_After = await protocolToken.balanceOf(frontEnd_3.address);

      // Check ProtocolToken Balance of front ends has increased
      assert.isTrue(F1_protocolTokenBalance_After.gt(F1_protocolTokenBalance_Before));
      assert.isTrue(F2_protocolTokenBalance_After.gt(F2_protocolTokenBalance_Before));
      assert.isTrue(F3_protocolTokenBalance_After.gt(F3_protocolTokenBalance_Before));
    });

    it("withdrawFILGainToTrove(), eligible deposit: tagged front end's stake decreases", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, D, E, F open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(30000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: F },
      });

      // A, B, C, D, E, F provide to SP
      await stabilityPool.connect(A).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(3000, 18), frontEnd_3.address);
      await stabilityPool.connect(D).provideToSP(dec(1000, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(2000, 18), frontEnd_2.address);
      await stabilityPool.connect(F).provideToSP(dec(3000, 18), frontEnd_3.address);

      // Defaulter opens a trove, price drops, defaulter gets liquidated
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      // Get front ends' stake before
      const F1_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_Before = await stabilityPool.frontEndStakes(frontEnd_3.address);

      await priceFeed.setPrice(dec(200, 18));

      // Check A, B, C have non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(A.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(C.address)).gt(ZERO));

      // A, B, C withdraw to trove
      await stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);
      await stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);

      // Get front ends' stakes after
      const F1_Stake_After = await stabilityPool.frontEndStakes(frontEnd_1.address);
      const F2_Stake_After = await stabilityPool.frontEndStakes(frontEnd_2.address);
      const F3_Stake_After = await stabilityPool.frontEndStakes(frontEnd_3.address);

      // Check front ends' stakes have decreased
      assert.isTrue(F1_Stake_After.lt(F1_Stake_Before));
      assert.isTrue(F2_Stake_After.lt(F2_Stake_Before));
      assert.isTrue(F3_Stake_After.lt(F3_Stake_Before));
    });

    it("withdrawFILGainToTrove(), eligible deposit: tagged front end's snapshots update", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // A, B, C, open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(20000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(40000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(60000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });

      // D opens trove
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter_1 } });

      // --- SETUP ---

      const deposit_A = dec(100, 18);
      const deposit_B = dec(200, 18);
      const deposit_C = dec(300, 18);

      // A, B, C make their initial deposits
      await stabilityPool.connect(A).provideToSP(deposit_A, frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(deposit_B, frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(deposit_C, frontEnd_3.address);

      // fastforward time then make an SP deposit, to make G > 0
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      await stabilityPool.connect(D).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // perform a liquidation to make 0 < P < 1, and S > 0
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      await troveManager.liquidate(defaulter_1.address);

      const currentEpoch = await stabilityPool.currentEpoch();
      const currentScale = await stabilityPool.currentScale();

      const S_Before = await stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
      const P_Before = await stabilityPool.P();
      const G_Before = await stabilityPool.epochToScaleToG(currentEpoch, currentScale);

      // Confirm 0 < P < 1
      assert.isTrue(P_Before.gt(toBN("0")) && P_Before.lt(toBN(dec(1, 18))));
      // Confirm S, G are both > 0
      assert.isTrue(S_Before.gt(toBN("0")));
      assert.isTrue(G_Before.gt(toBN("0")));

      // Get front ends' snapshots before
      for (frontEnd of [frontEnd_1, frontEnd_2, frontEnd_3]) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd.address);

        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends, since S corresponds to FIL gain)
        assert.equal(snapshot[1], dec(1, 18)); // P
        assert.equal(snapshot[2], "0"); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }

      // --- TEST ---

      // Check A, B, C have non-zero FIL gain
      assert.isTrue((await stabilityPool.getDepositorFILGain(A.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(B.address)).gt(ZERO));
      assert.isTrue((await stabilityPool.getDepositorFILGain(C.address)).gt(ZERO));

      await priceFeed.setPrice(dec(200, 18));

      // A, B, C withdraw FIL gain to troves. Grab G at each stage, as it can increase a bit
      // between topups, because some block.timestamp time passes (and ProtocolToken is issued) between ops
      const G1 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);

      const G2 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);

      const G3 = await stabilityPool.epochToScaleToG(currentScale, currentEpoch);
      await stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);

      const frontEnds = [frontEnd_1.address, frontEnd_2.address, frontEnd_3.address];
      const G_Values = [G1, G2, G3];

      // Map frontEnds to the value of G at time the deposit was made
      frontEndToG = th.zipToObject(frontEnds, G_Values);

      // Get front ends' snapshots after
      for (const [frontEnd, G] of Object.entries(frontEndToG)) {
        const snapshot = await stabilityPool.frontEndSnapshots(frontEnd);

        // Check snapshots are the expected values
        assert.equal(snapshot[0], "0"); // S (should always be 0 for front ends)
        assert.isTrue(snapshot[1].eq(P_Before)); // P
        assert.isTrue(snapshot[2].eq(G)); // G
        assert.equal(snapshot[3], "0"); // scale
        assert.equal(snapshot[4], "0"); // epoch
      }
    });

    it("withdrawFILGainToTrove(): reverts when depositor has no FIL gain", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(100000, 18)),
        ICR: toBN(dec(10, 18)),
        extraParams: { from: whale },
      });

      // Whale transfers DebtToken to A, B
      await debtToken.connect(whale).transfer(A.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(B.address, dec(20000, 18));

      // C, D open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(4000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });

      // A, B, C, D provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(30, 18), frontEnd_2.address);
      await stabilityPool.connect(D).provideToSP(dec(40, 18), ZERO_ADDRESS);

      // fastforward time, and E makes a deposit, creating ProtocolToken rewards for all
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
      await openTrove({
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });
      await stabilityPool.connect(E).provideToSP(dec(3000, 18), ZERO_ADDRESS);

      // Confirm A, B, C have zero FIL gain
      assert.equal(await stabilityPool.getDepositorFILGain(A.address), "0");
      assert.equal(await stabilityPool.getDepositorFILGain(B.address), "0");
      assert.equal(await stabilityPool.getDepositorFILGain(C.address), "0");

      // Check withdrawFILGainToTrove reverts for A, B, C
      const txPromise_A = stabilityPool.connect(A).withdrawFILGainToTrove(A.address, A.address);
      const txPromise_B = stabilityPool.connect(B).withdrawFILGainToTrove(B.address, B.address);
      const txPromise_C = stabilityPool.connect(C).withdrawFILGainToTrove(C.address, C.address);
      const txPromise_D = stabilityPool.connect(D).withdrawFILGainToTrove(D.address, D.address);

      await th.assertRevert(txPromise_A);
      await th.assertRevert(txPromise_B);
      await th.assertRevert(txPromise_C);
      await th.assertRevert(txPromise_D);
    });

    it("registerFrontEnd(): registers the front end and chosen kickback rate", async () => {
      const unregisteredFrontEnds = [A, B, C, D, E];

      for (const frontEnd of unregisteredFrontEnds) {
        assert.isFalse((await stabilityPool.frontEnds(frontEnd.address))[1]); // check inactive
        assert.equal((await stabilityPool.frontEnds(frontEnd.address))[0], "0"); // check no chosen kickback rate
      }

      await stabilityPool.connect(A).registerFrontEnd(dec(1, 18));
      await stabilityPool.connect(B).registerFrontEnd("897789897897897");
      await stabilityPool.connect(C).registerFrontEnd("99990098");
      await stabilityPool.connect(D).registerFrontEnd("37");
      await stabilityPool.connect(E).registerFrontEnd("0");

      // Check front ends are registered as active, and have correct kickback rates
      assert.isTrue((await stabilityPool.frontEnds(A.address))[1]);
      assert.equal((await stabilityPool.frontEnds(A.address))[0], dec(1, 18));

      assert.isTrue((await stabilityPool.frontEnds(B.address))[1]);
      assert.equal((await stabilityPool.frontEnds(B.address))[0], "897789897897897");

      assert.isTrue((await stabilityPool.frontEnds(C.address))[1]);
      assert.equal((await stabilityPool.frontEnds(C.address))[0], "99990098");

      assert.isTrue((await stabilityPool.frontEnds(D.address))[1]);
      assert.equal((await stabilityPool.frontEnds(D.address))[0], "37");

      assert.isTrue((await stabilityPool.frontEnds(E.address))[1]);
      assert.equal((await stabilityPool.frontEnds(E.address))[0], "0");
    });

    it("registerFrontEnd(): reverts if the front end is already registered", async () => {
      await stabilityPool.connect(A).registerFrontEnd(dec(1, 18));
      await stabilityPool.connect(B).registerFrontEnd("897789897897897");
      await stabilityPool.connect(C).registerFrontEnd("99990098");

      const _2ndAttempt_A = stabilityPool.connect(A).registerFrontEnd(dec(1, 18));
      const _2ndAttempt_B = stabilityPool.connect(B).registerFrontEnd("897789897897897");
      const _2ndAttempt_C = stabilityPool.connect(C).registerFrontEnd("99990098");

      await th.assertRevert(
        _2ndAttempt_A,
        "StabilityPool: must not already be a registered front end",
      );
      await th.assertRevert(
        _2ndAttempt_B,
        "StabilityPool: must not already be a registered front end",
      );
      await th.assertRevert(
        _2ndAttempt_C,
        "StabilityPool: must not already be a registered front end",
      );
    });

    it("registerFrontEnd(): reverts if the kickback rate >1", async () => {
      const invalidKickbackTx_A = stabilityPool.connect(A).registerFrontEnd(dec(1, 19));
      const invalidKickbackTx_B = stabilityPool.connect(A).registerFrontEnd("1000000000000000001");
      const invalidKickbackTx_C = stabilityPool.connect(A).registerFrontEnd(dec(23423, 45));
      const invalidKickbackTx_D = stabilityPool.connect(A).registerFrontEnd(maxBytes32);

      await th.assertRevert(
        invalidKickbackTx_A,
        "StabilityPool: Kickback rate must be in range [0,1]",
      );
      await th.assertRevert(
        invalidKickbackTx_B,
        "StabilityPool: Kickback rate must be in range [0,1]",
      );
      await th.assertRevert(
        invalidKickbackTx_C,
        "StabilityPool: Kickback rate must be in range [0,1]",
      );
      await th.assertRevert(
        invalidKickbackTx_D,
        "StabilityPool: Kickback rate must be in range [0,1]",
      );
    });

    it("registerFrontEnd(): reverts if address has a non-zero deposit already", async () => {
      // C, D, E open troves
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: C },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: D },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: E },
      });

      // C, E provides to SP
      await stabilityPool.connect(C).provideToSP(dec(10, 18), frontEnd_1.address);
      await stabilityPool.connect(E).provideToSP(dec(10, 18), ZERO_ADDRESS);

      const txPromise_C = stabilityPool.connect(C).registerFrontEnd(dec(1, 18));
      const txPromise_E = stabilityPool.connect(E).registerFrontEnd(dec(1, 18));
      await th.assertRevert(txPromise_C, "StabilityPool: User must have no deposit");
      await th.assertRevert(txPromise_E, "StabilityPool: User must have no deposit");

      // D, with no deposit, successfully registers a front end
      const txD = await stabilityPool.connect(D).registerFrontEnd(dec(1, 18));
      const receiptD = await txD.wait();
      assert.equal(receiptD.status, 1);
    });
  });
});

contract("Reset chain state", async () => {});
