const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;

/* NOTE: Some tests involving FIL redemption fees do not test for specific fee values.
 * Some only test that the fees are non-zero when they should occur.
 *
 * Specific FIL gain values will depend on the final fee schedule used, and the final choices for
 * the parameter BETA in the TroveManager, which is still TBD based on economic modelling.
 *
 */
contract("TroveManager", async () => {
  const ZERO_ADDRESS = th.ZERO_ADDRESS;
  let signers;
  let owner, A, B, C, D, E, F;
  let lpRewardsAddress, multisig;

  let priceFeed;
  let troveManager;
  let borrowerOperations;

  let contracts;

  const getOpenTroveDebtTokenAmount = async (totalDebt) =>
    th.getOpenTroveDebtTokenAmount(contracts, totalDebt);

  const getSnapshotsRatio = async () => {
    const ratio = (await troveManager.totalStakesSnapshot())
      .mul(toBN(dec(1, 18)))
      .div(await troveManager.totalCollateralSnapshot());

    return ratio;
  };

  before(async () => {
    signers = await ethers.getSigners();

    [owner, A, B, C, D, E, F] = signers;
    [lpRewardsAddress, multisig] = signers.slice(998, 1000);
  });

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

    await deploymentHelper.deployProtocolTokenContracts(owner.address, cpContracts);

    priceFeed = contracts.priceFeedTestnet;
    troveManager = contracts.troveManager;
    borrowerOperations = contracts.borrowerOperations;
  });

  it("A given trove's stake decline is negligible with adjustments and tiny liquidations", async () => {
    await priceFeed.setPrice(dec(100, 18));

    // Make 1 mega troves A at ~50% total collateral
    await borrowerOperations
      .connect(A)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(1, 31)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(2, 29) },
      );

    // Make 5 large troves B, C, D, E, F at ~10% total collateral
    await borrowerOperations
      .connect(B)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(2, 30)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(4, 28) },
      );
    await borrowerOperations
      .connect(C)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(2, 30)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(4, 28) },
      );
    await borrowerOperations
      .connect(D)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(2, 30)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(4, 28) },
      );
    await borrowerOperations
      .connect(E)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(2, 30)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(4, 28) },
      );
    await borrowerOperations
      .connect(F)
      .openTrove(
        th._100pct,
        await getOpenTroveDebtTokenAmount(dec(2, 30)),
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        { value: dec(4, 28) },
      );

    // Make 10 tiny troves at relatively negligible collateral (~1e-9 of total)
    const tinyTroves = signers.slice(10, 20);
    for (const account of tinyTroves) {
      await borrowerOperations
        .connect(account)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(1, 22)),
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          { value: dec(2, 20) },
        );
    }

    // liquidate 1 trove at ~50% total system collateral
    await priceFeed.setPrice(dec(50, 18));
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));
    await troveManager.liquidate(A.address);

    console.log(`totalStakesSnapshot after L1: ${await troveManager.totalStakesSnapshot()}`);
    console.log(
      `totalCollateralSnapshot after L1: ${await troveManager.totalCollateralSnapshot()}`,
    );
    console.log(`Snapshots ratio after L1: ${await getSnapshotsRatio()}`);
    console.log(
      `B pending FIL reward after L1: ${await troveManager.getPendingFILReward(B.address)}`,
    );
    console.log(`B stake after L1: ${(await troveManager.Troves(B.address))[2]}`);

    // adjust trove B 1 wei: apply rewards
    await borrowerOperations
      .connect(B)
      .adjustTrove(th._100pct, 0, 1, false, ZERO_ADDRESS, ZERO_ADDRESS); // B repays 1 wei
    console.log(`B stake after A1: ${(await troveManager.Troves(B.address))[2]}`);
    console.log(`Snapshots ratio after A1: ${await getSnapshotsRatio()}`);

    // Loop over tiny troves, and alternately:
    // - Liquidate a tiny trove
    // - Adjust B's collateral by 1 wei
    for (let [idx, trove] of tinyTroves.entries()) {
      await troveManager.liquidate(trove.address);
      console.log(`B stake after L${idx + 2}: ${(await troveManager.Troves(B.address))[2]}`);
      console.log(`Snapshots ratio after L${idx + 2}: ${await getSnapshotsRatio()}`);
      await borrowerOperations
        .connect(B)
        .adjustTrove(th._100pct, 0, 1, false, ZERO_ADDRESS, ZERO_ADDRESS); // A repays 1 wei
      console.log(`B stake after A${idx + 2}: ${(await troveManager.Troves(B.address))[2]}`);
    }
  });

  // TODO: stake decline for adjustments with sizable liquidations, for comparison
});
