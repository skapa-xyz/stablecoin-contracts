const testHelpers = require("../utils/testHelpers.js");
const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;

// run with:
// npx hardhat --config hardhat.config.echidna.js test fuzzTests/echidna_debug.js

contract("Echidna debugger", async (accounts) => {
  let echidnaTester;
  let troveManager;
  let debtToken;
  let activePool;
  let defaultPool;
  let stabilityPool;
  let gasPoolAddress;

  before(async () => {
    const echidnaTesterFactory = await ethers.getContractFactory("EchidnaTester");

    echidnaTester = await echidnaTesterFactory.deploy({ value: toBN(dec(11, 25)) });
    troveManager = await ethers.getContractAt("TroveManager", await echidnaTester.troveManager());
    debtToken = await ethers.getContractAt("DebtToken", await echidnaTester.debtToken());
    activePool = await ethers.getContractAt("ActivePool", await echidnaTester.activePool());
    defaultPool = await ethers.getContractAt("DefaultPool", await echidnaTester.defaultPool());
    stabilityPool = await ethers.getContractAt(
      "StabilityPool",
      await echidnaTester.stabilityPool(),
    );

    gasPoolAddress = await troveManager.gasPoolAddress();
  });

  it.skip("openTrove", async () => {
    await echidnaTester.openTroveExt(
      "28533397325200555203581702704626658822751905051193839801320459908900876958892",
      "52469987802830075086048985199642144541375565475567220729814021622139768827880",
      "9388634783070735775888100571650283386615011854365252563480851823632223689886",
    );
  });

  it.skip("openTrove", async () => {
    await echidnaTester.openTroveExt("0", "0", "0");
  });

  it.skip("trove order", async () => {
    const trove1 = await echidnaTester.echidnaProxies(0);
    console.log(trove1);
    const trove2 = await echidnaTester.echidnaProxies(1);

    const icr1_before = await troveManager.getCurrentICR(trove1, "1000000000000000000");
    const icr2_before = await troveManager.getCurrentICR(trove2, "1000000000000000000");
    console.log("Trove 1", icr1_before, icr1_before.toString());
    console.log("Trove 2", icr2_before, icr2_before.toString());

    await echidnaTester.openTroveExt("0", "0", "30540440604590048251848424");
    await echidnaTester.openTroveExt("1", "0", "0");
    await echidnaTester.setPriceExt(
      "78051143795343077331468494330613608802436946862454908477491916",
    );
    const icr1_after = await troveManager.getCurrentICR(trove1, "1000000000000000000");
    const icr2_after = await troveManager.getCurrentICR(trove2, "1000000000000000000");
    console.log("Trove 1", icr1_after, icr1_after.toString());
    console.log("Trove 2", icr2_after, icr2_after.toString());

    const icr1_after_price = await troveManager.getCurrentICR(
      trove1,
      "78051143795343077331468494330613608802436946862454908477491916",
    );
    const icr2_after_price = await troveManager.getCurrentICR(
      trove2,
      "78051143795343077331468494330613608802436946862454908477491916",
    );
    console.log("Trove 1", icr1_after_price, icr1_after_price.toString());
    console.log("Trove 2", icr2_after_price, icr2_after_price.toString());
  });

  it("Debt token balance", async () => {
    await echidnaTester.openTroveExt("0", "20000000000000000000", "421096516990880543944");

    const totalSupply = await debtToken.totalSupply();
    const gasPoolBalance = await debtToken.balanceOf(gasPoolAddress);
    const activePoolBalance = await activePool.getDebt();
    const defaultPoolBalance = await defaultPool.getDebt();
    const stabilityPoolBalance = await stabilityPool.getTotalDebtTokenDeposits();
    const currentTrove = await echidnaTester.echidnaProxies(0);
    const troveBalance = await debtToken.balanceOf(currentTrove);

    console.log("totalSupply", totalSupply.toString());
    console.log("gasPoolBalance", gasPoolBalance.toString());
    console.log("activePoolBalance", activePoolBalance.toString());
    console.log("defaultPoolBalance", defaultPoolBalance.toString());
    console.log("stabilityPoolBalance", stabilityPoolBalance.toString());
    console.log("troveBalance", troveBalance.toString());
  });
});
