const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;
const mv = testHelpers.MoneyValues;
const timeValues = testHelpers.TimeValues;

contract("CollSurplusPool", async () => {
  let owner, A, B, C, D, E, F;

  let borrowerOperations;
  let priceFeed;
  let collSurplusPool;

  let contracts;

  const openTrove = async (params) => th.openTrove(contracts, params);

  before(async () => {
    [owner, A, B, C, D, E] = await ethers.getSigners();

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

    await deploymentHelper.deployProtocolTokenContracts(owner.address, cpContracts);

    priceFeed = contracts.priceFeedTestnet;
    collSurplusPool = contracts.collSurplusPool;
    borrowerOperations = contracts.borrowerOperations;
  });

  it("CollSurplusPool::getFIL(): Returns the FIL balance of the CollSurplusPool after redemption", async () => {
    const FIL_1 = await collSurplusPool.getFIL();
    assert.equal(FIL_1, "0");

    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    const { collateral: B_coll, netDebt: B_netDebt } = await openTrove({
      ICR: toBN(dec(200, 16)),
      extraParams: { from: B },
    });
    await openTrove({
      extraDebtTokenAmount: B_netDebt,
      extraParams: { from: A, value: dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider);

    // At FIL:USD = 100, this redemption should leave 1 ether of coll surplus
    await th.redeemCollateralAndGetTxObject(A, contracts, B_netDebt);

    const FIL_2 = await collSurplusPool.getFIL();
    th.assertIsApproximatelyEqual(FIL_2, B_coll.sub(B_netDebt.mul(mv._1e18BN).div(price)));
  });

  it("CollSurplusPool: claimColl(): Reverts if caller is not Borrower Operations", async () => {
    await th.assertRevert(
      collSurplusPool.connect(A).claimColl(A.address),
      "CollSurplusPool: Caller is not Borrower Operations",
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if nothing to claim", async () => {
    await th.assertRevert(
      borrowerOperations.connect(A).claimCollateral(),
      "CollSurplusPool: No collateral available to claim",
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if owner cannot receive FIL surplus", async () => {
    const FIL_Before = await collSurplusPool.getFIL();

    const nonPayableFactory = await deploymentHelper.getFactory("NonPayable");
    const nonPayable = await nonPayableFactory.deploy();

    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    // open trove from NonPayable proxy contract
    const B_coll = toBN(dec(60, 18));
    const B_debtTokenAmount = toBN(dec(3000, 18));
    const B_netDebt = await th.getAmountWithBorrowingFee(contracts, B_debtTokenAmount);
    const openTroveData = th.getTransactionData("openTrove(uint256,uint256,address,address)", [
      "0xde0b6b3a7640000",
      B_debtTokenAmount.toString(),
      B.address,
      B.address,
    ]);
    await nonPayable.forward(borrowerOperations.address, openTroveData, { value: B_coll });
    await openTrove({
      extraDebtTokenAmount: B_netDebt,
      extraParams: { from: D, value: dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider);

    // At FIL:USD = 100, this redemption should leave 1 ether of coll surplus for B
    await th.redeemCollateralAndGetTxObject(D, contracts, B_netDebt);

    const FIL_After = await collSurplusPool.getFIL();

    th.assertIsApproximatelyEqual(
      FIL_After.sub(FIL_Before),
      B_coll.sub(B_netDebt.mul(mv._1e18BN).div(price)),
    );

    const claimCollateralData = th.getTransactionData("claimCollateral()", []);
    await th.assertRevert(
      nonPayable.forward(borrowerOperations.address, claimCollateralData),
      "CollSurplusPool: sending FIL failed",
    );
  });

  it("CollSurplusPool: reverts trying to send FIL to it", async () => {
    await th.assertRevert(
      web3.eth.sendTransaction({ from: A.address, to: collSurplusPool.address, value: 1 }),
      "CollSurplusPool: Caller is not Active Pool",
    );
  });

  it("CollSurplusPool: accountSurplus: reverts if caller is not Trove Manager", async () => {
    await th.assertRevert(
      collSurplusPool.accountSurplus(A.address, 1),
      "CollSurplusPool: Caller is not TroveManager",
    );
  });
});

contract("Reset chain state", async () => {});
