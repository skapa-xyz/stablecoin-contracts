const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const { BNConverter } = require("../utils/BNConverter.js");
const testHelpers = require("../utils/testHelpers.js");

const ProtocolTokenStakingTester = artifacts.require("ProtocolTokenStakingTester");
const TroveManagerTester = artifacts.require("TroveManagerTester");
const NonPayable = artifacts.require("./NonPayable.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const assertRevert = th.assertRevert;

const toBN = th.toBN;
const ZERO = th.toBN("0");

const GAS_PRICE = 10000000;

/* NOTE: These tests do not test for specific FIL and debt token gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific FIL/DebtToken gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 *
 */

contract("ProtocolTokenStaking revenue share tests", async (accounts) => {
  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed;
  let debtToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let protocolTokenStaking;
  let protocolToken;

  let contracts;

  const openTrove = async (params) => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployProtocolCore(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    contracts.troveManager = await TroveManagerTester.new(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    contracts = await deploymentHelper.deployDebtTokenTester(contracts);
    const protocolTokenContracts = await deploymentHelper.deployProtocolTokenTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig,
    );

    await deploymentHelper.connectProtocolTokenContracts(protocolTokenContracts);
    await deploymentHelper.connectCoreContracts(contracts, protocolTokenContracts);
    await deploymentHelper.connectProtocolTokenContractsToCore(protocolTokenContracts, contracts);

    nonPayable = await NonPayable.new();
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
    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
  });

  it("stake(): reverts if amount is zero", async () => {
    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // console.log(`A protocol token bal: ${await protocolToken.balanceOf(A)}`)

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await assertRevert(
      protocolTokenStaking.stake(0, { from: A }),
      "ProtocolTokenStaking: Amount must be non-zero",
    );
  });

  it("FIL fee per ProtocolToken staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // console.log(`A protocol token bal: ${await protocolToken.balanceOf(A)}`)

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(100, 18), { from: A });

    // Check FIL fee per unit staked is zero
    const F_FIL_Before = await protocolTokenStaking.F_FIL();
    assert.equal(F_FIL_Before, "0");

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE,
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee emitted in event is non-zero
    const emittedFILFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedFILFee.gt(toBN("0")));

    // Check FIL fee per unit staked has increased by correct amount
    const F_FIL_After = await protocolTokenStaking.F_FIL();

    // Expect fee per unit staked = fee/100, since there is 100 DebtToken totalStaked
    const expected_F_FIL_After = emittedFILFee.div(toBN("100"));

    assert.isTrue(expected_F_FIL_After.eq(F_FIL_After));
  });

  it("FIL fee per ProtocolToken staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig, gasPrice: GAS_PRICE });

    // Check FIL fee per unit staked is zero
    const F_FIL_Before = await protocolTokenStaking.F_FIL();
    assert.equal(F_FIL_Before, "0");

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE,
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee emitted in event is non-zero
    const emittedFILFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3]);
    assert.isTrue(emittedFILFee.gt(toBN("0")));

    // Check FIL fee per unit staked has not increased
    const F_FIL_After = await protocolTokenStaking.F_FIL();
    assert.equal(F_FIL_After, "0");
  });

  it("DebtToken fee per ProtocolToken staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(100, 18), { from: A });

    // Check DebtToken fee per unit staked is zero
    const F_DebtToken_Before = await protocolTokenStaking.F_FIL();
    assert.equal(F_DebtToken_Before, "0");

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawDebtToken(th._100pct, dec(27, 18), D, D, {
      from: D,
    });

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee = toBN(th.getFeeFromDebtTokenBorrowingEvent(tx));
    assert.isTrue(emittedDebtTokenFee.gt(toBN("0")));

    // Check DebtToken fee per unit staked has increased by correct amount
    const F_DebtToken_After = await protocolTokenStaking.F_DebtToken();

    // Expect fee per unit staked = fee/100, since there is 100 DebtToken totalStaked
    const expected_F_DebtToken_After = emittedDebtTokenFee.div(toBN("100"));

    assert.isTrue(expected_F_DebtToken_After.eq(F_DebtToken_After));
  });

  it("DebtToken fee per ProtocolToken staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // Check DebtToken fee per unit staked is zero
    const F_DebtToken_Before = await protocolTokenStaking.F_FIL();
    assert.equal(F_DebtToken_Before, "0");

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawDebtToken(th._100pct, dec(27, 18), D, D, {
      from: D,
    });

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee = toBN(th.getFeeFromDebtTokenBorrowingEvent(tx));
    assert.isTrue(emittedDebtTokenFee.gt(toBN("0")));

    // Check DebtToken fee per unit staked did not increase, is still zero
    const F_DebtToken_After = await protocolTokenStaking.F_DebtToken();
    assert.equal(F_DebtToken_After, "0");
  });

  it("ProtocolToken Staking: A single staker earns all FIL and ProtocolToken fees that occur", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(100, 18), { from: A });

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee 1 emitted in event is non-zero
    const emittedFILFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedFILFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await debtToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const C_BalAfterRedemption = await debtToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check FIL fee 2 emitted in event is non-zero
    const emittedFILFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedFILFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_1 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedDebtTokenFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_2 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedDebtTokenFee_2.gt(toBN("0")));

    const expectedTotalFILGain = emittedFILFee_1.add(emittedFILFee_2);
    const expectedTotalDebtTokenGain = emittedDebtTokenFee_1.add(emittedDebtTokenFee_2);

    const A_FILBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(A));

    // A un-stakes
    const GAS_Used = th.gasUsed(
      await protocolTokenStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE }),
    );

    const A_FILBalance_After = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_After = toBN(await debtToken.balanceOf(A));

    const A_FILGain = A_FILBalance_After.sub(A_FILBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_DebtTokenGain = A_DebtTokenBalance_After.sub(A_DebtTokenBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalFILGain, A_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalDebtTokenGain, A_DebtTokenGain), 1000);
  });

  it("stake(): Top-up sends out all accumulated FIL and DebtToken gains to the staker", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee 1 emitted in event is non-zero
    const emittedFILFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedFILFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await debtToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const C_BalAfterRedemption = await debtToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check FIL fee 2 emitted in event is non-zero
    const emittedFILFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedFILFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_1 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedDebtTokenFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_2 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedDebtTokenFee_2.gt(toBN("0")));

    const expectedTotalFILGain = emittedFILFee_1.add(emittedFILFee_2);
    const expectedTotalDebtTokenGain = emittedDebtTokenFee_1.add(emittedDebtTokenFee_2);

    const A_FILBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(A));

    // A tops up
    const GAS_Used = th.gasUsed(
      await protocolTokenStaking.stake(dec(50, 18), { from: A, gasPrice: GAS_PRICE }),
    );

    const A_FILBalance_After = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_After = toBN(await debtToken.balanceOf(A));

    const A_FILGain = A_FILBalance_After.sub(A_FILBalance_Before).add(toBN(GAS_Used * GAS_PRICE));
    const A_DebtTokenGain = A_DebtTokenBalance_After.sub(A_DebtTokenBalance_Before);

    assert.isAtMost(th.getDifference(expectedTotalFILGain, A_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedTotalDebtTokenGain, A_DebtTokenGain), 1000);
  });

  it("getPendingFILGain(): Returns the staker's correct pending FIL gain", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee 1 emitted in event is non-zero
    const emittedFILFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedFILFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await debtToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const C_BalAfterRedemption = await debtToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check FIL fee 2 emitted in event is non-zero
    const emittedFILFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedFILFee_2.gt(toBN("0")));

    const expectedTotalFILGain = emittedFILFee_1.add(emittedFILFee_2);

    const A_FILGain = await protocolTokenStaking.getPendingFILGain(A);

    assert.isAtMost(th.getDifference(expectedTotalFILGain, A_FILGain), 1000);
  });

  it("getPendingDebtTokenGain(): Returns the staker's correct pending DebtToken gain", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await debtToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const B_BalAfterRedemption = await debtToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check FIL fee 1 emitted in event is non-zero
    const emittedFILFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedFILFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await debtToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE),
    );

    const C_BalAfterRedemption = await debtToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check FIL fee 2 emitted in event is non-zero
    const emittedFILFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedFILFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_1 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedDebtTokenFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B },
    );

    // Check DebtToken fee value in event is non-zero
    const emittedDebtTokenFee_2 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedDebtTokenFee_2.gt(toBN("0")));

    const expectedTotalDebtTokenGain = emittedDebtTokenFee_1.add(emittedDebtTokenFee_2);
    const A_DebtTokenGain = await protocolTokenStaking.getPendingDebtTokenGain(A);

    assert.isAtMost(th.getDifference(expectedTotalDebtTokenGain, A_DebtTokenGain), 1000);
  });

  // - multi depositors, several rewards
  it("ProtocolToken Staking: Multiple stakers earn the correct share of all FIL and ProtocolToken fees, based on their stake size", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G },
    });

    // FF time one year so owner can transfer ProtocolToken
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A, B, C
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });
    await protocolToken.transfer(B, dec(200, 18), { from: multisig });
    await protocolToken.transfer(C, dec(300, 18), { from: multisig });

    // A, B, C make stake
    await protocolToken.approve(protocolTokenStaking.address, dec(100, 18), { from: A });
    await protocolToken.approve(protocolTokenStaking.address, dec(200, 18), { from: B });
    await protocolToken.approve(protocolTokenStaking.address, dec(300, 18), { from: C });
    await protocolTokenStaking.stake(dec(100, 18), { from: A });
    await protocolTokenStaking.stake(dec(200, 18), { from: B });
    await protocolTokenStaking.stake(dec(300, 18), { from: C });

    // Confirm staking contract holds 600 ProtocolToken
    // console.log(`protocol token staking ProtocolToken bal: ${await protocolToken.balanceOf(protocolTokenStaking.address)}`)
    assert.equal(await protocolToken.balanceOf(protocolTokenStaking.address), dec(600, 18));
    assert.equal(await protocolTokenStaking.totalProtocolTokenStaked(), dec(600, 18));

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      F,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE),
    );
    const emittedFILFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3]);
    assert.isTrue(emittedFILFee_1.gt(toBN("0")));

    // G redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      G,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE),
    );
    const emittedFILFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3]);
    assert.isTrue(emittedFILFee_2.gt(toBN("0")));

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(104, 18),
      F,
      F,
      { from: F },
    );
    const emittedDebtTokenFee_1 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_1));
    assert.isTrue(emittedDebtTokenFee_1.gt(toBN("0")));

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G },
    );
    const emittedDebtTokenFee_2 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_2));
    assert.isTrue(emittedDebtTokenFee_2.gt(toBN("0")));

    // D obtains ProtocolToken from owner and makes a stake
    await protocolToken.transfer(D, dec(50, 18), { from: multisig });
    await protocolToken.approve(protocolTokenStaking.address, dec(50, 18), { from: D });
    await protocolTokenStaking.stake(dec(50, 18), { from: D });

    // Confirm staking contract holds 650 ProtocolToken
    assert.equal(await protocolToken.balanceOf(protocolTokenStaking.address), dec(650, 18));
    assert.equal(await protocolTokenStaking.totalProtocolTokenStaked(), dec(650, 18));

    // G redeems
    const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE),
    );
    const emittedFILFee_3 = toBN((await th.getEmittedRedemptionValues(redemptionTx_3))[3]);
    assert.isTrue(emittedFILFee_3.gt(toBN("0")));

    // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawDebtToken(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G },
    );
    const emittedDebtTokenFee_3 = toBN(th.getFeeFromDebtTokenBorrowingEvent(borrowingTx_3));
    assert.isTrue(emittedDebtTokenFee_3.gt(toBN("0")));

    /*  
    Expected rewards:

    A_FIL: (100* FILFee_1)/600 + (100* FILFee_2)/600 + (100*FIL_Fee_3)/650
    B_FIL: (200* FILFee_1)/600 + (200* FILFee_2)/600 + (200*FIL_Fee_3)/650
    C_FIL: (300* FILFee_1)/600 + (300* FILFee_2)/600 + (300*FIL_Fee_3)/650
    D_FIL:                                             (100*FIL_Fee_3)/650

    A_DebtToken: (100*DebtTokenFee_1 )/600 + (100* DebtTokenFee_2)/600 + (100*DebtTokenFee_3)/650
    B_DebtToken: (200* DebtTokenFee_1)/600 + (200* DebtTokenFee_2)/600 + (200*DebtTokenFee_3)/650
    C_DebtToken: (300* DebtTokenFee_1)/600 + (300* DebtTokenFee_2)/600 + (300*DebtTokenFee_3)/650
    D_DebtToken:                                               (100*DebtTokenFee_3)/650
    */

    // Expected FIL gains
    const expectedFILGain_A = toBN("100")
      .mul(emittedFILFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedFILFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedFILFee_3).div(toBN("650")));

    const expectedFILGain_B = toBN("200")
      .mul(emittedFILFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedFILFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedFILFee_3).div(toBN("650")));

    const expectedFILGain_C = toBN("300")
      .mul(emittedFILFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedFILFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedFILFee_3).div(toBN("650")));

    const expectedFILGain_D = toBN("50").mul(emittedFILFee_3).div(toBN("650"));

    // Expected DebtToken gains:
    const expectedDebtTokenGain_A = toBN("100")
      .mul(emittedDebtTokenFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedDebtTokenFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedDebtTokenFee_3).div(toBN("650")));

    const expectedDebtTokenGain_B = toBN("200")
      .mul(emittedDebtTokenFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedDebtTokenFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedDebtTokenFee_3).div(toBN("650")));

    const expectedDebtTokenGain_C = toBN("300")
      .mul(emittedDebtTokenFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedDebtTokenFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedDebtTokenFee_3).div(toBN("650")));

    const expectedDebtTokenGain_D = toBN("50").mul(emittedDebtTokenFee_3).div(toBN("650"));

    const A_FILBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(A));
    const B_FILBalance_Before = toBN(await web3.eth.getBalance(B));
    const B_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(B));
    const C_FILBalance_Before = toBN(await web3.eth.getBalance(C));
    const C_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(C));
    const D_FILBalance_Before = toBN(await web3.eth.getBalance(D));
    const D_DebtTokenBalance_Before = toBN(await debtToken.balanceOf(D));

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(
      await protocolTokenStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE }),
    );
    const B_GAS_Used = th.gasUsed(
      await protocolTokenStaking.unstake(dec(200, 18), { from: B, gasPrice: GAS_PRICE }),
    );
    const C_GAS_Used = th.gasUsed(
      await protocolTokenStaking.unstake(dec(400, 18), { from: C, gasPrice: GAS_PRICE }),
    );
    const D_GAS_Used = th.gasUsed(
      await protocolTokenStaking.unstake(dec(50, 18), { from: D, gasPrice: GAS_PRICE }),
    );

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await protocolToken.balanceOf(protocolTokenStaking.address), "0");
    assert.equal(await protocolTokenStaking.totalProtocolTokenStaked(), "0");

    // Get A-D FIL and DebtToken balances
    const A_FILBalance_After = toBN(await web3.eth.getBalance(A));
    const A_DebtTokenBalance_After = toBN(await debtToken.balanceOf(A));
    const B_FILBalance_After = toBN(await web3.eth.getBalance(B));
    const B_DebtTokenBalance_After = toBN(await debtToken.balanceOf(B));
    const C_FILBalance_After = toBN(await web3.eth.getBalance(C));
    const C_DebtTokenBalance_After = toBN(await debtToken.balanceOf(C));
    const D_FILBalance_After = toBN(await web3.eth.getBalance(D));
    const D_DebtTokenBalance_After = toBN(await debtToken.balanceOf(D));

    // Get FIL and DebtToken gains
    const A_FILGain = A_FILBalance_After.sub(A_FILBalance_Before).add(toBN(A_GAS_Used * GAS_PRICE));
    const A_DebtTokenGain = A_DebtTokenBalance_After.sub(A_DebtTokenBalance_Before);
    const B_FILGain = B_FILBalance_After.sub(B_FILBalance_Before).add(toBN(B_GAS_Used * GAS_PRICE));
    const B_DebtTokenGain = B_DebtTokenBalance_After.sub(B_DebtTokenBalance_Before);
    const C_FILGain = C_FILBalance_After.sub(C_FILBalance_Before).add(toBN(C_GAS_Used * GAS_PRICE));
    const C_DebtTokenGain = C_DebtTokenBalance_After.sub(C_DebtTokenBalance_Before);
    const D_FILGain = D_FILBalance_After.sub(D_FILBalance_Before).add(toBN(D_GAS_Used * GAS_PRICE));
    const D_DebtTokenGain = D_DebtTokenBalance_After.sub(D_DebtTokenBalance_Before);

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedFILGain_A, A_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedDebtTokenGain_A, A_DebtTokenGain), 1000);
    assert.isAtMost(th.getDifference(expectedFILGain_B, B_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedDebtTokenGain_B, B_DebtTokenGain), 1000);
    assert.isAtMost(th.getDifference(expectedFILGain_C, C_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedDebtTokenGain_C, C_DebtTokenGain), 1000);
    assert.isAtMost(th.getDifference(expectedFILGain_D, D_FILGain), 1000);
    assert.isAtMost(th.getDifference(expectedDebtTokenGain_D, D_DebtTokenGain), 1000);
  });

  it("unstake(): reverts if caller has FIL gains and can't receive FIL", async () => {
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraDebtTokenAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

    // multisig transfers ProtocolToken to staker A and the non-payable proxy
    await protocolToken.transfer(A, dec(100, 18), { from: multisig });
    await protocolToken.transfer(nonPayable.address, dec(100, 18), { from: multisig });

    //  A makes stake
    const A_stakeTx = await protocolTokenStaking.stake(dec(100, 18), { from: A });
    assert.isTrue(A_stakeTx.receipt.status);

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData("stake(uint256)", ["0x56bc75e2d63100000"]); // proxy stakes 100 ProtocolToken
    await nonPayable.forward(protocolTokenStaking.address, proxystakeTxData, { from: A });

    // B makes a redemption, creating FIL gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE),
    );

    const proxy_FILGain = await protocolTokenStaking.getPendingFILGain(nonPayable.address);
    assert.isTrue(proxy_FILGain.gt(toBN("0")));

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated FIL gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData("unstake(uint256)", [
      "0x56bc75e2d63100000",
    ]); // proxy stakes 100 ProtocolToken
    const proxyUnstakeTxPromise = nonPayable.forward(
      protocolTokenStaking.address,
      proxyUnStakeTxData,
      {
        from: A,
      },
    );

    // but nonPayable proxy can not accept FIL - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise);
  });

  it("receive(): reverts when it receives FIL from an address that is not the Active Pool", async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: protocolTokenStaking.address,
      from: A,
      value: dec(1, "ether"),
    });
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: protocolTokenStaking.address,
      from: owner,
      value: dec(1, "ether"),
    });

    await assertRevert(ethSendTxPromise1);
    await assertRevert(ethSendTxPromise2);
  });

  it("unstake(): reverts if user has no stake", async () => {
    const unstakeTxPromise1 = protocolTokenStaking.unstake(1, { from: A });
    const unstakeTxPromise2 = protocolTokenStaking.unstake(1, { from: owner });

    await assertRevert(unstakeTxPromise1);
    await assertRevert(unstakeTxPromise2);
  });

  it("Test requireCallerIsTroveManager", async () => {
    const protocolTokenStakingTester = await ProtocolTokenStakingTester.new();
    await assertRevert(
      protocolTokenStakingTester.requireCallerIsTroveManager(),
      "ProtocolTokenStaking: caller is not TroveM",
    );
  });
});
