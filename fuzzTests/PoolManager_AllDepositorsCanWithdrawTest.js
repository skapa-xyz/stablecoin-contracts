const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const _100pct = th._100pct;
const dec = th.dec;
const toBN = th.toBN;

const ZERO_ADDRESS = th.ZERO_ADDRESS;

/*
 * Naive fuzz test that checks whether all SP depositors can successfully withdraw from the SP, after a random sequence
 * of deposits and liquidations.
 *
 * The test cases tackle different size ranges for liquidated collateral and SP deposits.
 */

contract(
  "PoolManager - random liquidations/deposits, then check all depositors can withdraw",
  async () => {
    let signers;
    let whale;

    let contracts;

    let priceFeed;
    let debtToken;
    let troveManager;
    let stabilityPool;
    let sortedTroves;
    let borrowerOperations;

    const skyrocketPriceAndCheckAllTrovesSafe = async () => {
      // price skyrockets, therefore no undercollateralized troes
      await priceFeed.setPrice(dec(1000, 18));
      const lowestICR = await troveManager.getCurrentICR(
        await sortedTroves.getLast(),
        dec(1000, 18),
      );
      assert.isTrue(lowestICR.gt(toBN(dec(110, 16))));
    };

    const performLiquidation = async (remainingDefaulters, liquidatedAccountsDict) => {
      if (remainingDefaulters.length === 0) {
        return;
      }

      const randomDefaulterIndex = Math.floor(Math.random() * remainingDefaulters.length);
      const randomDefaulter = remainingDefaulters[randomDefaulterIndex];

      const liquidatedDebt = (await troveManager.Troves(randomDefaulter.address))[0];
      const liquidatedFIL = (await troveManager.Troves(randomDefaulter.address))[1];

      const price = await priceFeed.getPrice();
      const ICR = (await troveManager.getCurrentICR(randomDefaulter.address, price)).toString();
      const ICRPercent = ICR.slice(0, ICR.length - 16);

      console.log(`SP address: ${stabilityPool.address}`);
      const debtTokenInPoolBefore = await stabilityPool.getTotalDebtTokenDeposits();
      const liquidatedTx = await troveManager
        .connect(signers[0])
        .liquidate(randomDefaulter.address);
      const liquidatedReceipt = await liquidatedTx.wait();
      const debtTokenInPoolAfter = await stabilityPool.getTotalDebtTokenDeposits();

      assert.equal(liquidatedReceipt.status, 1);

      if (liquidatedReceipt.status) {
        liquidatedAccountsDict[randomDefaulter.address] = true;
        remainingDefaulters.splice(randomDefaulterIndex, 1);
      }
      if (await troveManager.checkRecoveryMode(price)) {
        console.log("recovery mode: TRUE");
      }

      console.log(
        `Liquidation. addr: ${th.squeezeAddr(randomDefaulter.address)} ICR: ${ICRPercent}% coll: ${liquidatedFIL} debt: ${liquidatedDebt} SP debt token before: ${debtTokenInPoolBefore} SP debt token after: ${debtTokenInPoolAfter} tx success: ${liquidatedReceipt.status}`,
      );
    };

    const performSPDeposit = async (
      depositorAccounts,
      currentDepositors,
      currentDepositorsDict,
    ) => {
      const randomIndex = Math.floor(Math.random() * depositorAccounts.length);
      const randomDepositor = depositorAccounts[randomIndex];

      const userBalance = await debtToken.balanceOf(randomDepositor.address);
      const maxDebtTokenDeposit = userBalance.div(toBN(dec(1, 18)));

      const randomDebtTokenAmount = th.randAmountInWei(1, maxDebtTokenDeposit);

      const depositTx = await stabilityPool
        .connect(randomDepositor)
        .provideToSP(randomDebtTokenAmount, ZERO_ADDRESS);
      const depositReceipt = await depositTx.wait();

      assert.equal(depositReceipt.status, 1);

      if (depositReceipt.status && !currentDepositorsDict[randomDepositor.address]) {
        currentDepositorsDict[randomDepositor.address] = true;
        currentDepositors.push(randomDepositor);
      }

      console.log(
        `SP deposit. addr: ${th.squeezeAddr(randomDepositor.address)} amount: ${randomDebtTokenAmount} tx success: ${depositReceipt.status} `,
      );
    };

    const randomOperation = async (
      depositorAccounts,
      remainingDefaulters,
      currentDepositors,
      liquidatedAccountsDict,
      currentDepositorsDict,
    ) => {
      const randomSelection = Math.floor(Math.random() * 2);

      if (randomSelection === 0) {
        await performLiquidation(remainingDefaulters, liquidatedAccountsDict);
      } else if (randomSelection === 1) {
        await performSPDeposit(depositorAccounts, currentDepositors, currentDepositorsDict);
      }
    };

    const attemptWithdrawAllDeposits = async (currentDepositors) => {
      // First, liquidate all remaining undercollateralized troves, so that SP depositors may withdraw

      console.log("\n");
      console.log("--- Attempt to withdraw all deposits ---");
      console.log(`Depositors count: ${currentDepositors.length}`);

      for (depositor of currentDepositors) {
        const initialDeposit = (await stabilityPool.deposits(depositor.address))[0];
        const finalDeposit = await stabilityPool.getCompoundedDebtTokenDeposit(depositor.address);
        const FILGain = await stabilityPool.getDepositorFILGain(depositor.address);
        const FILinSP = (await stabilityPool.getFIL()).toString();
        const DebtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();

        // Attempt to withdraw
        const withdrawalTx = await stabilityPool.connect(depositor).withdrawFromSP(dec(1, 36));
        const withdrawalReceipt = await withdrawalTx.wait();

        const FILinSPAfter = (await stabilityPool.getFIL()).toString();
        const DebtTokenInSPAfter = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
        const debtTokenBalanceSPAfter = await debtToken.balanceOf(stabilityPool.address);
        const depositAfter = await stabilityPool.getCompoundedDebtTokenDeposit(depositor.address);

        console.log(`
--Before withdrawal--
 withdrawer addr: ${th.squeezeAddr(depositor.address)}
  initial deposit: ${initialDeposit}
  FIL gain: ${FILGain}
  FIL in SP: ${FILinSP}
  compounded deposit: ${finalDeposit} 
  Debt token in SP: ${DebtTokenInSP}
 
--After withdrawal--
  Withdrawal tx success: ${withdrawalReceipt.status} 
  Deposit after: ${depositAfter}
  FIL remaining in SP: ${FILinSPAfter}
  SP debt token deposits tracker after: ${DebtTokenInSPAfter}
  SP debt token balance after: ${debtTokenBalanceSPAfter}
  `);
        // Check each deposit can be withdrawn
        assert.equal(withdrawalReceipt.status, 1);
        assert.equal(depositAfter, "0");
      }
    };

    describe("Stability Pool Withdrawals", async () => {
      before(async () => {
        [owner, whale, ...signers] = await ethers.getSigners();

        console.log(`Number of signers: ${signers.length}`);
      });

      beforeEach(async () => {
        await hre.network.provider.send("hardhat_reset");

        const transactionCount = await owner.getTransactionCount();
        const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
          owner.address,
          transactionCount + 1,
        );

        contracts = await deploymentHelper.deployProtocolCore(
          th.GAS_COMPENSATION,
          th.MIN_NET_DEBT,
          cpContracts,
        );
        await deploymentHelper.deployProtocolTokenContracts(owner.address, cpContracts);

        stabilityPool = contracts.stabilityPool;
        priceFeed = contracts.priceFeedTestnet;
        debtToken = contracts.debtToken;
        stabilityPool = contracts.stabilityPool;
        troveManager = contracts.troveManager;
        borrowerOperations = contracts.borrowerOperations;
        sortedTroves = contracts.sortedTroves;
      });

      // mixed deposits/liquidations

      // ranges: low-low, low-high, high-low, high-high, full-full

      // full offsets, partial offsets
      // ensure full offset with whale2 in S
      // ensure partial offset with whale 3 in L

      it("Defaulters' Collateral in range [1, 1e8]. SP Deposits in range [100, 1e10]. FIL:USD = 100", async () => {
        // whale adds coll that holds TCR > 150%
        await borrowerOperations
          .connect(whale)
          .openTrove(_100pct, dec(5, 29), whale.address, whale.address, { value: dec(5, 29) });

        const numberOfOps = 5;
        const defaulterAccounts = signers.slice(1, numberOfOps);
        const depositorAccounts = signers.slice(numberOfOps + 1, numberOfOps * 2);

        const defaulterCollMin = 1;
        const defaulterCollMax = 100000000;
        const defaulterDebtTokenProportionMin = 91;
        const defaulterDebtTokenProportionMax = 180;

        const depositorCollMin = 1;
        const depositorCollMax = 100000000;
        const depositorDebtTokenProportionMin = 100;
        const depositorDebtTokenProportionMax = 100;

        const remainingDefaulters = [...defaulterAccounts];
        const currentDepositors = [];
        const liquidatedAccountsDict = {};
        const currentDepositorsDict = {};

        // setup:
        // account set L all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          defaulterCollMin,
          defaulterCollMax,
          defaulterAccounts,
          contracts,
          defaulterDebtTokenProportionMin,
          defaulterDebtTokenProportionMax,
          true,
        );

        // account set S all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          depositorCollMin,
          depositorCollMax,
          depositorAccounts,
          contracts,
          depositorDebtTokenProportionMin,
          depositorDebtTokenProportionMax,
          true,
        );

        // price drops, all L liquidateable
        await priceFeed.setPrice(dec(1, 18));

        console.log("============ 0");

        // Random sequence of operations: liquidations and SP deposits
        for (i = 0; i < numberOfOps; i++) {
          await randomOperation(
            depositorAccounts,
            remainingDefaulters,
            currentDepositors,
            liquidatedAccountsDict,
            currentDepositorsDict,
          );
        }

        await skyrocketPriceAndCheckAllTrovesSafe();

        const totalDebtTokenDepositsBeforeWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();

        const totalFILRewardsBeforeWithdrawals = await stabilityPool.getFIL();

        await attemptWithdrawAllDeposits(currentDepositors);

        const totalDebtTokenDepositsAfterWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsAfterWithdrawals = await stabilityPool.getFIL();

        console.log(
          `Total debt token deposits before any withdrawals: ${totalDebtTokenDepositsBeforeWithdrawals}`,
        );
        console.log(
          `Total FIL rewards before any withdrawals: ${totalFILRewardsBeforeWithdrawals}`,
        );

        console.log(
          `Remaining debt token deposits after withdrawals: ${totalDebtTokenDepositsAfterWithdrawals}`,
        );
        console.log(`Remaining FIL rewards after withdrawals: ${totalFILRewardsAfterWithdrawals}`);

        console.log(`current depositors length: ${currentDepositors.length}`);
        console.log(`remaining defaulters length: ${remainingDefaulters.length}`);
      });

      it("Defaulters' Collateral in range [1, 10]. SP Deposits in range [1e8, 1e10]. FIL:USD = 100", async () => {
        // whale adds coll that holds TCR > 150%
        await borrowerOperations
          .connect(whale)
          .openTrove(_100pct, dec(5, 29), whale.address, whale.address, { value: dec(5, 29) });

        const numberOfOps = 5;
        const defaulterAccounts = signers.slice(1, numberOfOps);
        const depositorAccounts = signers.slice(numberOfOps + 1, numberOfOps * 2);

        const defaulterCollMin = 20;
        const defaulterCollMax = 200;
        const defaulterDebtTokenProportionMin = 91;
        const defaulterDebtTokenProportionMax = 180;

        const depositorCollMin = 1000000;
        const depositorCollMax = 100000000;
        const depositorDebtTokenProportionMin = 100;
        const depositorDebtTokenProportionMax = 100;

        const remainingDefaulters = [...defaulterAccounts];
        const currentDepositors = [];
        const liquidatedAccountsDict = {};
        const currentDepositorsDict = {};

        // setup:
        // account set L all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          defaulterCollMin,
          defaulterCollMax,
          defaulterAccounts,
          contracts,
          defaulterDebtTokenProportionMin,
          defaulterDebtTokenProportionMax,
        );

        // account set S all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          depositorCollMin,
          depositorCollMax,
          depositorAccounts,
          contracts,
          depositorDebtTokenProportionMin,
          depositorDebtTokenProportionMax,
        );

        // price drops, all L liquidateable
        await priceFeed.setPrice(dec(100, 18));

        // Random sequence of operations: liquidations and SP deposits
        for (i = 0; i < numberOfOps; i++) {
          await randomOperation(
            depositorAccounts,
            remainingDefaulters,
            currentDepositors,
            liquidatedAccountsDict,
            currentDepositorsDict,
          );
        }

        await skyrocketPriceAndCheckAllTrovesSafe();

        const totalDebtTokenDepositsBeforeWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsBeforeWithdrawals = await stabilityPool.getFIL();

        await attemptWithdrawAllDeposits(currentDepositors);

        const totalDebtTokenDepositsAfterWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsAfterWithdrawals = await stabilityPool.getFIL();

        console.log(
          `Total debt token deposits before any withdrawals: ${totalDebtTokenDepositsBeforeWithdrawals}`,
        );
        console.log(
          `Total FIL rewards before any withdrawals: ${totalFILRewardsBeforeWithdrawals}`,
        );

        console.log(
          `Remaining debt token deposits after withdrawals: ${totalDebtTokenDepositsAfterWithdrawals}`,
        );
        console.log(`Remaining FIL rewards after withdrawals: ${totalFILRewardsAfterWithdrawals}`);

        console.log(`current depositors length: ${currentDepositors.length}`);
        console.log(`remaining defaulters length: ${remainingDefaulters.length}`);
      });

      it("Defaulters' Collateral in range [1e6, 1e8]. SP Deposits in range [100, 1000]. Every liquidation empties the Pool. FIL:USD = 100", async () => {
        // whale adds coll that holds TCR > 150%
        await borrowerOperations
          .connect(whale)
          .openTrove(_100pct, dec(5, 29), whale.address, whale.address, { value: dec(5, 29) });

        const numberOfOps = 5;
        const defaulterAccounts = signers.slice(1, numberOfOps);
        const depositorAccounts = signers.slice(numberOfOps + 1, numberOfOps * 2);

        const defaulterCollMin = 1000000;
        const defaulterCollMax = 100000000;
        const defaulterDebtTokenProportionMin = 91;
        const defaulterDebtTokenProportionMax = 180;

        const depositorCollMin = 20;
        const depositorCollMax = 200;
        const depositorDebtTokenProportionMin = 100;
        const depositorDebtTokenProportionMax = 100;

        const remainingDefaulters = [...defaulterAccounts];
        const currentDepositors = [];
        const liquidatedAccountsDict = {};
        const currentDepositorsDict = {};

        // setup:
        // account set L all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          defaulterCollMin,
          defaulterCollMax,
          defaulterAccounts,
          contracts,
          defaulterDebtTokenProportionMin,
          defaulterDebtTokenProportionMax,
        );

        // account set S all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          depositorCollMin,
          depositorCollMax,
          depositorAccounts,
          contracts,
          depositorDebtTokenProportionMin,
          depositorDebtTokenProportionMax,
        );

        // price drops, all L liquidateable
        await priceFeed.setPrice(dec(100, 18));

        // Random sequence of operations: liquidations and SP deposits
        for (i = 0; i < numberOfOps; i++) {
          await randomOperation(
            depositorAccounts,
            remainingDefaulters,
            currentDepositors,
            liquidatedAccountsDict,
            currentDepositorsDict,
          );
        }

        await skyrocketPriceAndCheckAllTrovesSafe();

        const totalDebtTokenDepositsBeforeWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsBeforeWithdrawals = await stabilityPool.getFIL();

        await attemptWithdrawAllDeposits(currentDepositors);

        const totalDebtTokenDepositsAfterWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsAfterWithdrawals = await stabilityPool.getFIL();

        console.log(
          `Total debt token deposits before any withdrawals: ${totalDebtTokenDepositsBeforeWithdrawals}`,
        );
        console.log(
          `Total FIL rewards before any withdrawals: ${totalFILRewardsBeforeWithdrawals}`,
        );

        console.log(
          `Remaining debt token deposits after withdrawals: ${totalDebtTokenDepositsAfterWithdrawals}`,
        );
        console.log(`Remaining FIL rewards after withdrawals: ${totalFILRewardsAfterWithdrawals}`);

        console.log(`current depositors length: ${currentDepositors.length}`);
        console.log(`remaining defaulters length: ${remainingDefaulters.length}`);
      });

      it("Defaulters' Collateral in range [1e6, 1e8]. SP Deposits in range [1e8 1e10]. FIL:USD = 100", async () => {
        // whale adds coll that holds TCR > 150%
        await borrowerOperations
          .connect(whale)
          .openTrove(_100pct, dec(5, 29), whale.address, whale.address, { value: dec(5, 29) });

        // price drops, all L liquidateable
        const numberOfOps = 5;
        const defaulterAccounts = signers.slice(1, numberOfOps);
        const depositorAccounts = signers.slice(numberOfOps + 1, numberOfOps * 2);

        const defaulterCollMin = 1000000;
        const defaulterCollMax = 100000000;
        const defaulterDebtTokenProportionMin = 91;
        const defaulterDebtTokenProportionMax = 180;

        const depositorCollMin = 1000000;
        const depositorCollMax = 100000000;
        const depositorDebtTokenProportionMin = 100;
        const depositorDebtTokenProportionMax = 100;

        const remainingDefaulters = [...defaulterAccounts];
        const currentDepositors = [];
        const liquidatedAccountsDict = {};
        const currentDepositorsDict = {};

        // setup:
        // account set L all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          defaulterCollMin,
          defaulterCollMax,
          defaulterAccounts,
          contracts,
          defaulterDebtTokenProportionMin,
          defaulterDebtTokenProportionMax,
        );

        // account set S all add coll and withdraw debt tokens
        await th.openTrove_allAccounts_randomFIL_randomDebtToken(
          depositorCollMin,
          depositorCollMax,
          depositorAccounts,
          contracts,
          depositorDebtTokenProportionMin,
          depositorDebtTokenProportionMax,
        );

        // price drops, all L liquidateable
        await priceFeed.setPrice(dec(100, 18));

        // Random sequence of operations: liquidations and SP deposits
        for (i = 0; i < numberOfOps; i++) {
          await randomOperation(
            depositorAccounts,
            remainingDefaulters,
            currentDepositors,
            liquidatedAccountsDict,
            currentDepositorsDict,
          );
        }

        await skyrocketPriceAndCheckAllTrovesSafe();

        const totalDebtTokenDepositsBeforeWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsBeforeWithdrawals = await stabilityPool.getFIL();

        await attemptWithdrawAllDeposits(currentDepositors);

        const totalDebtTokenDepositsAfterWithdrawals =
          await stabilityPool.getTotalDebtTokenDeposits();
        const totalFILRewardsAfterWithdrawals = await stabilityPool.getFIL();

        console.log(
          `Total debt token deposits before any withdrawals: ${totalDebtTokenDepositsBeforeWithdrawals}`,
        );
        console.log(
          `Total FIL rewards before any withdrawals: ${totalFILRewardsBeforeWithdrawals}`,
        );

        console.log(
          `Remaining debt token deposits after withdrawals: ${totalDebtTokenDepositsAfterWithdrawals}`,
        );
        console.log(`Remaining FIL rewards after withdrawals: ${totalFILRewardsAfterWithdrawals}`);

        console.log(`current depositors length: ${currentDepositors.length}`);
        console.log(`remaining defaulters length: ${remainingDefaulters.length}`);
      });
    });
  },
);
