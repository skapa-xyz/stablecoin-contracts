const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const toBN = th.toBN;
const getDifference = th.getDifference;

const GAS_PRICE = 10000000;

contract("StabilityPool - ProtocolToken Rewards", async () => {
  let owner,
    whale,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    defaulter_1,
    defaulter_2,
    defaulter_3,
    defaulter_4,
    defaulter_5,
    defaulter_6,
    frontEnd_1,
    frontEnd_2;
  let lpRewardsAddress, multisig;

  let contracts;

  let priceFeed;
  let stabilityPool;
  let sortedTroves;
  let troveManager;
  let borrowerOperations;
  let protocolToken;
  let communityIssuanceTester;

  let communityProtocolTokenSupply;
  let issuance_M1;
  let issuance_M2;
  let issuance_M3;
  let issuance_M4;
  let issuance_M5;
  let issuance_M6;

  const ZERO_ADDRESS = th.ZERO_ADDRESS;

  const getOpenTroveDebtTokenAmount = async (totalDebt) =>
    th.getOpenTroveDebtTokenAmount(contracts, totalDebt);

  const openTrove = async (params) => th.openTrove(contracts, params);

  before(async () => {
    const signers = await ethers.getSigners();

    [
      owner,
      whale,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      defaulter_1,
      defaulter_2,
      defaulter_3,
      defaulter_4,
      defaulter_5,
      defaulter_6,
      frontEnd_1,
      frontEnd_2,
    ] = signers;
    [lpRewardsAddress, multisig] = signers.slice(998, 1000);
  });

  describe("ProtocolToken Rewards", async () => {
    beforeEach(async () => {
      await hre.network.provider.send("hardhat_reset");

      const transactionCount = await owner.getTransactionCount();
      const cpTesterContracts = await deploymentHelper.computeContractAddresses(
        owner.address,
        transactionCount,
        3,
      );
      const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
        owner.address,
        transactionCount + 3,
      );

      // Overwrite contracts with computed tester addresses
      cpContracts.troveManager = cpTesterContracts[2];

      const troveManagerTester = await deploymentHelper.deployTroveManagerTester(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
        cpContracts,
      );

      contracts = await deploymentHelper.deployProtocolCore(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
        cpContracts,
      );

      const protocolTokenContracts = await deploymentHelper.deployProtocolTokenTesterContracts(
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

      contracts.troveManager = troveManagerTester;

      priceFeed = contracts.priceFeedTestnet;
      stabilityPool = contracts.stabilityPool;
      sortedTroves = contracts.sortedTroves;
      troveManager = contracts.troveManager;
      stabilityPool = contracts.stabilityPool;
      borrowerOperations = contracts.borrowerOperations;

      protocolToken = protocolTokenContracts.protocolToken;
      communityIssuanceTester = protocolTokenContracts.communityIssuance;

      // Check community issuance starts with 32 million ProtocolToken
      communityProtocolTokenSupply = toBN(
        await protocolToken.balanceOf(communityIssuanceTester.address),
      );
      assert.isAtMost(
        getDifference(communityProtocolTokenSupply, "32000000000000000000000000"),
        1000,
      );

      /* Monthly ProtocolToken issuance
  
        Expected fraction of total supply issued per month, for a yearly halving schedule
        (issuance in each month, not cumulative):
    
        Month 1: 0.055378538087966600
        Month 2: 0.052311755607206100
        Month 3: 0.049414807056864200
        Month 4: 0.046678287282156100
        Month 5: 0.044093311972020200
        Month 6: 0.041651488815552900
      */

      issuance_M1 = toBN("55378538087966600")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
      issuance_M2 = toBN("52311755607206100")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
      issuance_M3 = toBN("49414807056864200")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
      issuance_M4 = toBN("46678287282156100")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
      issuance_M5 = toBN("44093311972020200")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
      issuance_M6 = toBN("41651488815552900")
        .mul(communityProtocolTokenSupply)
        .div(toBN(dec(1, 18)));
    });

    it("liquidation < 1 minute after a deposit does not change totalProtocolTokenIssued", async () => {
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: A },
      });
      await openTrove({
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: toBN(dec(2, 18)),
        extraParams: { from: B },
      });

      // A, B provide to SP
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(B).provideToSP(dec(5000, 18), ZERO_ADDRESS);

      await th.fastForwardTime(timeValues.MINUTES_IN_ONE_WEEK, web3.currentProvider);

      await priceFeed.setPrice(dec(105, 18));

      // B adjusts, triggering ProtocolToken issuance for all
      await stabilityPool.connect(B).provideToSP(dec(1, 18), ZERO_ADDRESS);
      const blockTimestamp_1 = th.toBN(await th.getLatestBlockTimestamp(web3));

      // Check ProtocolToken has been issued
      const totalProtocolTokenIssued_1 = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.isTrue(totalProtocolTokenIssued_1.gt(toBN("0")));

      await troveManager.liquidate(B.address);
      const blockTimestamp_2 = th.toBN(await th.getLatestBlockTimestamp(web3));

      assert.isFalse(await sortedTroves.contains(B.address));

      const totalProtocolTokenIssued_2 = await communityIssuanceTester.totalProtocolTokenIssued();

      //console.log(`totalProtocolTokenIssued_1: ${totalProtocolTokenIssued_1}`)
      //console.log(`totalProtocolTokenIssued_2: ${totalProtocolTokenIssued_2}`)

      // check blockTimestamp diff < 60s
      const timestampDiff = blockTimestamp_2.sub(blockTimestamp_1);
      assert.isTrue(timestampDiff.lt(toBN(60)));

      // Check that the liquidation did not alter total ProtocolToken issued
      assert.isTrue(totalProtocolTokenIssued_2.eq(totalProtocolTokenIssued_1));

      // Check that depositor B has no ProtocolToken gain
      const B_pendingProtocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(
        B.address,
      );
      assert.equal(B_pendingProtocolTokenGain, "0");

      // Check depositor B has a pending FIL gain
      const B_pendingFILGain = await stabilityPool.getDepositorFILGain(B.address);
      assert.isTrue(B_pendingFILGain.gt(toBN("0")));
    });

    it("withdrawFromSP(): reward term G does not update when no ProtocolToken is issued", async () => {
      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), A.address, A.address, {
          value: dec(1000, "ether"),
        });
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      const A_initialDeposit = (await stabilityPool.deposits(A.address))[0].toString();
      assert.equal(A_initialDeposit, dec(10000, 18));

      // defaulter opens trove
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      // FIL drops
      await priceFeed.setPrice(dec(100, 18));

      await th.fastForwardTime(timeValues.MINUTES_IN_ONE_WEEK, web3.currentProvider);

      // Liquidate d1. Triggers issuance.
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Get G and communityIssuance before
      const G_Before = await stabilityPool.epochToScaleToG(0, 0);
      const protocolTokenIssuedBefore = await communityIssuanceTester.totalProtocolTokenIssued();

      //  A withdraws some deposit. Triggers issuance.
      const tx = await stabilityPool.connect(A).withdrawFromSP(1000, { gasPrice: GAS_PRICE });
      const receipt = await tx.wait();
      assert.equal(receipt.status, 1);

      // Check G and ProtocolToken Issued do not increase, since <1 minute has passed between issuance triggers
      const G_After = await stabilityPool.epochToScaleToG(0, 0);
      const protocolTokenIssuedAfter = await communityIssuanceTester.totalProtocolTokenIssued();

      assert.isTrue(G_After.eq(G_Before));
      assert.isTrue(protocolTokenIssuedAfter.eq(protocolTokenIssuedBefore));
    });

    // using the result of this to advance time by the desired amount from the deployment time, whether or not some extra time has passed in the meanwhile
    const getDuration = async (expectedDuration) => {
      const supplyStartTime = (await communityIssuanceTester.supplyStartTime()).toNumber();
      const currentTime = await th.getLatestBlockTimestamp(web3);
      const duration = Math.max(expectedDuration - (currentTime - supplyStartTime), 0);

      return duration;
    };

    // Simple case: 3 depositors, equal stake. No liquidations. No front-end.
    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct ProtocolToken gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(th._100pct, dec(10000, 18), whale.address, whale.address, {
          value: dec(10000, "ether"),
        });

      await borrowerOperations.connect(A).openTrove(th._100pct, dec(1, 22), A.address, A.address, {
        value: dec(100, "ether"),
      });
      await borrowerOperations.connect(B).openTrove(th._100pct, dec(1, 22), B.address, B.address, {
        value: dec(100, "ether"),
      });
      await borrowerOperations.connect(C).openTrove(th._100pct, dec(1, 22), C.address, C.address, {
        value: dec(100, "ether"),
      });
      await borrowerOperations.connect(D).openTrove(th._100pct, dec(1, 22), D.address, D.address, {
        value: dec(100, "ether"),
      });

      // Check all ProtocolToken balances are initially 0
      assert.equal(await protocolToken.balanceOf(A.address), 0);
      assert.equal(await protocolToken.balanceOf(B.address), 0);
      assert.equal(await protocolToken.balanceOf(C.address), 0);

      // A, B, C deposit
      await stabilityPool.connect(A).provideToSP(dec(1, 22), ZERO_ADDRESS);
      await stabilityPool.connect(B).provideToSP(dec(1, 22), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(1, 22), ZERO_ADDRESS);

      // One year passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider,
      );

      // D deposits, triggering ProtocolToken gains for A,B,C. Withdraws immediately after
      await stabilityPool.connect(D).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor after 1 year (50% total issued).  Each deposit gets 1/3 of issuance.
      const expectedProtocolTokenGain_1yr = communityProtocolTokenSupply
        .div(toBN("2"))
        .div(toBN("3"));

      // Check ProtocolToken gain
      const A_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(C.address);

      // Check gains are correct, error tolerance = 1e-6 of a token

      assert.isAtMost(getDifference(A_protocolTokenGain_1yr, expectedProtocolTokenGain_1yr), 1e12);
      assert.isAtMost(getDifference(B_protocolTokenGain_1yr, expectedProtocolTokenGain_1yr), 1e12);
      assert.isAtMost(getDifference(C_protocolTokenGain_1yr, expectedProtocolTokenGain_1yr), 1e12);

      // Another year passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // D deposits, triggering ProtocolToken gains for A,B,C. Withdraws immediately after
      await stabilityPool.connect(D).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor after 2 years (75% total issued).  Each deposit gets 1/3 of issuance.
      const expectedProtocolTokenGain_2yr = communityProtocolTokenSupply
        .mul(toBN("3"))
        .div(toBN("4"))
        .div(toBN("3"));

      // Check ProtocolToken gain
      const A_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(C.address);

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(getDifference(A_protocolTokenGain_2yr, expectedProtocolTokenGain_2yr), 1e12);
      assert.isAtMost(getDifference(B_protocolTokenGain_2yr, expectedProtocolTokenGain_2yr), 1e12);
      assert.isAtMost(getDifference(C_protocolTokenGain_2yr, expectedProtocolTokenGain_2yr), 1e12);

      // Each depositor fully withdraws
      await stabilityPool.connect(A).withdrawFromSP(dec(100, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(100, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(100, 18));

      // Check ProtocolToken balances increase by correct amount
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(A.address), expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(B.address), expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(C.address), expectedProtocolTokenGain_2yr),
        1e12,
      );
    });

    // 3 depositors, varied stake. No liquidations. No front-end.
    it("withdrawFromSP(): Depositors with varying initial deposit withdraw correct ProtocolToken gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(10000, "ether"),
          },
        );

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), A.address, A.address, {
          value: dec(200, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(20000, 18), B.address, B.address, {
          value: dec(300, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(30000, 18), C.address, C.address, {
          value: dec(400, "ether"),
        });
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(10000, 18), D.address, D.address, {
          value: dec(100, "ether"),
        });

      // Check all ProtocolToken balances are initially 0
      assert.equal(await protocolToken.balanceOf(A.address), 0);
      assert.equal(await protocolToken.balanceOf(B.address), 0);
      assert.equal(await protocolToken.balanceOf(C.address), 0);

      // A, B, C deposit
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // One year passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider,
      );

      // D deposits, triggering ProtocolToken gains for A,B,C. Withdraws immediately after
      await stabilityPool.connect(D).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor after 1 year (50% total issued)
      const A_expectedProtocolTokenGain_1yr = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("6")); // A gets 1/6 of the issuance

      const B_expectedProtocolTokenGain_1yr = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedProtocolTokenGain_1yr = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued after 1 year
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ProtocolToken gain
      const A_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_1yr = await stabilityPool.getDepositorProtocolTokenGain(C.address);

      // Check gains are correct, error tolerance = 1e-6 of a toke
      assert.isAtMost(
        getDifference(A_protocolTokenGain_1yr, A_expectedProtocolTokenGain_1yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(B_protocolTokenGain_1yr, B_expectedProtocolTokenGain_1yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(C_protocolTokenGain_1yr, C_expectedProtocolTokenGain_1yr),
        1e12,
      );

      // Another year passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // D deposits, triggering ProtocolToken gains for A,B,C. Withdraws immediately after
      await stabilityPool.connect(D).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor after 2 years (75% total issued).
      const A_expectedProtocolTokenGain_2yr = communityProtocolTokenSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("6")); // A gets 1/6 of the issuance

      const B_expectedProtocolTokenGain_2yr = communityProtocolTokenSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedProtocolTokenGain_2yr = communityProtocolTokenSupply
        .mul(toBN("3"))
        .div(toBN("4")) // 75% of total issued after 1 year
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ProtocolToken gain
      const A_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_2yr = await stabilityPool.getDepositorProtocolTokenGain(C.address);

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(
        getDifference(A_protocolTokenGain_2yr, A_expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(B_protocolTokenGain_2yr, B_expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(C_protocolTokenGain_2yr, C_expectedProtocolTokenGain_2yr),
        1e12,
      );

      // Each depositor fully withdraws
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(10000, 18));

      // Check ProtocolToken balances increase by correct amount
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(A.address), A_expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(B.address), B_expectedProtocolTokenGain_2yr),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(C.address), C_expectedProtocolTokenGain_2yr),
        1e12,
      );
    });

    // A, B, C deposit. Varied stake. 1 Liquidation. D joins.
    it("withdrawFromSP(): Depositors with varying initial deposit withdraw correct ProtocolToken gain. No liquidations. No front end.", async () => {
      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(th._100pct, dec(10000, 18), whale.address, whale.address, {
          value: dec(10000, "ether"),
        });

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), A.address, A.address, {
          value: dec(200, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(20000, 18), B.address, B.address, {
          value: dec(300, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(30000, 18), C.address, C.address, {
          value: dec(400, "ether"),
        });
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(40000, 18), D.address, D.address, {
          value: dec(500, "ether"),
        });
      await borrowerOperations
        .connect(E)
        .openTrove(th._100pct, dec(40000, 18), E.address, E.address, {
          value: dec(600, "ether"),
        });

      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(30000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(300, "ether") },
        );

      // Check all ProtocolToken balances are initially 0
      assert.equal(await protocolToken.balanceOf(A.address), 0);
      assert.equal(await protocolToken.balanceOf(B.address), 0);
      assert.equal(await protocolToken.balanceOf(C.address), 0);
      assert.equal(await protocolToken.balanceOf(D.address), 0);

      // A, B, C deposit
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // Year 1 passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider,
      );

      assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(60000, 18));

      // Price Drops, defaulter1 liquidated. Stability Pool size drops by 50%
      await priceFeed.setPrice(dec(100, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Confirm SP dropped from 60k to 30k
      assert.isAtMost(
        getDifference(await stabilityPool.getTotalDebtTokenDeposits(), dec(30000, 18)),
        1000,
      );

      // Expected gains for each depositor after 1 year (50% total issued)
      const A_expectedProtocolTokenGain_Y1 = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("6")); // A got 1/6 of the issuance

      const B_expectedProtocolTokenGain_Y1 = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("3")); // B gets 2/6 = 1/3 of the issuance

      const C_expectedProtocolTokenGain_Y1 = communityProtocolTokenSupply
        .div(toBN("2")) // 50% of total issued in Y1
        .div(toBN("2")); // C gets 3/6 = 1/2 of the issuance

      // Check ProtocolToken gain
      const A_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(C.address);

      // Check gains are correct, error tolerance = 1e-6 of a toke
      assert.isAtMost(getDifference(A_protocolTokenGain_Y1, A_expectedProtocolTokenGain_Y1), 1e12);
      assert.isAtMost(getDifference(B_protocolTokenGain_Y1, B_expectedProtocolTokenGain_Y1), 1e12);
      assert.isAtMost(getDifference(C_protocolTokenGain_Y1, C_expectedProtocolTokenGain_Y1), 1e12);

      // D deposits 40k
      await stabilityPool.connect(D).provideToSP(dec(40000, 18), ZERO_ADDRESS);

      // Year 2 passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // E deposits and withdraws, creating ProtocolToken issuance
      await stabilityPool.connect(E).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(E).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor during Y2:
      const A_expectedProtocolTokenGain_Y2 = communityProtocolTokenSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .div(toBN("14")); // A got 50/700 = 1/14 of the issuance

      const B_expectedProtocolTokenGain_Y2 = communityProtocolTokenSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .div(toBN("7")); // B got 100/700 = 1/7 of the issuance

      const C_expectedProtocolTokenGain_Y2 = communityProtocolTokenSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .mul(toBN("3"))
        .div(toBN("14")); // C gets 150/700 = 3/14 of the issuance

      const D_expectedProtocolTokenGain_Y2 = communityProtocolTokenSupply
        .div(toBN("4")) // 25% of total issued in Y2
        .mul(toBN("4"))
        .div(toBN("7")); // D gets 400/700 = 4/7 of the issuance

      // Check ProtocolToken gain
      const A_protocolTokenGain_AfterY2 = await stabilityPool.getDepositorProtocolTokenGain(
        A.address,
      );
      const B_protocolTokenGain_AfterY2 = await stabilityPool.getDepositorProtocolTokenGain(
        B.address,
      );
      const C_protocolTokenGain_AfterY2 = await stabilityPool.getDepositorProtocolTokenGain(
        C.address,
      );
      const D_protocolTokenGain_AfterY2 = await stabilityPool.getDepositorProtocolTokenGain(
        D.address,
      );

      const A_expectedTotalGain = A_expectedProtocolTokenGain_Y1.add(
        A_expectedProtocolTokenGain_Y2,
      );
      const B_expectedTotalGain = B_expectedProtocolTokenGain_Y1.add(
        B_expectedProtocolTokenGain_Y2,
      );
      const C_expectedTotalGain = C_expectedProtocolTokenGain_Y1.add(
        C_expectedProtocolTokenGain_Y2,
      );
      const D_expectedTotalGain = D_expectedProtocolTokenGain_Y2;

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(getDifference(A_protocolTokenGain_AfterY2, A_expectedTotalGain), 1e12);
      assert.isAtMost(getDifference(B_protocolTokenGain_AfterY2, B_expectedTotalGain), 1e12);
      assert.isAtMost(getDifference(C_protocolTokenGain_AfterY2, C_expectedTotalGain), 1e12);
      assert.isAtMost(getDifference(D_protocolTokenGain_AfterY2, D_expectedTotalGain), 1e12);

      // Each depositor fully withdraws
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(20000, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(30000, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(40000, 18));

      // Check ProtocolToken balances increase by correct amount
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(A.address), A_expectedTotalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(B.address), B_expectedTotalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(C.address), C_expectedTotalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(D.address), D_expectedTotalGain),
        1e12,
      );
    });

    //--- Serial pool-emptying liquidations ---

    /* A, B deposit 100C
    L1 cancels 200C
    B, C deposits 100C
    L2 cancels 200C
    E, F deposit 100C
    L3 cancels 200C
    G,H deposits 100C
    L4 cancels 200C

    Expect all depositors withdraw  1/2 of 1 month's ProtocolToken issuance */
    it("withdrawFromSP(): Depositor withdraws correct ProtocolToken gain after serial pool-emptying liquidations. No front-ends.", async () => {
      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(10000, "ether"),
          },
        );

      const allDepositors = [A, B, C, D, E, F, G, H];
      // 4 Defaulters open trove with 200DebtToken debt, and 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(20000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(20000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(20000, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(20000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(200, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Check all would-be depositors have 0 ProtocolToken balance
      for (depositor of allDepositors) {
        assert.equal(await protocolToken.balanceOf(depositor.address), "0");
      }

      // A, B each deposit 10k DebtToken
      const depositors_1 = [A, B];
      for (account of depositors_1) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(10000, 18), account.address, account.address, {
            value: dec(200, "ether"),
          });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 1 month passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider,
      );

      // Defaulter 1 liquidated. 20k DebtToken fully offset with pool.
      await troveManager.liquidate(defaulter_1.address);

      // C, D each deposit 10k DebtToken
      const depositors_2 = [C, D];
      for (account of depositors_2) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(10000, 18), account.address, account.address, {
            value: dec(200, "ether"),
          });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 2 liquidated. 10k DebtToken offset
      await troveManager.liquidate(defaulter_2.address);

      // Erin, Flyn each deposit 100 DebtToken
      const depositors_3 = [E, F];
      for (account of depositors_3) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(10000, 18), account.address, account.address, {
            value: dec(200, "ether"),
          });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 3 liquidated. 100 DebtToken offset
      await troveManager.liquidate(defaulter_3.address);

      // Graham, Harriet each deposit 10k DebtToken
      const depositors_4 = [G, H];
      for (account of depositors_4) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(10000, 18), account.address, account.address, {
            value: dec(200, "ether"),
          });
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 4 liquidated. 100 DebtToken offset
      await troveManager.liquidate(defaulter_4.address);

      // All depositors withdraw from SP
      for (depositor of allDepositors) {
        await stabilityPool.connect(depositor).withdrawFromSP(dec(10000, 18));
      }

      /* Each depositor constitutes 50% of the pool from the time they deposit, up until the liquidation.
      Therefore, divide monthly issuance by 2 to get the expected per-depositor ProtocolToken gain.*/
      const expectedProtocolTokenGain_M1 = issuance_M1.div(th.toBN("2"));
      const expectedProtocolTokenGain_M2 = issuance_M2.div(th.toBN("2"));
      const expectedProtocolTokenGain_M3 = issuance_M3.div(th.toBN("2"));
      const expectedProtocolTokenGain_M4 = issuance_M4.div(th.toBN("2"));

      // Check A, B only earn issuance from month 1. Error tolerance = 1e-3 tokens
      for (depositor of [A, B]) {
        const protocolTokenBalance = await protocolToken.balanceOf(depositor.address);
        assert.isAtMost(getDifference(protocolTokenBalance, expectedProtocolTokenGain_M1), 1e15);
      }

      // Check C, D only earn issuance from month 2.  Error tolerance = 1e-3 tokens
      for (depositor of [C, D]) {
        const protocolTokenBalance = await protocolToken.balanceOf(depositor.address);
        assert.isAtMost(getDifference(protocolTokenBalance, expectedProtocolTokenGain_M2), 1e15);
      }

      // Check E, F only earn issuance from month 3.  Error tolerance = 1e-3 tokens
      for (depositor of [E, F]) {
        const protocolTokenBalance = await protocolToken.balanceOf(depositor.address);
        assert.isAtMost(getDifference(protocolTokenBalance, expectedProtocolTokenGain_M3), 1e15);
      }

      // Check G, H only earn issuance from month 4.  Error tolerance = 1e-3 tokens
      for (depositor of [G, H]) {
        const protocolTokenBalance = await protocolToken.balanceOf(depositor.address);
        assert.isAtMost(getDifference(protocolTokenBalance, expectedProtocolTokenGain_M4), 1e15);
      }

      const finalEpoch = (await stabilityPool.currentEpoch()).toString();
      assert.equal(finalEpoch, 4);
    });

    it("ProtocolToken issuance for a given period is not obtainable if the SP was empty during the period", async () => {
      const CIBalanceBefore = await protocolToken.balanceOf(communityIssuanceTester.address);

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(16000, 18), A.address, A.address, {
          value: dec(200, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(10000, 18), B.address, B.address, {
          value: dec(100, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(16000, 18), C.address, C.address, {
          value: dec(200, "ether"),
        });

      const totalProtocolTokenIssuance_0 = await communityIssuanceTester.totalProtocolTokenIssued();
      const G_0 = await stabilityPool.epochToScaleToG(0, 0); // epochs and scales will not change in this test: no liquidations
      assert.equal(totalProtocolTokenIssuance_0, "0");
      assert.equal(G_0, "0");

      // 1 month passes (M1)
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider,
      );

      // ProtocolToken issuance event triggered: A deposits
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Check G is not updated, since SP was empty prior to A's deposit
      const G_1 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_1.eq(G_0));

      // Check total ProtocolToken issued is updated
      const totalProtocolTokenIssuance_1 = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.isTrue(totalProtocolTokenIssuance_1.gt(totalProtocolTokenIssuance_0));

      // 1 month passes (M2)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      //ProtocolToken issuance event triggered: A withdraws.
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));

      // Check G is updated, since SP was not empty prior to A's withdrawal
      const G_2 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_2.gt(G_1));

      // Check total ProtocolToken issued is updated
      const totalProtocolTokenIssuance_2 = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.isTrue(totalProtocolTokenIssuance_2.gt(totalProtocolTokenIssuance_1));

      // 1 month passes (M3)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ProtocolToken issuance event triggered: C deposits
      await stabilityPool.connect(C).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Check G is not updated, since SP was empty prior to C's deposit
      const G_3 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_3.eq(G_2));

      // Check total ProtocolToken issued is updated
      const totalProtocolTokenIssuance_3 = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.isTrue(totalProtocolTokenIssuance_3.gt(totalProtocolTokenIssuance_2));

      // 1 month passes (M4)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // C withdraws
      await stabilityPool.connect(C).withdrawFromSP(dec(10000, 18));

      // Check G is increased, since SP was not empty prior to C's withdrawal
      const G_4 = await stabilityPool.epochToScaleToG(0, 0);
      assert.isTrue(G_4.gt(G_3));

      // Check total ProtocolToken issued is increased
      const totalProtocolTokenIssuance_4 = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.isTrue(totalProtocolTokenIssuance_4.gt(totalProtocolTokenIssuance_3));

      // Get ProtocolToken Gains
      const A_protocolTokenGain = await protocolToken.balanceOf(A.address);
      const C_protocolTokenGain = await protocolToken.balanceOf(C.address);

      // Check A earns gains from M2 only
      assert.isAtMost(getDifference(A_protocolTokenGain, issuance_M2), 1e15);

      // Check C earns gains from M4 only
      assert.isAtMost(getDifference(C_protocolTokenGain, issuance_M4), 1e15);

      // Check totalProtocolTokenIssued = M1 + M2 + M3 + M4.  1e-3 error tolerance.
      const expectedIssuance4Months = issuance_M1
        .add(issuance_M2)
        .add(issuance_M3)
        .add(issuance_M4);
      assert.isAtMost(getDifference(expectedIssuance4Months, totalProtocolTokenIssuance_4), 1e15);

      // Check CI has only transferred out tokens for M2 + M4.  1e-3 error tolerance.
      const expectedProtocolTokenSentOutFromCI = issuance_M2.add(issuance_M4);
      const CIBalanceAfter = await protocolToken.balanceOf(communityIssuanceTester.address);
      const CIBalanceDifference = CIBalanceBefore.sub(CIBalanceAfter);
      assert.isAtMost(getDifference(CIBalanceDifference, expectedProtocolTokenSentOutFromCI), 1e15);
    });

    // --- Scale factor changes ---

    /* Serial scale changes

    A make deposit 10k DebtToken
    1 month passes. L1 decreases P: P = 1e-5 P. L1:   9999.9 DebtToken, 100 FIL
    B makes deposit 9999.9
    1 month passes. L2 decreases P: P =  1e-5 P. L2:  9999.9 DebtToken, 100 FIL
    C makes deposit  9999.9
    1 month passes. L3 decreases P: P = 1e-5 P. L3:  9999.9 DebtToken, 100 FIL
    D makes deposit  9999.9
    1 month passes. L4 decreases P: P = 1e-5 P. L4:  9999.9 DebtToken, 100 FIL
    E makes deposit  9999.9
    1 month passes. L5 decreases P: P = 1e-5 P. L5:  9999.9 DebtToken, 100 FIL
    =========
    F makes deposit 100
    1 month passes. L6 empties the Pool. L6:  10000 DebtToken, 100 FIL

    expect A, B, C, D each withdraw ~1 month's worth of ProtocolToken */
    it("withdrawFromSP(): Several deposits of 100 DebtToken span one scale factor change. Depositors withdraw correct ProtocolToken gains", async () => {
      // Whale opens Trove with 100 FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100, "ether"),
          },
        );

      const fiveDefaulters = [defaulter_1, defaulter_2, defaulter_3, defaulter_4, defaulter_5];

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });
      await borrowerOperations
        .connect(E)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });
      await borrowerOperations
        .connect(F)
        .openTrove(th._100pct, dec(10000, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
          value: dec(10000, "ether"),
        });

      for (const defaulter of fiveDefaulters) {
        // Defaulters 1-5 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations
          .connect(defaulter)
          .openTrove(
            th._100pct,
            await getOpenTroveDebtTokenAmount("9999900000000000000000"),
            defaulter.address,
            defaulter.address,
            { value: dec(100, "ether") },
          );
      }

      // Defaulter 6 withdraws to 10k debt (inc. gas comp)
      await borrowerOperations
        .connect(defaulter_6)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_6.address,
          defaulter_6.address,
          { value: dec(100, "ether") },
        );

      // Confirm all depositors have 0 ProtocolToken
      for (const depositor of [A, B, C, D, E, F]) {
        assert.equal(await protocolToken.balanceOf(depositor.address), "0");
      }
      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Check scale is 0
      // assert.equal(await stabilityPool.currentScale(), '0')

      // A provides to SP
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider,
      );

      // Defaulter 1 liquidated.  Value of P updated to  to 1e-5
      const txL1 = await troveManager.liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.equal(receiptL1.status, 1);

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), "0");
      assert.equal(await stabilityPool.P(), dec(1, 13)); //P decreases: P = 1e(18-5) = 1e13

      // B provides to SP
      await stabilityPool.connect(B).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));
      assert.equal(receiptL2.status, 1);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 17)); //Scale changes and P changes: P = 1e(13-5+9) = 1e17

      // C provides to SP
      await stabilityPool.connect(C).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(defaulter_3.address);
      const receiptL3 = await txL3.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_3.address));
      assert.equal(receiptL3.status, 1);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 12)); //P decreases: P 1e(17-5) = 1e12

      // D provides to SP
      await stabilityPool.connect(D).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 4 liquidated
      const txL4 = await troveManager.liquidate(defaulter_4.address);
      const receiptL4 = await txL4.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_4.address));
      assert.equal(receiptL4.status, 1);

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), "2");
      assert.equal(await stabilityPool.P(), dec(1, 16)); //Scale changes and P changes:: P = 1e(12-5+9) = 1e16

      // E provides to SP
      await stabilityPool.connect(E).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 5 liquidated
      const txL5 = await troveManager.liquidate(defaulter_5.address);
      const receiptL5 = await txL5.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_5.address));
      assert.equal(receiptL5.status, 1);

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), "2");
      assert.equal(await stabilityPool.P(), dec(1, 11)); // P decreases: P = 1e(16-5) = 1e11

      // F provides to SP
      await stabilityPool.connect(F).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // 1 month passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      assert.equal(await stabilityPool.currentEpoch(), "0");

      // Defaulter 6 liquidated
      const txL6 = await troveManager.liquidate(defaulter_6.address);
      const receiptL6 = await txL6.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_6.address));
      assert.equal(receiptL6.status, 1);

      // Check scale is 0, epoch is 1
      assert.equal(await stabilityPool.currentScale(), "0");
      assert.equal(await stabilityPool.currentEpoch(), "1");
      assert.equal(await stabilityPool.P(), dec(1, 18)); // P resets to 1e18 after pool-emptying

      // price doubles
      await priceFeed.setPrice(dec(200, 18));

      /* All depositors withdraw fully from SP.  Withdraw in reverse order, so that the largest remaining
      deposit (F) withdraws first, and does not get extra ProtocolToken gains from the periods between withdrawals */
      for (depositor of [F, E, D, C, B, A]) {
        await stabilityPool.connect(depositor).withdrawFromSP(dec(10000, 18));
      }

      const ProtocolTokenGain_A = await protocolToken.balanceOf(A.address);
      const ProtocolTokenGain_B = await protocolToken.balanceOf(B.address);
      const ProtocolTokenGain_C = await protocolToken.balanceOf(C.address);
      const ProtocolTokenGain_D = await protocolToken.balanceOf(D.address);
      const ProtocolTokenGain_E = await protocolToken.balanceOf(E.address);
      const ProtocolTokenGain_F = await protocolToken.balanceOf(F.address);

      /* Expect each deposit to have earned 100% of the ProtocolToken issuance for the month in which it was active, prior
     to the liquidation that mostly depleted it.  Error tolerance = 1e-3 tokens. */

      const expectedGainA = issuance_M1.add(issuance_M2.div(toBN("100000")));
      const expectedGainB = issuance_M2
        .add(issuance_M3.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainC = issuance_M3
        .add(issuance_M4.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainD = issuance_M4
        .add(issuance_M5.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainE = issuance_M5
        .add(issuance_M6.div(toBN("100000")))
        .mul(toBN("99999"))
        .div(toBN("100000"));
      const expectedGainF = issuance_M6.mul(toBN("99999")).div(toBN("100000"));

      assert.isAtMost(getDifference(expectedGainA, ProtocolTokenGain_A), 1e15);
      assert.isAtMost(getDifference(expectedGainB, ProtocolTokenGain_B), 1e15);
      assert.isAtMost(getDifference(expectedGainC, ProtocolTokenGain_C), 1e15);
      assert.isAtMost(getDifference(expectedGainD, ProtocolTokenGain_D), 1e15);

      assert.isAtMost(getDifference(expectedGainE, ProtocolTokenGain_E), 1e15);
      assert.isAtMost(getDifference(expectedGainF, ProtocolTokenGain_F), 1e15);
    });

    // --- FrontEnds and kickback rates

    // Simple case: 4 depositors, equal stake. No liquidations.
    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct ProtocolToken gain. No liquidations. Front ends and kickback rates.", async () => {
      // Register 2 front ends
      const kickbackRate_F1 = toBN(dec(5, 17)); // F1 kicks 50% back to depositor
      const kickbackRate_F2 = toBN(dec(80, 16)); // F2 kicks 80% back to depositor

      await stabilityPool.connect(frontEnd_1).registerFrontEnd(kickbackRate_F1);
      await stabilityPool.connect(frontEnd_2).registerFrontEnd(kickbackRate_F2);

      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(th._100pct, dec(10000, 18), whale.address, whale.address, {
          value: dec(10000, "ether"),
        });

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), A.address, A.address, {
          value: dec(100, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(10000, 18), B.address, B.address, {
          value: dec(100, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(10000, 18), C.address, C.address, {
          value: dec(100, "ether"),
        });
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(10000, 18), D.address, D.address, {
          value: dec(100, "ether"),
        });
      await borrowerOperations
        .connect(E)
        .openTrove(th._100pct, dec(10000, 18), E.address, E.address, {
          value: dec(100, "ether"),
        });

      // Check all ProtocolToken balances are initially 0
      assert.equal(await protocolToken.balanceOf(A.address), 0);
      assert.equal(await protocolToken.balanceOf(B.address), 0);
      assert.equal(await protocolToken.balanceOf(C.address), 0);
      assert.equal(await protocolToken.balanceOf(D.address), 0);
      assert.equal(await protocolToken.balanceOf(frontEnd_1.address), 0);
      assert.equal(await protocolToken.balanceOf(frontEnd_2.address), 0);

      // A, B, C, D deposit
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(10000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(10000, 18), frontEnd_2.address);
      await stabilityPool.connect(D).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Check initial frontEnd stakes are correct:
      F1_stake = await stabilityPool.frontEndStakes(frontEnd_1.address);
      F2_stake = await stabilityPool.frontEndStakes(frontEnd_2.address);

      assert.equal(F1_stake, dec(10000, 18));
      assert.equal(F2_stake, dec(20000, 18));

      // One year passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_YEAR),
        web3.currentProvider,
      );

      // E deposits, triggering ProtocolToken gains for A,B,C,D,F1,F2. Withdraws immediately after
      await stabilityPool.connect(E).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(E).withdrawFromSP(dec(1, 18));

      // Expected issuance for year 1 is 50% of total supply.
      const expectedIssuance_Y1 = communityProtocolTokenSupply.div(toBN("2"));

      // Get actual ProtocolToken gains
      const A_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(C.address);
      const D_protocolTokenGain_Y1 = await stabilityPool.getDepositorProtocolTokenGain(D.address);
      const F1_protocolTokenGain_Y1 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_1.address,
      );
      const F2_protocolTokenGain_Y1 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_2.address,
      );

      // Expected depositor and front-end gains
      const A_expectedGain_Y1 = kickbackRate_F1
        .mul(expectedIssuance_Y1)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const B_expectedGain_Y1 = kickbackRate_F2
        .mul(expectedIssuance_Y1)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const C_expectedGain_Y1 = kickbackRate_F2
        .mul(expectedIssuance_Y1)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const D_expectedGain_Y1 = expectedIssuance_Y1.div(toBN("4"));

      const F1_expectedGain_Y1 = toBN(dec(1, 18))
        .sub(kickbackRate_F1)
        .mul(expectedIssuance_Y1)
        .div(toBN("4")) // F1's share = 100/400 = 1/4
        .div(toBN(dec(1, 18)));

      const F2_expectedGain_Y1 = toBN(dec(1, 18))
        .sub(kickbackRate_F2)
        .mul(expectedIssuance_Y1)
        .div(toBN("2")) // F2's share = 200/400 = 1/2
        .div(toBN(dec(1, 18)));

      // Check gains are correct, error tolerance = 1e-6 of a token
      assert.isAtMost(getDifference(A_protocolTokenGain_Y1, A_expectedGain_Y1), 1e12);
      assert.isAtMost(getDifference(B_protocolTokenGain_Y1, B_expectedGain_Y1), 1e12);
      assert.isAtMost(getDifference(C_protocolTokenGain_Y1, C_expectedGain_Y1), 1e12);
      assert.isAtMost(getDifference(D_protocolTokenGain_Y1, D_expectedGain_Y1), 1e12);

      assert.isAtMost(getDifference(F1_protocolTokenGain_Y1, F1_expectedGain_Y1), 1e12);
      assert.isAtMost(getDifference(F2_protocolTokenGain_Y1, F2_expectedGain_Y1), 1e12);

      // Another year passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // E deposits, triggering ProtocolToken gains for A,B,CD,F1, F2. Withdraws immediately after
      await stabilityPool.connect(E).provideToSP(dec(1, 18), ZERO_ADDRESS);
      await stabilityPool.connect(E).withdrawFromSP(dec(1, 18));

      // Expected gains for each depositor in Y2(25% total issued).  .
      const expectedIssuance_Y2 = communityProtocolTokenSupply.div(toBN("4"));

      const expectedFinalIssuance = expectedIssuance_Y1.add(expectedIssuance_Y2);

      // Expected final gains
      const A_expectedFinalGain = kickbackRate_F1
        .mul(expectedFinalIssuance)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const B_expectedFinalGain = kickbackRate_F2
        .mul(expectedFinalIssuance)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const C_expectedFinalGain = kickbackRate_F2
        .mul(expectedFinalIssuance)
        .div(toBN("4"))
        .div(toBN(dec(1, 18)));
      const D_expectedFinalGain = expectedFinalIssuance.div(toBN("4"));

      const F1_expectedFinalGain = th
        .toBN(dec(1, 18))
        .sub(kickbackRate_F1)
        .mul(expectedFinalIssuance)
        .div(toBN("4")) // F1's share = 100/400 = 1/4
        .div(toBN(dec(1, 18)));

      const F2_expectedFinalGain = th
        .toBN(dec(1, 18))
        .sub(kickbackRate_F2)
        .mul(expectedFinalIssuance)
        .div(toBN("2")) // F2's share = 200/400 = 1/2
        .div(toBN(dec(1, 18)));

      // Each depositor fully withdraws
      await stabilityPool.connect(A).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(B).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(C).withdrawFromSP(dec(10000, 18));
      await stabilityPool.connect(D).withdrawFromSP(dec(10000, 18));

      // Check ProtocolToken balances increase by correct amount
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(A.address), A_expectedFinalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(B.address), B_expectedFinalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(C.address), C_expectedFinalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(D.address), D_expectedFinalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(frontEnd_1.address), F1_expectedFinalGain),
        1e12,
      );
      assert.isAtMost(
        getDifference(await protocolToken.balanceOf(frontEnd_2.address), F2_expectedFinalGain),
        1e12,
      );
    });

    // A, B, C, D deposit 10k,20k,30k,40k.
    // F1: A
    // F2: B, C
    // D makes a naked deposit (no front end)
    // Pool size: 100k
    // 1 month passes. 1st liquidation: 500. All deposits reduced by 500/1000 = 50%.  A:5000,   B:10000, C:15000,   D:20000
    // Pool size: 50k
    // E deposits 30k via F1                                                          A:5000,   B:10000, C:15000,   D:20000, E:30000
    // Pool size: 80k
    // 1 month passes. 2nd liquidation: 20k. All deposits reduced by 200/800 = 25%    A:3750, B:7500,  C:11250, D:15000, E:22500
    // Pool size: 60k
    // B tops up 40k                                                                  A:3750, B:47500, C:11250, D:1500, E:22500
    // Pool size: 100k
    // 1 month passes. 3rd liquidation: 10k. All deposits reduced by 10%.             A:3375, B:42750, C:10125, D:13500, E:20250
    // Pool size 90k
    // C withdraws 10k                                                                A:3375, B:42750, C:125, D:13500, E:20250
    // Pool size 80k
    // 1 month passes.
    // All withdraw
    it("withdrawFromSP(): Depositors with varying initial deposit withdraw correct ProtocolToken gain. Front ends and kickback rates", async () => {
      // Register 2 front ends
      const F1_kickbackRate = toBN(dec(5, 17)); // F1 kicks 50% back to depositor
      const F2_kickbackRate = toBN(dec(80, 16)); // F2 kicks 80% back to depositor

      await stabilityPool.connect(frontEnd_1).registerFrontEnd(F1_kickbackRate);
      await stabilityPool.connect(frontEnd_2).registerFrontEnd(F2_kickbackRate);

      const initialIssuance = await communityIssuanceTester.totalProtocolTokenIssued();
      assert.equal(initialIssuance, 0);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(th._100pct, dec(10000, 18), whale.address, whale.address, {
          value: dec(10000, "ether"),
        });

      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(10000, 18), A.address, A.address, {
          value: dec(200, "ether"),
        });
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(60000, 18), B.address, B.address, {
          value: dec(800, "ether"),
        });
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(30000, 18), C.address, C.address, {
          value: dec(400, "ether"),
        });
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(40000, 18), D.address, D.address, {
          value: dec(500, "ether"),
        });

      await borrowerOperations
        .connect(E)
        .openTrove(th._100pct, dec(30000, 18), E.address, E.address, {
          value: dec(400, "ether"),
        });

      // D1, D2, D3 open troves with total debt 50k, 30k, 10k respectively (inc. gas comp)
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(50000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(500, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(20000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(100, "ether") },
        );

      // Check all ProtocolToken balances are initially 0
      assert.equal(await protocolToken.balanceOf(A.address), 0);
      assert.equal(await protocolToken.balanceOf(B.address), 0);
      assert.equal(await protocolToken.balanceOf(C.address), 0);
      assert.equal(await protocolToken.balanceOf(D.address), 0);
      assert.equal(await protocolToken.balanceOf(frontEnd_1.address), 0);
      assert.equal(await protocolToken.balanceOf(frontEnd_2.address), 0);

      // A, B, C, D deposit
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), frontEnd_1.address);
      await stabilityPool.connect(B).provideToSP(dec(20000, 18), frontEnd_2.address);
      await stabilityPool.connect(C).provideToSP(dec(30000, 18), frontEnd_2.address);
      await stabilityPool.connect(D).provideToSP(dec(40000, 18), ZERO_ADDRESS);

      // Price Drops, defaulters become undercollateralized
      await priceFeed.setPrice(dec(105, 18));
      assert.isFalse(await th.checkRecoveryMode(contracts));

      // Check initial frontEnd stakes are correct:
      F1_stake = await stabilityPool.frontEndStakes(frontEnd_1.address);
      F2_stake = await stabilityPool.frontEndStakes(frontEnd_2.address);

      assert.equal(F1_stake, dec(10000, 18));
      assert.equal(F2_stake, dec(50000, 18));

      // Month 1 passes
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider,
      );

      assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(100000, 18)); // total 100k

      // LIQUIDATION 1
      await troveManager.liquidate(defaulter_1.address);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(50000, 18),
      ); // 50k

      // --- CHECK GAINS AFTER L1 ---

      // During month 1, deposit sizes are: A:10000, B:20000, C:30000, D:40000.  Total: 100000
      // Expected gains for each depositor after month 1
      const A_share_M1 = issuance_M1.mul(toBN("10000")).div(toBN("100000"));
      const A_expectedProtocolTokenGain_M1 = F1_kickbackRate.mul(A_share_M1).div(toBN(dec(1, 18)));

      const B_share_M1 = issuance_M1.mul(toBN("20000")).div(toBN("100000"));
      const B_expectedProtocolTokenGain_M1 = F2_kickbackRate.mul(B_share_M1).div(toBN(dec(1, 18)));

      const C_share_M1 = issuance_M1.mul(toBN("30000")).div(toBN("100000"));
      const C_expectedProtocolTokenGain_M1 = F2_kickbackRate.mul(C_share_M1).div(toBN(dec(1, 18)));

      const D_share_M1 = issuance_M1.mul(toBN("40000")).div(toBN("100000"));
      const D_expectedProtocolTokenGain_M1 = D_share_M1;

      // F1's stake = A
      const F1_expectedProtocolTokenGain_M1 = toBN(dec(1, 18))
        .sub(F1_kickbackRate)
        .mul(A_share_M1)
        .div(toBN(dec(1, 18)));

      // F2's stake = B + C
      const F2_expectedProtocolTokenGain_M1 = toBN(dec(1, 18))
        .sub(F2_kickbackRate)
        .mul(B_share_M1.add(C_share_M1))
        .div(toBN(dec(1, 18)));

      // Check ProtocolToken gain
      const A_protocolTokenGain_M1 = await stabilityPool.getDepositorProtocolTokenGain(A.address);
      const B_protocolTokenGain_M1 = await stabilityPool.getDepositorProtocolTokenGain(B.address);
      const C_protocolTokenGain_M1 = await stabilityPool.getDepositorProtocolTokenGain(C.address);
      const D_protocolTokenGain_M1 = await stabilityPool.getDepositorProtocolTokenGain(D.address);
      const F1_protocolTokenGain_M1 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_1.address,
      );
      const F2_protocolTokenGain_M1 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_2.address,
      );

      // Check gains are correct, error tolerance = 1e-3 of a token
      assert.isAtMost(getDifference(A_protocolTokenGain_M1, A_expectedProtocolTokenGain_M1), 1e15);
      assert.isAtMost(getDifference(B_protocolTokenGain_M1, B_expectedProtocolTokenGain_M1), 1e15);
      assert.isAtMost(getDifference(C_protocolTokenGain_M1, C_expectedProtocolTokenGain_M1), 1e15);
      assert.isAtMost(getDifference(D_protocolTokenGain_M1, D_expectedProtocolTokenGain_M1), 1e15);
      assert.isAtMost(
        getDifference(F1_protocolTokenGain_M1, F1_expectedProtocolTokenGain_M1),
        1e15,
      );
      assert.isAtMost(
        getDifference(F2_protocolTokenGain_M1, F2_expectedProtocolTokenGain_M1),
        1e15,
      );

      // E deposits 30k via F1
      await stabilityPool.connect(E).provideToSP(dec(30000, 18), frontEnd_1.address);

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(80000, 18),
      );

      // Month 2 passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // LIQUIDATION 2
      await troveManager.liquidate(defaulter_2.address);
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(60000, 18),
      );

      const startTime = await communityIssuanceTester.supplyStartTime();
      const currentTime = await th.getLatestBlockTimestamp(web3);
      const timePassed = toBN(currentTime).sub(startTime);

      // --- CHECK GAINS AFTER L2 ---

      // During month 2, deposit sizes:  A:5000,   B:10000, C:15000,  D:20000, E:30000. Total: 80000

      // Expected gains for each depositor after month 2
      const A_share_M2 = issuance_M2.mul(toBN("5000")).div(toBN("80000"));
      const A_expectedProtocolTokenGain_M2 = F1_kickbackRate.mul(A_share_M2).div(toBN(dec(1, 18)));

      const B_share_M2 = issuance_M2.mul(toBN("10000")).div(toBN("80000"));
      const B_expectedProtocolTokenGain_M2 = F2_kickbackRate.mul(B_share_M2).div(toBN(dec(1, 18)));

      const C_share_M2 = issuance_M2.mul(toBN("15000")).div(toBN("80000"));
      const C_expectedProtocolTokenGain_M2 = F2_kickbackRate.mul(C_share_M2).div(toBN(dec(1, 18)));

      const D_share_M2 = issuance_M2.mul(toBN("20000")).div(toBN("80000"));
      const D_expectedProtocolTokenGain_M2 = D_share_M2;

      const E_share_M2 = issuance_M2.mul(toBN("30000")).div(toBN("80000"));
      const E_expectedProtocolTokenGain_M2 = F1_kickbackRate.mul(E_share_M2).div(toBN(dec(1, 18)));

      // F1's stake = A + E
      const F1_expectedProtocolTokenGain_M2 = toBN(dec(1, 18))
        .sub(F1_kickbackRate)
        .mul(A_share_M2.add(E_share_M2))
        .div(toBN(dec(1, 18)));

      // F2's stake = B + C
      const F2_expectedProtocolTokenGain_M2 = toBN(dec(1, 18))
        .sub(F2_kickbackRate)
        .mul(B_share_M2.add(C_share_M2))
        .div(toBN(dec(1, 18)));

      // Check ProtocolToken gains after month 2
      const A_protocolTokenGain_After_M2 = await stabilityPool.getDepositorProtocolTokenGain(
        A.address,
      );
      const B_protocolTokenGain_After_M2 = await stabilityPool.getDepositorProtocolTokenGain(
        B.address,
      );
      const C_protocolTokenGain_After_M2 = await stabilityPool.getDepositorProtocolTokenGain(
        C.address,
      );
      const D_protocolTokenGain_After_M2 = await stabilityPool.getDepositorProtocolTokenGain(
        D.address,
      );
      const E_protocolTokenGain_After_M2 = await stabilityPool.getDepositorProtocolTokenGain(
        E.address,
      );
      const F1_protocolTokenGain_After_M2 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_1.address,
      );
      const F2_protocolTokenGain_After_M2 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_2.address,
      );

      assert.isAtMost(
        getDifference(
          A_protocolTokenGain_After_M2,
          A_expectedProtocolTokenGain_M2.add(A_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(
          B_protocolTokenGain_After_M2,
          B_expectedProtocolTokenGain_M2.add(B_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(
          C_protocolTokenGain_After_M2,
          C_expectedProtocolTokenGain_M2.add(C_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(
          D_protocolTokenGain_After_M2,
          D_expectedProtocolTokenGain_M2.add(D_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(E_protocolTokenGain_After_M2, E_expectedProtocolTokenGain_M2),
        1e15,
      );

      // Check F1 balance is his M1 gain (it was paid out when E joined through F1)
      const F1_protocolTokenBalance_After_M2 = await protocolToken.balanceOf(frontEnd_1.address);
      assert.isAtMost(
        getDifference(F1_protocolTokenBalance_After_M2, F1_expectedProtocolTokenGain_M1),
        1e15,
      );

      // Check F1's ProtocolToken gain in system after M2: Just their gain due to M2
      assert.isAtMost(
        getDifference(F1_protocolTokenGain_After_M2, F1_expectedProtocolTokenGain_M2),
        1e15,
      );

      // Check F2 ProtocolToken gain in system after M2: the sum of their gains from M1 + M2
      assert.isAtMost(
        getDifference(
          F2_protocolTokenGain_After_M2,
          F2_expectedProtocolTokenGain_M2.add(F2_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );

      // B tops up 40k via F2
      await stabilityPool.connect(B).provideToSP(dec(40000, 18), frontEnd_2.address);

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(100000, 18),
      );

      // Month 3 passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // LIQUIDATION 3
      await troveManager.liquidate(defaulter_3.address);
      assert.isFalse(await sortedTroves.contains(defaulter_3.address));

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(90000, 18),
      );

      // --- CHECK GAINS AFTER L3 ---

      // During month 3, deposit sizes: A:3750, B:47500, C:11250, D:15000, E:22500, Total: 100000

      // Expected gains for each depositor after month 3
      const A_share_M3 = issuance_M3.mul(toBN("3750")).div(toBN("100000"));
      const A_expectedProtocolTokenGain_M3 = F1_kickbackRate.mul(A_share_M3).div(toBN(dec(1, 18)));

      const B_share_M3 = issuance_M3.mul(toBN("47500")).div(toBN("100000"));
      const B_expectedProtocolTokenGain_M3 = F2_kickbackRate.mul(B_share_M3).div(toBN(dec(1, 18)));

      const C_share_M3 = issuance_M3.mul(toBN("11250")).div(toBN("100000"));
      const C_expectedProtocolTokenGain_M3 = F2_kickbackRate.mul(C_share_M3).div(toBN(dec(1, 18)));

      const D_share_M3 = issuance_M3.mul(toBN("15000")).div(toBN("100000"));
      const D_expectedProtocolTokenGain_M3 = D_share_M3;

      const E_share_M3 = issuance_M3.mul(toBN("22500")).div(toBN("100000"));
      const E_expectedProtocolTokenGain_M3 = F1_kickbackRate.mul(E_share_M3).div(toBN(dec(1, 18)));

      // F1's stake = A + E
      const F1_expectedProtocolTokenGain_M3 = toBN(dec(1, 18))
        .sub(F1_kickbackRate)
        .mul(A_share_M3.add(E_share_M3))
        .div(toBN(dec(1, 18)));

      // F2's stake = B + C
      const F2_expectedProtocolTokenGain_M3 = toBN(dec(1, 18))
        .sub(F2_kickbackRate)
        .mul(B_share_M3.add(C_share_M3))
        .div(toBN(dec(1, 18)));

      // Check ProtocolToken gains after month 3
      const A_protocolTokenGain_After_M3 = await stabilityPool.getDepositorProtocolTokenGain(
        A.address,
      );
      const B_protocolTokenGain_After_M3 = await stabilityPool.getDepositorProtocolTokenGain(
        B.address,
      );
      const C_protocolTokenGain_After_M3 = await stabilityPool.getDepositorProtocolTokenGain(
        C.address,
      );
      const D_protocolTokenGain_After_M3 = await stabilityPool.getDepositorProtocolTokenGain(
        D.address,
      );
      const E_protocolTokenGain_After_M3 = await stabilityPool.getDepositorProtocolTokenGain(
        E.address,
      );
      const F1_protocolTokenGain_After_M3 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_1.address,
      );
      const F2_protocolTokenGain_After_M3 = await stabilityPool.getFrontEndProtocolTokenGain(
        frontEnd_2.address,
      );

      // Expect A, C, D ProtocolToken system gains to equal their gains from (M1 + M2 + M3)
      assert.isAtMost(
        getDifference(
          A_protocolTokenGain_After_M3,
          A_expectedProtocolTokenGain_M3.add(A_expectedProtocolTokenGain_M2).add(
            A_expectedProtocolTokenGain_M1,
          ),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(
          C_protocolTokenGain_After_M3,
          C_expectedProtocolTokenGain_M3.add(C_expectedProtocolTokenGain_M2).add(
            C_expectedProtocolTokenGain_M1,
          ),
        ),
        1e15,
      );
      assert.isAtMost(
        getDifference(
          D_protocolTokenGain_After_M3,
          D_expectedProtocolTokenGain_M3.add(D_expectedProtocolTokenGain_M2).add(
            D_expectedProtocolTokenGain_M1,
          ),
        ),
        1e15,
      );

      // Expect E's ProtocolToken system gain to equal their gains from (M2 + M3)
      assert.isAtMost(
        getDifference(
          E_protocolTokenGain_After_M3,
          E_expectedProtocolTokenGain_M3.add(E_expectedProtocolTokenGain_M2),
        ),
        1e15,
      );

      // Expect B ProtocolToken system gains to equal gains just from M3 (his topup paid out his gains from M1 + M2)
      assert.isAtMost(
        getDifference(B_protocolTokenGain_After_M3, B_expectedProtocolTokenGain_M3),
        1e15,
      );

      // Expect B ProtocolToken balance to equal gains from (M1 + M2)
      const B_protocolTokenBalance_After_M3 = await await protocolToken.balanceOf(B.address);
      assert.isAtMost(
        getDifference(
          B_protocolTokenBalance_After_M3,
          B_expectedProtocolTokenGain_M2.add(B_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );

      // Expect F1 ProtocolToken system gains to equal their gain from (M2 + M3)
      assert.isAtMost(
        getDifference(
          F1_protocolTokenGain_After_M3,
          F1_expectedProtocolTokenGain_M3.add(F1_expectedProtocolTokenGain_M2),
        ),
        1e15,
      );

      // Expect F1 ProtocolToken balance to equal their M1 gain
      const F1_protocolTokenBalance_After_M3 = await protocolToken.balanceOf(frontEnd_1.address);
      assert.isAtMost(
        getDifference(F1_protocolTokenBalance_After_M3, F1_expectedProtocolTokenGain_M1),
        1e15,
      );

      // Expect F2 ProtocolToken system gains to equal their gain from M3
      assert.isAtMost(
        getDifference(F2_protocolTokenGain_After_M3, F2_expectedProtocolTokenGain_M3),
        1e15,
      );

      // Expect F2 ProtocolToken balance to equal their gain from M1 + M2
      const F2_protocolTokenBalance_After_M3 = await protocolToken.balanceOf(frontEnd_2.address);
      assert.isAtMost(
        getDifference(
          F2_protocolTokenBalance_After_M3,
          F2_expectedProtocolTokenGain_M2.add(F2_expectedProtocolTokenGain_M1),
        ),
        1e15,
      );

      // Expect deposit C now to be 10125 DebtToken
      const C_compoundedDebtTokenDeposit = await stabilityPool.getCompoundedDebtTokenDeposit(
        C.address,
      );
      assert.isAtMost(getDifference(C_compoundedDebtTokenDeposit, dec(10125, 18)), 1000);

      // --- C withdraws ---

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(90000, 18),
      );

      await stabilityPool.connect(C).withdrawFromSP(dec(10000, 18));

      th.assertIsApproximatelyEqual(
        await stabilityPool.getTotalDebtTokenDeposits(),
        dec(80000, 18),
      );

      // Month 4 passes
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // All depositors fully withdraw
      for (depositor of [A, B, C, D, E]) {
        await stabilityPool.connect(depositor).withdrawFromSP(dec(100000, 18));
        const compoundedDebtTokenDeposit = await stabilityPool.getCompoundedDebtTokenDeposit(
          depositor.address,
        );
        assert.equal(compoundedDebtTokenDeposit, "0");
      }

      // During month 4, deposit sizes: A:3375, B:42750, C:125, D:13500, E:20250, Total: 80000

      // Expected gains for each depositor after month 4
      const A_share_M4 = issuance_M4.mul(toBN("3375")).div(toBN("80000")); // 3375/800
      const A_expectedProtocolTokenGain_M4 = F1_kickbackRate.mul(A_share_M4).div(toBN(dec(1, 18)));

      const B_share_M4 = issuance_M4.mul(toBN("42750")).div(toBN("80000")); // 42750/80000
      const B_expectedProtocolTokenGain_M4 = F2_kickbackRate.mul(B_share_M4).div(toBN(dec(1, 18)));

      const C_share_M4 = issuance_M4.mul(toBN("125")).div(toBN("80000")); // 125/80000
      const C_expectedProtocolTokenGain_M4 = F2_kickbackRate.mul(C_share_M4).div(toBN(dec(1, 18)));

      const D_share_M4 = issuance_M4.mul(toBN("13500")).div(toBN("80000"));
      const D_expectedProtocolTokenGain_M4 = D_share_M4;

      const E_share_M4 = issuance_M4.mul(toBN("20250")).div(toBN("80000")); // 2025/80000
      const E_expectedProtocolTokenGain_M4 = F1_kickbackRate.mul(E_share_M4).div(toBN(dec(1, 18)));

      // F1's stake = A + E
      const F1_expectedProtocolTokenGain_M4 = toBN(dec(1, 18))
        .sub(F1_kickbackRate)
        .mul(A_share_M4.add(E_share_M4))
        .div(toBN(dec(1, 18)));

      // F2's stake = B + C
      const F2_expectedProtocolTokenGain_M4 = toBN(dec(1, 18))
        .sub(F2_kickbackRate)
        .mul(B_share_M4.add(C_share_M4))
        .div(toBN(dec(1, 18)));

      // Get final ProtocolToken balances
      const A_finalProtocolTokenBalance = await protocolToken.balanceOf(A.address);
      const B_finalProtocolTokenBalance = await protocolToken.balanceOf(B.address);
      const C_finalProtocolTokenBalance = await protocolToken.balanceOf(C.address);
      const D_finalProtocolTokenBalance = await protocolToken.balanceOf(D.address);
      const E_finalProtocolTokenBalance = await protocolToken.balanceOf(E.address);
      const F1_finalProtocolTokenBalance = await protocolToken.balanceOf(frontEnd_1.address);
      const F2_finalProtocolTokenBalance = await protocolToken.balanceOf(frontEnd_2.address);

      const A_expectedFinalProtocolTokenBalance = A_expectedProtocolTokenGain_M1.add(
        A_expectedProtocolTokenGain_M2,
      )
        .add(A_expectedProtocolTokenGain_M3)
        .add(A_expectedProtocolTokenGain_M4);

      const B_expectedFinalProtocolTokenBalance = B_expectedProtocolTokenGain_M1.add(
        B_expectedProtocolTokenGain_M2,
      )
        .add(B_expectedProtocolTokenGain_M3)
        .add(B_expectedProtocolTokenGain_M4);

      const C_expectedFinalProtocolTokenBalance = C_expectedProtocolTokenGain_M1.add(
        C_expectedProtocolTokenGain_M2,
      )
        .add(C_expectedProtocolTokenGain_M3)
        .add(C_expectedProtocolTokenGain_M4);

      const D_expectedFinalProtocolTokenBalance = D_expectedProtocolTokenGain_M1.add(
        D_expectedProtocolTokenGain_M2,
      )
        .add(D_expectedProtocolTokenGain_M3)
        .add(D_expectedProtocolTokenGain_M4);

      const E_expectedFinalProtocolTokenBalance = E_expectedProtocolTokenGain_M2.add(
        E_expectedProtocolTokenGain_M3,
      ).add(E_expectedProtocolTokenGain_M4);

      const F1_expectedFinalProtocolTokenBalance = F1_expectedProtocolTokenGain_M1.add(
        F1_expectedProtocolTokenGain_M2,
      )
        .add(F1_expectedProtocolTokenGain_M3)
        .add(F1_expectedProtocolTokenGain_M4);

      const F2_expectedFinalProtocolTokenBalance = F2_expectedProtocolTokenGain_M1.add(
        F2_expectedProtocolTokenGain_M2,
      )
        .add(F2_expectedProtocolTokenGain_M3)
        .add(F2_expectedProtocolTokenGain_M4);

      assert.isAtMost(
        getDifference(A_finalProtocolTokenBalance, A_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(B_finalProtocolTokenBalance, B_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(C_finalProtocolTokenBalance, C_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(D_finalProtocolTokenBalance, D_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(E_finalProtocolTokenBalance, E_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(F1_finalProtocolTokenBalance, F1_expectedFinalProtocolTokenBalance),
        1e15,
      );
      assert.isAtMost(
        getDifference(F2_finalProtocolTokenBalance, F2_expectedFinalProtocolTokenBalance),
        1e15,
      );
    });

    /* Serial scale changes, with one front end

    F1 kickbackRate: 80%

    A, B make deposit 5000 DebtToken via F1
    1 month passes. L1 depletes P: P = 1e-5*P L1:  9999.9 DebtToken, 1 FIL.  scale = 0
    C makes deposit 10000  via F1
    1 month passes. L2 depletes P: P = 1e-5*P L2:  9999.9 DebtToken, 1 FIL  scale = 1
    D makes deposit 10000 via F1
    1 month passes. L3 depletes P: P = 1e-5*P L3:  9999.9 DebtToken, 1 FIL scale = 1
    E makes deposit 10000 via F1
    1 month passes. L3 depletes P: P = 1e-5*P L4:  9999.9 DebtToken, 1 FIL scale = 2
    A, B, C, D, E withdraw

    =========
    Expect front end withdraws ~3 month's worth of ProtocolToken */

    it("withdrawFromSP(): Several deposits of 10k DebtToken span one scale factor change. Depositors withdraw correct ProtocolToken gains", async () => {
      const kickbackRate = toBN(dec(80, 16)); // F1 kicks 80% back to depositor
      await stabilityPool.connect(frontEnd_1).registerFrontEnd(kickbackRate);

      // Whale opens Trove with 10k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(th._100pct, dec(10000, 18), whale.address, whale.address, {
          value: dec(10000, "ether"),
        });

      const _4_Defaulters = [defaulter_1, defaulter_2, defaulter_3, defaulter_4];

      for (const defaulter of _4_Defaulters) {
        // Defaulters 1-4 each withdraw to 9999.9 debt (including gas comp)
        await borrowerOperations
          .connect(defaulter)
          .openTrove(
            th._100pct,
            await getOpenTroveDebtTokenAmount(dec(99999, 17)),
            defaulter.address,
            defaulter.address,
            { value: dec(100, "ether") },
          );
      }

      // Confirm all would-be depositors have 0 ProtocolToken
      for (const depositor of [A, B, C, D, E]) {
        assert.equal(await protocolToken.balanceOf(depositor.address), "0");
      }
      assert.equal(await protocolToken.balanceOf(frontEnd_1.address), "0");

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), "0");

      // A, B provides 5000 DebtToken to SP
      await borrowerOperations
        .connect(A)
        .openTrove(th._100pct, dec(5000, 18), A.address, A.address, {
          value: dec(200, "ether"),
        });
      await stabilityPool.connect(A).provideToSP(dec(5000, 18), frontEnd_1.address);
      await borrowerOperations
        .connect(B)
        .openTrove(th._100pct, dec(5000, 18), B.address, B.address, {
          value: dec(200, "ether"),
        });
      await stabilityPool.connect(B).provideToSP(dec(5000, 18), frontEnd_1.address);

      // 1 month passes (M1)
      await th.fastForwardTime(
        await getDuration(timeValues.SECONDS_IN_ONE_MONTH),
        web3.currentProvider,
      );

      // Defaulter 1 liquidated.  Value of P updated to  to 9999999, i.e. in decimal, ~1e-10
      const txL1 = await troveManager.liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));
      assert.equal(receiptL1.status, 1);

      // Check scale is 0
      assert.equal(await stabilityPool.currentScale(), "0");

      // C provides to SP
      await borrowerOperations
        .connect(C)
        .openTrove(th._100pct, dec(99999, 17), C.address, C.address, {
          value: dec(200, "ether"),
        });
      await stabilityPool.connect(C).provideToSP(dec(99999, 17), frontEnd_1.address);

      // 1 month passes (M2)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_2.address));
      assert.equal(receiptL2.status, 1);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");

      // D provides to SP
      await borrowerOperations
        .connect(D)
        .openTrove(th._100pct, dec(99999, 17), D.address, D.address, {
          value: dec(200, "ether"),
        });
      await stabilityPool.connect(D).provideToSP(dec(99999, 17), frontEnd_1.address);

      // 1 month passes (M3)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 3 liquidated
      const txL3 = await troveManager.liquidate(defaulter_3.address);
      const receiptL3 = await txL3.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_3.address));
      assert.equal(receiptL3.status, 1);

      // Check scale is 1
      assert.equal(await stabilityPool.currentScale(), "1");

      // E provides to SP
      await borrowerOperations
        .connect(E)
        .openTrove(th._100pct, dec(99999, 17), E.address, E.address, {
          value: dec(200, "ether"),
        });
      await stabilityPool.connect(E).provideToSP(dec(99999, 17), frontEnd_1.address);

      // 1 month passes (M4)
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Defaulter 4 liquidated
      const txL4 = await troveManager.liquidate(defaulter_4.address);
      const receiptL4 = await txL4.wait();
      assert.isFalse(await sortedTroves.contains(defaulter_4.address));
      assert.equal(receiptL4.status, 1);

      // Check scale is 2
      assert.equal(await stabilityPool.currentScale(), "2");

      /* All depositors withdraw fully from SP.  Withdraw in reverse order, so that the largest remaining
      deposit (F) withdraws first, and does not get extra ProtocolToken gains from the periods between withdrawals */
      for (depositor of [E, D, C, B, A]) {
        await stabilityPool.connect(depositor).withdrawFromSP(dec(10000, 18));
      }

      const ProtocolTokenGain_A = await protocolToken.balanceOf(A.address);
      const ProtocolTokenGain_B = await protocolToken.balanceOf(B.address);
      const ProtocolTokenGain_C = await protocolToken.balanceOf(C.address);
      const ProtocolTokenGain_D = await protocolToken.balanceOf(D.address);
      const ProtocolTokenGain_E = await protocolToken.balanceOf(E.address);

      const ProtocolTokenGain_F1 = await protocolToken.balanceOf(frontEnd_1.address);

      /* Expect each deposit to have earned ProtocolToken issuance for the month in which it was active, prior
     to the liquidation that mostly depleted it:
     
     expectedProtocolTokenGain_A:  (k * M1 / 2) + (k * M2 / 2) / 100000   
     expectedProtocolTokenGain_B:  (k * M1 / 2) + (k * M2 / 2) / 100000                           

     expectedProtocolTokenGain_C:  ((k * M2)  + (k * M3) / 100000) * 9999.9/10000   
     expectedProtocolTokenGain_D:  ((k * M3)  + (k * M4) / 100000) * 9999.9/10000 
     expectedProtocolTokenGain_E:  (k * M4) * 9999.9/10000 

     expectedProtocolTokenGain_F1:  (1 - k) * (M1 + M2 + M3 + M4)
     */

      const expectedProtocolTokenGain_A_and_B = kickbackRate
        .mul(issuance_M1)
        .div(toBN("2"))
        .div(toBN(dec(1, 18))) // gain from L1
        .add(
          kickbackRate
            .mul(issuance_M2)
            .div(toBN("2"))
            .div(toBN(dec(1, 18)))
            .div(toBN("100000")),
        ); // gain from L2 after deposit depleted

      const expectedProtocolTokenGain_C = kickbackRate
        .mul(issuance_M2)
        .div(toBN(dec(1, 18))) // gain from L2
        .add(
          kickbackRate
            .mul(issuance_M3)
            .div(toBN(dec(1, 18)))
            .div(toBN("100000")), // gain from L3 after deposit depleted
        )
        .mul(toBN("99999"))
        .div(toBN("100000")); // Scale by 9999.9/10000

      const expectedProtocolTokenGain_D = kickbackRate
        .mul(issuance_M3)
        .div(toBN(dec(1, 18))) // gain from L3
        .add(
          kickbackRate
            .mul(issuance_M4)
            .div(toBN(dec(1, 18)))
            .div(toBN("100000")), // gain from L4
        )
        .mul(toBN("99999"))
        .div(toBN("100000")); // Scale by 9999.9/10000

      const expectedProtocolTokenGain_E = kickbackRate
        .mul(issuance_M4)
        .div(toBN(dec(1, 18))) // gain from L4
        .mul(toBN("99999"))
        .div(toBN("100000")); // Scale by 9999.9/10000

      const issuance1st4Months = issuance_M1.add(issuance_M2).add(issuance_M3).add(issuance_M4);
      const expectedProtocolTokenGain_F1 = toBN(dec(1, 18))
        .sub(kickbackRate)
        .mul(issuance1st4Months)
        .div(toBN(dec(1, 18)));

      assert.isAtMost(getDifference(expectedProtocolTokenGain_A_and_B, ProtocolTokenGain_A), 1e15);
      assert.isAtMost(getDifference(expectedProtocolTokenGain_A_and_B, ProtocolTokenGain_B), 1e15);
      assert.isAtMost(getDifference(expectedProtocolTokenGain_C, ProtocolTokenGain_C), 1e15);
      assert.isAtMost(getDifference(expectedProtocolTokenGain_D, ProtocolTokenGain_D), 1e15);
      assert.isAtMost(getDifference(expectedProtocolTokenGain_E, ProtocolTokenGain_E), 1e15);
      assert.isAtMost(getDifference(expectedProtocolTokenGain_F1, ProtocolTokenGain_F1), 1e15);
    });
  });
});

contract("Reset chain state", async () => {});
