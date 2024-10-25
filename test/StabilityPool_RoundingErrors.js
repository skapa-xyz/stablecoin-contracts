const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;

contract("Pool Manager: Sum-Product rounding errors", async (accounts) => {
  const whale = accounts[0];

  let contracts;

  let priceFeed;
  let debtToken;
  let stabilityPool;
  let troveManager;
  let borrowerOperations;

  const openTrove = async (params) => openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployProtocolCore(th.GAS_COMPENSATION, th.MIN_NET_DEBT);

    priceFeed = contracts.priceFeedTestnet;
    debtToken = contracts.debtToken;
    stabilityPool = contracts.stabilityPool;
    troveManager = contracts.troveManager;
    borrowerOperations = contracts.borrowerOperations;
  });

  // skipped to not slow down CI
  it.skip("Rounding errors: 100 deposits of 100DebtToken into SP, then 200 liquidations of 49DebtToken", async () => {
    const owner = accounts[0];
    const depositors = accounts.slice(1, 101);
    const defaulters = accounts.slice(101, 301);

    for (let account of depositors) {
      await openTrove({
        extraDebtTokenAmount: th.toBN(dec(10000, 18)),
        ICR: th.toBN(dec(2, 18)),
        extraParams: { from: account },
      });
      await stabilityPool.provideToSP(dec(100, 18), { from: account });
    }

    // Defaulter opens trove with 200% ICR
    for (let defaulter of defaulters) {
      await openTrove({ ICR: th.toBN(dec(2, 18)), extraParams: { from: defaulter } });
    }
    const price = await priceFeed.getPrice();

    // price drops by 50%: defaulter ICR falls to 100%
    await priceFeed.setPrice(dec(105, 18));

    // Defaulters liquidated
    for (let defaulter of defaulters) {
      await troveManager.liquidate(defaulter, { from: owner });
    }

    const SP_TotalDeposits = await stabilityPool.getTotalDebtTokenDeposits();
    const SP_FIL = await stabilityPool.getFIL();
    const compoundedDeposit = await stabilityPool.getCompoundedDebtTokenDeposit(depositors[0]);
    const FIL_Gain = await stabilityPool.getCurrentFILGain(depositors[0]);

    // Check depostiors receive their share without too much error
    assert.isAtMost(
      th.getDifference(SP_TotalDeposits.div(th.toBN(depositors.length)), compoundedDeposit),
      100000,
    );
    assert.isAtMost(th.getDifference(SP_FIL.div(th.toBN(depositors.length)), FIL_Gain), 100000);
  });
});

contract("Reset chain state", async (accounts) => {});
