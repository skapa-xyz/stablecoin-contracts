const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const { dec, toBN } = testHelpers.TestHelper;
const th = testHelpers.TestHelper;

contract("StabilityPool - Withdrawal of stability deposit - Reward calculations", async () => {
  let owner,
    defaulter_1,
    defaulter_2,
    defaulter_3,
    defaulter_4,
    defaulter_5,
    whale,
    alice,
    bob,
    carol,
    dennis,
    erin,
    flyn,
    graham,
    harriet,
    A,
    B,
    C,
    D,
    E,
    F;

  let contracts;

  let priceFeed;
  let debtToken;
  let troveManager;
  let stabilityPool;
  let borrowerOperations;

  const ZERO_ADDRESS = th.ZERO_ADDRESS;

  const getOpenTroveDebtTokenAmount = async (totalDebt) =>
    th.getOpenTroveDebtTokenAmount(contracts, totalDebt);

  before(async () => {
    const signers = await ethers.getSigners();

    [
      owner,
      defaulter_1,
      defaulter_2,
      defaulter_3,
      defaulter_4,
      defaulter_5,
      whale,
      alice,
      bob,
      carol,
      dennis,
      erin,
      flyn,
      graham,
      harriet,
      A,
      B,
      C,
      D,
      E,
      F,
    ] = signers;
  });

  describe("Stability Pool Withdrawal", async () => {
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

      contracts.troveManager = troveManagerTester;

      await deploymentHelper.deployProtocolTokenContracts(cpContracts);

      priceFeed = contracts.priceFeedTestnet;
      debtToken = contracts.debtToken;
      troveManager = contracts.troveManager;
      stabilityPool = contracts.stabilityPool;
      borrowerOperations = contracts.borrowerOperations;
    });

    // --- Compounding tests ---

    // --- withdrawFromSP()

    // --- Identical deposits, identical liquidation amounts---
    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter opens trove with 200% ICR and 10k DebtToken net debt
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // Check depositors' compounded deposit is 6666.66 DebtToken and FIL Gain is 33.16 FIL
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "6666666666666666666666",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "6666666666666666666666",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "6666666666666666666666",
        ),
        10000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "33166666666666666667"), 10000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "33166666666666666667"), 10000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "33166666666666666667"), 10000);
    });

    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct compounded deposit and FIL Gain after two identical liquidations", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Check depositors' compounded deposit is 3333.33 DebtToken and FIL Gain is 66.33 FIL
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "3333333333333333333333",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "3333333333333333333333",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "3333333333333333333333",
        ),
        10000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "66333333333333333333"), 10000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "66333333333333333333"), 10000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "66333333333333333333"), 10000);
    });

    it("withdrawFromSP():  Depositors with equal initial deposit withdraw correct compounded deposit and FIL Gain after three identical liquidations", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Three defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Check depositors' compounded deposit is 0 DebtToken and FIL Gain is 99.5 FIL
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        10000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        10000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), "0"),
        10000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(99500, 15)), 10000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(99500, 15)), 10000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(99500, 15)), 10000);
    });

    // --- Identical deposits, increasing liquidation amounts ---
    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct compounded deposit and FIL Gain after two liquidations of increasing DebtToken", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: "50000000000000000000" },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(7000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: "70000000000000000000" },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Check depositors' compounded deposit
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "6000000000000000000000",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "6000000000000000000000",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "6000000000000000000000",
        ),
        10000,
      );

      // (0.5 + 0.7) * 99.5 / 3
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(398, 17)), 10000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(398, 17)), 10000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(398, 17)), 10000);
    });

    it("withdrawFromSP(): Depositors with equal initial deposit withdraw correct compounded deposit and FIL Gain after three liquidations of increasing DebtToken", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: "50000000000000000000" },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(6000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: "60000000000000000000" },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(7000, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: "70000000000000000000" },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Three defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Check depositors' compounded deposit
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "4000000000000000000000",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "4000000000000000000000",
        ),
        10000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "4000000000000000000000",
        ),
        10000,
      );

      // (0.5 + 0.6 + 0.7) * 99.5 / 3
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(597, 17)), 10000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(597, 17)), 10000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(597, 17)), 10000);
    });

    // --- Increasing deposits, identical liquidation amounts ---
    it("withdrawFromSP(): Depositors with varying deposits withdraw correct compounded deposit and FIL Gain after two identical liquidations", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k, 20k, 30k DebtToken to A, B and C respectively who then deposit it to the SP
      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(bob.address, dec(20000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(carol.address, dec(30000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // 2 Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Three defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Depositors attempt to withdraw everything
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(20000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(30000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "6666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "13333333333333333333333",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "20000000000000000000000",
        ),
        100000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "33166666666666666667"), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "66333333333333333333"), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(995, 17)), 100000);
    });

    it("withdrawFromSP(): Depositors with varying deposits withdraw correct compounded deposit and FIL Gain after three identical liquidations", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k, 20k, 30k DebtToken to A, B and C respectively who then deposit it to the SP
      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(bob.address, dec(20000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(carol.address, dec(30000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Three defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Depositors attempt to withdraw everything
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(20000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(30000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "5000000000000000000000",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "10000000000000000000000",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "15000000000000000000000",
        ),
        100000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "49750000000000000000"), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "149250000000000000000"), 100000);
    });

    // --- Varied deposits and varied liquidation amount ---
    it("withdrawFromSP(): Depositors with varying deposits withdraw correct compounded deposit and FIL Gain after three varying liquidations", async () => {
      // Whale opens Trove with 1m FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(1000000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(1000000, "ether"),
          },
        );

      /* Depositors provide:-
      Alice:  2000 DebtToken
      Bob:  456000 DebtToken
      Carol: 13100 DebtToken */
      // Whale transfers DebtToken to  A, B and C respectively who then deposit it to the SP
      await debtToken.connect(whale).transfer(alice.address, dec(2000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(2000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(bob.address, dec(456000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(456000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(carol.address, dec(13100, 18));
      await stabilityPool.connect(carol).provideToSP(dec(13100, 18), ZERO_ADDRESS);

      /* Defaulters open troves
     
      Defaulter 1: 207000 DebtToken & 2160 FIL
      Defaulter 2: 5000 DebtToken & 50 FIL
      Defaulter 3: 46700 DebtToken & 500 FIL
      */
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("207000000000000000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(2160, 18) },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5, 21)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(50, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("46700000000000000000000"),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(500, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Three defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Depositors attempt to withdraw everything
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(500000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(500000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(500000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      // ()
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "901719380174061000000",
        ),
        100000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "205592018679686000000000",
        ),
        10000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "5906261940140100000000",
        ),
        10000000000,
      );

      // 2710 * 0.995 * {2000, 456000, 13100}/4711
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "11447463383570366500"), 10000000000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "2610021651454043834000"), 10000000000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "74980885162385912900"), 10000000000);
    });

    // --- Deposit enters at t > 0

    it("withdrawFromSP(): A, B, C Deposit -> 2 liquidations -> D deposits -> 1 liquidation. All deposits and liquidations = 100 DebtToken.  A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Whale transfers 10k to Dennis who then provides to SP
      await debtToken.connect(whale).transfer(dennis.address, dec(10000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Third defaulter liquidated
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      console.log();
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "1666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "1666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "1666666666666666666666",
        ),
        100000,
      );

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "5000000000000000000000",
        ),
        100000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "82916666666666666667"), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "82916666666666666667"), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "82916666666666666667"), 100000);

      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "49750000000000000000"), 100000);
    });

    it("withdrawFromSP(): A, B, C Deposit -> 2 liquidations -> D deposits -> 2 liquidations. All deposits and liquidations = 100 DebtToken.  A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Dennis opens a trove and provides to SP
      await debtToken.connect(whale).transfer(dennis.address, dec(10000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Third and fourth defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_3.address);
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(dennis.address)).toString(), "0"),
        100000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, dec(995, 17)), 100000);
    });

    it("withdrawFromSP(): A, B, C Deposit -> 2 liquidations -> D deposits -> 2 liquidations. Various deposit and liquidation vals.  A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 1m FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(1000000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(1000000, "ether"),
          },
        );

      /* Depositors open troves and make SP deposit:
      Alice: 60000 DebtToken
      Bob: 20000 DebtToken
      Carol: 15000 DebtToken
      */
      // Whale transfers DebtToken to  A, B and C respectively who then deposit it to the SP
      await debtToken.connect(whale).transfer(alice.address, dec(60000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(60000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(bob.address, dec(20000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(carol.address, dec(15000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(15000, 18), ZERO_ADDRESS);

      /* Defaulters open troves:
      Defaulter 1:  10000 DebtToken, 100 FIL
      Defaulter 2:  25000 DebtToken, 250 FIL
      Defaulter 3:  5000 DebtToken, 50 FIL
      Defaulter 4:  40000 DebtToken, 400 FIL
      */
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(25000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: "250000000000000000000" },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: "50000000000000000000" },
        );
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(40000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(400, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Dennis provides 25000 DebtToken
      await debtToken.connect(whale).transfer(dennis.address, dec(25000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(25000, 18), ZERO_ADDRESS);

      // Last two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_3.address);
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      // Each depositor withdraws as much as possible
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(100000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(100000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(100000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(100000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "17832817337461300000000",
        ),
        100000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "5944272445820430000000",
        ),
        100000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "4458204334365320000000",
        ),
        100000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "11764705882352900000000",
        ),
        100000000000,
      );

      // 3.5*0.995 * {60000,20000,15000,0} / 95000 + 450*0.995 * {60000/950*{60000,20000,15000},25000} / (120000-35000)
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "419563467492260055900"), 100000000000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "139854489164086692700"), 100000000000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "104890866873065014000"), 100000000000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "131691176470588233700"), 100000000000);
    });

    // --- Depositor leaves ---

    it("withdrawFromSP(): A, B, C, D deposit -> 2 liquidations -> D withdraws -> 2 liquidations. All deposits and liquidations = 100 DebtToken.  A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and C who then deposit it to the SP
      const depositors = [alice, bob, carol, dennis];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Dennis withdraws his deposit and FIL gain
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));
      await priceFeed.setPrice(dec(100, 18));

      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "5000000000000000000000",
        ),
        100000,
      );
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "49750000000000000000"), 100000);

      // Two more defaulters are liquidated
      await troveManager.connect(owner).liquidate(defaulter_3.address);
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        1000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        1000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), "0"),
        1000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(995, 17)), 100000);
    });

    it("withdrawFromSP(): A, B, C, D deposit -> 2 liquidations -> D withdraws -> 2 liquidations. Various deposit and liquidation vals. A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      /* Initial deposits:
      Alice: 20000 DebtToken
      Bob: 25000 DebtToken
      Carol: 12500 DebtToken
      Dennis: 40000 DebtToken
      */
      // Whale transfers DebtToken to  A, B,C and D respectively who then deposit it to the SP
      await debtToken.connect(whale).transfer(alice.address, dec(20000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(20000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(bob.address, dec(25000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(25000, 18), ZERO_ADDRESS);
      await debtToken.connect(whale).transfer(carol.address, dec(12500, 18));
      await stabilityPool.connect(carol).provideToSP(dec(12500, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(dennis.address, dec(40000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(40000, 18), ZERO_ADDRESS);

      /* Defaulters open troves:
      Defaulter 1: 10000 DebtToken
      Defaulter 2: 20000 DebtToken
      Defaulter 3: 30000 DebtToken
      Defaulter 4: 5000 DebtToken
      */
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
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
          await getOpenTroveDebtTokenAmount(dec(30000, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(300, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: "50000000000000000000" },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Dennis withdraws his deposit and FIL gain
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(40000, 18));
      await priceFeed.setPrice(dec(100, 18));

      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "27692307692307700000000",
        ),
        100000000000,
      );
      // 300*0.995 * 40000/97500
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "122461538461538466100"), 100000000000);

      // Two more defaulters are liquidated
      await troveManager.connect(owner).liquidate(defaulter_3.address);
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(100000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(100000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(100000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "1672240802675590000000",
        ),
        10000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "2090301003344480000000",
        ),
        100000000000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "1045150501672240000000",
        ),
        100000000000,
      );

      // 300*0.995 * {20000,25000,12500}/97500 + 350*0.995 * {20000,25000,12500}/57500
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "182361204013377919900"), 100000000000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "227951505016722411000"), 100000000000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "113975752508361205500"), 100000000000);
    });

    // --- One deposit enters at t > 0, and another leaves later ---
    it("withdrawFromSP(): A, B, D deposit -> 2 liquidations -> C makes deposit -> 1 liquidation -> D withdraws -> 1 liquidation. All deposits: 100 DebtToken. Liquidations: 100,100,100,50.  A, B, C, D withdraw correct DebtToken deposit and FIL Gain", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B and D who then deposit it to the SP
      const depositors = [alice, bob, dennis];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulters open troves
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: "50000000000000000000" },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // First two defaulters liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Carol makes deposit
      await debtToken.connect(whale).transfer(carol.address, dec(10000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Dennis withdraws his deposit and FIL gain
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));
      await priceFeed.setPrice(dec(100, 18));

      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "1666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "82916666666666666667"), 100000);

      await troveManager.connect(owner).liquidate(defaulter_4.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(alice.address)).toString(),
          "666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "2000000000000000000000",
        ),
        100000,
      );

      assert.isAtMost(th.getDifference(alice_FILWithdrawn, "92866666666666666667"), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "92866666666666666667"), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "79600000000000000000"), 100000);
    });

    // --- Tests for full offset - Pool empties to 0 ---

    // A, B deposit 10000
    // L1 cancels 20000, 200
    // C, D deposit 10000
    // L2 cancels 10000,100

    // A, B withdraw 0DebtToken & 100e
    // C, D withdraw 5000DebtToken  & 500e
    it("withdrawFromSP(): Depositor withdraws correct compounded deposit after liquidation empties the pool", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B who then deposit it to the SP
      const depositors = [alice, bob];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 2 Defaulters open trove with 200% ICR
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
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated. 20000 DebtToken fully offset with pool.
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // Carol, Dennis each deposit 10000 DebtToken
      const depositors_2 = [carol, dennis];
      for (account of depositors_2) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 2 liquidated. 10000 DebtToken offset
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // await borrowerOperations.openTrove(th._100pct, dec(1, 18), account.address, account.address, { from: erin, value: dec(2, 'ether') })
      // await.connect(erin) stabilityPool.provideToSP(dec(1, 18), ZERO_ADDRESS)

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));

      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      // Expect Alice And Bob's compounded deposit to be 0 DebtToken
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        10000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        10000,
      );

      // Expect Alice and Bob's FIL Gain to be 100 FIL
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);

      // Expect Carol And Dennis' compounded deposit to be 50 DebtToken
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "5000000000000000000000",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "5000000000000000000000",
        ),
        100000,
      );

      // Expect Carol and and Dennis FIL Gain to be 50 FIL
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "49750000000000000000"), 100000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "49750000000000000000"), 100000);
    });

    // A, B deposit 10000
    // L1 cancels 10000, 1
    // L2 10000, 200 empties Pool
    // C, D deposit 10000
    // L3 cancels 10000, 1
    // L2 20000, 200 empties Pool
    it("withdrawFromSP(): Pool-emptying liquidation increases epoch by one, resets scaleFactor to 0, and resets P to 1e18", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B who then deposit it to the SP
      const depositors = [alice, bob];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 4 Defaulters open trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      const epoch_0 = (await stabilityPool.currentEpoch()).toString();
      const scale_0 = (await stabilityPool.currentScale()).toString();
      const P_0 = (await stabilityPool.P()).toString();

      assert.equal(epoch_0, "0");
      assert.equal(scale_0, "0");
      assert.equal(P_0, dec(1, 18));

      // Defaulter 1 liquidated. 10--0 DebtToken fully offset, Pool remains non-zero
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      //Check epoch, scale and sum
      const epoch_1 = (await stabilityPool.currentEpoch()).toString();
      const scale_1 = (await stabilityPool.currentScale()).toString();
      const P_1 = (await stabilityPool.P()).toString();

      assert.equal(epoch_1, "0");
      assert.equal(scale_1, "0");
      assert.isAtMost(th.getDifference(P_1, dec(5, 17)), 1000);

      // Defaulter 2 liquidated. 1--00 DebtToken, empties pool
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      //Check epoch, scale and sum
      const epoch_2 = (await stabilityPool.currentEpoch()).toString();
      const scale_2 = (await stabilityPool.currentScale()).toString();
      const P_2 = (await stabilityPool.P()).toString();

      assert.equal(epoch_2, "1");
      assert.equal(scale_2, "0");
      assert.equal(P_2, dec(1, 18));

      // Carol, Dennis each deposit 10000 DebtToken
      const depositors_2 = [carol, dennis];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 3 liquidated. 10000 DebtToken fully offset, Pool remains non-zero
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      //Check epoch, scale and sum
      const epoch_3 = (await stabilityPool.currentEpoch()).toString();
      const scale_3 = (await stabilityPool.currentScale()).toString();
      const P_3 = (await stabilityPool.P()).toString();

      assert.equal(epoch_3, "1");
      assert.equal(scale_3, "0");
      assert.isAtMost(th.getDifference(P_3, dec(5, 17)), 1000);

      // Defaulter 4 liquidated. 10000 DebtToken, empties pool
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      //Check epoch, scale and sum
      const epoch_4 = (await stabilityPool.currentEpoch()).toString();
      const scale_4 = (await stabilityPool.currentScale()).toString();
      const P_4 = (await stabilityPool.P()).toString();

      assert.equal(epoch_4, "2");
      assert.equal(scale_4, "0");
      assert.equal(P_4, dec(1, 18));
    });

    // A, B deposit 10000
    // L1 cancels 20000, 200
    // C, D, E deposit 10000, 20000, 30000
    // L2 cancels 10000,100

    // A, B withdraw 0 DebtToken & 100e
    // C, D withdraw 5000 DebtToken  & 50e
    it("withdrawFromSP(): Depositors withdraw correct compounded deposit after liquidation empties the pool", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Whale transfers 10k DebtToken to A, B who then deposit it to the SP
      const depositors = [alice, bob];
      for (account of depositors) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // 2 Defaulters open trove with 200% ICR
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
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated. 20000 DebtToken fully offset with pool.
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // Carol, Dennis, Erin each deposit 10000, 20000, 30000 DebtToken respectively
      await debtToken.connect(whale).transfer(carol.address, dec(10000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(dennis.address, dec(20000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(20000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(erin.address, dec(30000, 18));
      await stabilityPool.connect(erin).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // Defaulter 2 liquidated. 10000 DebtToken offset
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(20000, 18));
      const txE = await stabilityPool.connect(erin).withdrawFromSP(dec(30000, 18));

      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();
      const erin_FILWithdrawn = (
        await th.getEventArgByName(txE, "FILGainWithdrawn", "_FIL")
      ).toString();

      // Expect Alice And Bob's compounded deposit to be 0 DebtToken
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        10000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        10000,
      );

      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(carol.address)).toString(),
          "8333333333333333333333",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(dennis.address)).toString(),
          "16666666666666666666666",
        ),
        100000,
      );
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(erin.address)).toString(),
          "25000000000000000000000",
        ),
        100000,
      );

      //Expect Alice and Bob's FIL Gain to be 1 FIL
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);

      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "16583333333333333333"), 100000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "33166666666666666667"), 100000);
      assert.isAtMost(th.getDifference(erin_FILWithdrawn, "49750000000000000000"), 100000);
    });

    // A deposits 10000
    // L1, L2, L3 liquidated with 10000 DebtToken each
    // A withdraws all
    // Expect A to withdraw 0 deposit and ether only from reward L1
    it("withdrawFromSP(): single deposit fully offset. After subsequent liquidations, depositor withdraws 0 deposit and *only* the FIL Gain from one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1,2,3 withdraw 10000 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(10000, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
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

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1, 2  and 3 liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      await troveManager.connect(owner).liquidate(defaulter_2.address);
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), 0),
        100000,
      );
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
    });

    //--- Serial full offsets ---

    // A,B deposit 10000 DebtToken
    // L1 cancels 20000 DebtToken, 2E
    // B,C deposits 10000 DebtToken
    // L2 cancels 20000 DebtToken, 2E
    // E,F deposit 10000 DebtToken
    // L3 cancels 20000, 200E
    // G,H deposits 10000
    // L4 cancels 20000, 200E

    // Expect all depositors withdraw 0 DebtToken and 100 FIL

    it("withdrawFromSP(): Depositor withdraws correct compounded deposit after liquidation empties the pool", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // 4 Defaulters open trove with 200% ICR
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

      // Alice, Bob each deposit 10k DebtToken
      const depositors_1 = [alice, bob];
      for (account of depositors_1) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 1 liquidated. 20k DebtToken fully offset with pool.
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      // Carol, Dennis each deposit 10000 DebtToken
      const depositors_2 = [carol, dennis];
      for (account of depositors_2) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 2 liquidated. 10000 DebtToken offset
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      // Erin, Flyn each deposit 10000 DebtToken
      const depositors_3 = [erin, flyn];
      for (account of depositors_3) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 3 liquidated. 10000 DebtToken offset
      await troveManager.connect(owner).liquidate(defaulter_3.address);

      // Graham, Harriet each deposit 10000 DebtToken
      const depositors_4 = [graham, harriet];
      for (account of depositors_4) {
        await debtToken.connect(whale).transfer(account.address, dec(10000, 18));
        await stabilityPool.connect(account).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      }

      // Defaulter 4 liquidated. 10k DebtToken offset
      await troveManager.connect(owner).liquidate(defaulter_4.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));
      const txE = await stabilityPool.connect(erin).withdrawFromSP(dec(10000, 18));
      const txF = await stabilityPool.connect(flyn).withdrawFromSP(dec(10000, 18));
      const txG = await stabilityPool.connect(graham).withdrawFromSP(dec(10000, 18));
      const txH = await stabilityPool.connect(harriet).withdrawFromSP(dec(10000, 18));

      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();
      const erin_FILWithdrawn = (
        await th.getEventArgByName(txE, "FILGainWithdrawn", "_FIL")
      ).toString();
      const flyn_FILWithdrawn = (
        await th.getEventArgByName(txF, "FILGainWithdrawn", "_FIL")
      ).toString();
      const graham_FILWithdrawn = (
        await th.getEventArgByName(txG, "FILGainWithdrawn", "_FIL")
      ).toString();
      const harriet_FILWithdrawn = (
        await th.getEventArgByName(txH, "FILGainWithdrawn", "_FIL")
      ).toString();

      // Expect all deposits to be 0 DebtToken
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(alice.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(dennis.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(erin.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(flyn.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(graham.address)).toString(), "0"),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(harriet.address)).toString(), "0"),
        100000,
      );

      /* Expect all FIL gains to be 100 FIL:  Since each liquidation of empties the pool, depositors
      should only earn FIL from the single liquidation that cancelled with their deposit */
      assert.isAtMost(th.getDifference(alice_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(erin_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(flyn_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(graham_FILWithdrawn, dec(995, 17)), 100000);
      assert.isAtMost(th.getDifference(harriet_FILWithdrawn, dec(995, 17)), 100000);

      const finalEpoch = (await stabilityPool.currentEpoch()).toString();
      assert.equal(finalEpoch, 4);
    });

    // --- Scale factor tests ---

    // A deposits 10000
    // L1 brings P close to boundary, i.e. 9e-9: liquidate 9999.99991
    // A withdraws all
    // B deposits 10000
    // L2 of 9900 DebtToken, should bring P slightly past boundary i.e. 1e-9 -> 1e-10

    // expect d(B) = d0(B)/100
    // expect correct FIL gain, i.e. all of the reward
    it("withdrawFromSP(): deposit spans one scale factor change: Single depositor withdraws correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 withdraws 'almost' 10000 DebtToken:  9999.99991 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999999910000000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      assert.equal(await stabilityPool.currentScale(), "0");

      // Defaulter 2 withdraws 9900 DebtToken
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(9900, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(60, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated.  Value of P reduced to 9e9.
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      assert.equal((await stabilityPool.P()).toString(), dec(9, 9));

      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      await priceFeed.setPrice(dec(100, 18));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();

      await debtToken.connect(whale).transfer(bob.address, dec(10000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 2 liquidated.  9900 DebtToken liquidated. P altered by a factor of 1-(9900/10000) = 0.01.  Scale changed.
      await troveManager.connect(owner).liquidate(defaulter_2.address);

      assert.equal(await stabilityPool.currentScale(), "1");

      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();

      // Expect Bob to withdraw 1% of initial deposit (100 DebtToken) and all the liquidated FIL (60 ether)
      assert.isAtMost(
        th.getDifference(
          (await debtToken.balanceOf(bob.address)).toString(),
          "100000000000000000000",
        ),
        100000,
      );
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "59700000000000000000"), 100000);
    });

    // A deposits 10000
    // L1 brings P close to boundary, i.e. 9e-9: liquidate 9999.99991 DebtToken
    // A withdraws all
    // B, C, D deposit 10000, 20000, 30000
    // L2 of 59400, should bring P slightly past boundary i.e. 1e-9 -> 1e-10

    // expect d(B) = d0(B)/100
    // expect correct FIL gain, i.e. all of the reward
    it("withdrawFromSP(): Several deposits of varying amounts span one scale factor change. Depositors withdraw correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 withdraws 'almost' 10k DebtToken.
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999999910000000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      // Defaulter 2 withdraws 59400 DebtToken
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("59400000000000000000000"),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(330, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated.  Value of P reduced to 9e9
      await troveManager.connect(owner).liquidate(defaulter_1.address);
      assert.equal((await stabilityPool.P()).toString(), dec(9, 9));

      assert.equal(await stabilityPool.currentScale(), "0");

      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      await priceFeed.setPrice(dec(100, 18));

      //B, C, D deposit to Stability Pool
      await debtToken.connect(whale).transfer(bob.address, dec(10000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(carol.address, dec(20000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(20000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(dennis.address, dec(30000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // 54000 DebtToken liquidated.  P altered by a factor of 1-(59400/60000) = 0.01. Scale changed.
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);

      assert.equal(await stabilityPool.currentScale(), "1");

      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(20000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(30000, 18));

      /* Expect depositors to withdraw 1% of their initial deposit, and an FIL gain 
      in proportion to their initial deposit:
     
      Bob:  1000 DebtToken, 55 Ether
      Carol:  2000 DebtToken, 110 Ether
      Dennis:  3000 DebtToken, 165 Ether
     
      Total: 6000 DebtToken, 300 Ether
      */
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), dec(100, 18)),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), dec(200, 18)),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(dennis.address)).toString(), dec(300, 18)),
        100000,
      );

      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      assert.isAtMost(th.getDifference(bob_FILWithdrawn, "54725000000000000000"), 100000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, "109450000000000000000"), 100000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, "164175000000000000000"), 100000);
    });

    // Deposit's FIL reward spans one scale change - deposit reduced by correct amount

    // A make deposit 10000 DebtToken
    // L1 brings P to 1e-5*P. L1:  9999.9000000000000000 DebtToken
    // A withdraws
    // B makes deposit 10000 DebtToken
    // L2 decreases P again by 1e-5, over the scale boundary: 9999.9000000000000000 (near to the 10000 DebtToken total deposits)
    // B withdraws
    // expect d(B) = d0(B) * 1e-5
    // expect B gets entire FIL gain from L2
    it("withdrawFromSP(): deposit spans one scale factor change: Single depositor withdraws correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 and default 2 each withdraw 9999.999999999 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%: defaulter 1 ICR falls to 100%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated.  Value of P updated to  to 1e13
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.equal(receiptL1.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 13)); // P decreases. P = 1e(18-5) = 1e13
      assert.equal(await stabilityPool.currentScale(), "0");

      // Alice withdraws
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      await priceFeed.setPrice(dec(100, 18));

      // Bob deposits 10k DebtToken
      await debtToken.connect(whale).transfer(bob.address, dec(10000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 17)); // Scale changes and P changes. P = 1e(13-5+9) = 1e17
      assert.equal(await stabilityPool.currentScale(), "1");

      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();

      // Bob should withdraw 1e-5 of initial deposit: 0.1 DebtToken and the full FIL gain of 100 ether
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), dec(1, 17)),
        100000,
      );
      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 100000000000);
    });

    // A make deposit 10000 DebtToken
    // L1 brings P to 1e-5*P. L1:  9999.9000000000000000 DebtToken
    // A withdraws
    // B,C D make deposit 10000, 20000, 30000
    // L2 decreases P again by 1e-5, over boundary. L2: 59999.4000000000000000  (near to the 60000 DebtToken total deposits)
    // B withdraws
    // expect d(B) = d0(B) * 1e-5
    // expect B gets entire FIL gain from L2
    it("withdrawFromSP(): Several deposits of varying amounts span one scale factor change. Depositors withdraws correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 and default 2 withdraw up to debt of 9999.9 DebtToken and 59999.4 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999900000000000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("59999400000000000000000"),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(600, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // Defaulter 1 liquidated.  Value of P updated to  to 9999999, i.e. in decimal, ~1e-10
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      assert.equal(await stabilityPool.P(), dec(1, 13)); // P decreases. P = 1e(18-5) = 1e13
      assert.equal(await stabilityPool.currentScale(), "0");

      // Alice withdraws
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(100, 18));
      await priceFeed.setPrice(dec(100, 18));

      // B, C, D deposit 10000, 20000, 30000 DebtToken
      await debtToken.connect(whale).transfer(bob.address, dec(10000, 18));
      await stabilityPool.connect(bob).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(carol.address, dec(20000, 18));
      await stabilityPool.connect(carol).provideToSP(dec(20000, 18), ZERO_ADDRESS);

      await debtToken.connect(whale).transfer(dennis.address, dec(30000, 18));
      await stabilityPool.connect(dennis).provideToSP(dec(30000, 18), ZERO_ADDRESS);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 17)); // P decreases. P = 1e(13-5+9) = 1e17
      assert.equal(await stabilityPool.currentScale(), "1");

      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();

      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(20000, 18));

      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(30000, 18));
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      // {B, C, D} should have a compounded deposit of {0.1, 0.2, 0.3} DebtToken
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(bob.address)).toString(), dec(1, 17)),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(carol.address)).toString(), dec(2, 17)),
        100000,
      );
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(dennis.address)).toString(), dec(3, 17)),
        100000,
      );

      assert.isAtMost(th.getDifference(bob_FILWithdrawn, dec(995, 17)), 10000000000);
      assert.isAtMost(th.getDifference(carol_FILWithdrawn, dec(1990, 17)), 100000000000);
      assert.isAtMost(th.getDifference(dennis_FILWithdrawn, dec(2985, 17)), 100000000000);
    });

    // A make deposit 10000 DebtToken
    // L1 brings P to (~1e-10)*P. L1: 9999.9999999000000000 DebtToken
    // Expect A to withdraw 0 deposit
    it("withdrawFromSP(): Deposit that decreases to less than 1e-9 of it's original value is reduced to 0", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Defaulters 1 withdraws 9999.9999999 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999999999900000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );

      // Price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 liquidated. P -> (~1e-10)*P
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.equal(receiptL1.status, 1);

      const aliceDeposit = (
        await stabilityPool.getCompoundedDebtTokenDeposit(alice.address)
      ).toString();
      console.log(`alice deposit: ${aliceDeposit}`);
      assert.equal(aliceDeposit, 0);
    });

    // --- Serial scale changes ---

    /* A make deposit 10000 DebtToken
    L1 brings P to 0.0001P. L1:  9999.900000000000000000 DebtToken, 1 FIL
    B makes deposit 9999.9, brings SP to 10k
    L2 decreases P by(~1e-5)P. L2:  9999.900000000000000000 DebtToken, 1 FIL
    C makes deposit 9999.9, brings SP to 10k
    L3 decreases P by(~1e-5)P. L3:  9999.900000000000000000 DebtToken, 1 FIL
    D makes deposit 9999.9, brings SP to 10k
    L4 decreases P by(~1e-5)P. L4:  9999.900000000000000000 DebtToken, 1 FIL
    expect A, B, C, D each withdraw ~100 Ether
    */
    it("withdrawFromSP(): Several deposits of 10000 DebtToken span one scale factor change. Depositors withdraws correct compounded deposit and FIL Gain after one liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Defaulters 1-4 each withdraw 9999.9 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999900000000000000000"),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999900000000000000000"),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999900000000000000000"),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount("9999900000000000000000"),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 liquidated.
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.equal(receiptL1.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 13)); // P decreases to 1e(18-5) = 1e13
      assert.equal(await stabilityPool.currentScale(), "0");

      // B deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(bob.address, dec(99999, 17));
      await stabilityPool.connect(bob).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 17)); // Scale changes and P changes to 1e(13-5+9) = 1e17
      assert.equal(await stabilityPool.currentScale(), "1");

      // C deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(carol.address, dec(99999, 17));
      await stabilityPool.connect(carol).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 3 liquidated
      const txL3 = await troveManager.connect(owner).liquidate(defaulter_3.address);
      const receiptL3 = await txL3.wait();
      assert.equal(receiptL3.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 12)); // P decreases to 1e(17-5) = 1e12
      assert.equal(await stabilityPool.currentScale(), "1");

      // D deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(dennis.address, dec(99999, 17));
      await stabilityPool.connect(dennis).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 4 liquidated
      const txL4 = await troveManager.connect(owner).liquidate(defaulter_4.address);
      const receiptL4 = await txL4.wait();
      assert.equal(receiptL4.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 16)); // Scale changes and P changes to 1e(12-5+9) = 1e16
      assert.equal(await stabilityPool.currentScale(), "2");

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(10000, 18));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(10000, 18));
      const txC = await stabilityPool.connect(carol).withdrawFromSP(dec(10000, 18));

      const txD = await stabilityPool.connect(dennis).withdrawFromSP(dec(10000, 18));

      const alice_FILWithdrawn = (
        await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL")
      ).toString();
      const bob_FILWithdrawn = (
        await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL")
      ).toString();
      const carol_FILWithdrawn = (
        await th.getEventArgByName(txC, "FILGainWithdrawn", "_FIL")
      ).toString();
      const dennis_FILWithdrawn = (
        await th.getEventArgByName(txD, "FILGainWithdrawn", "_FIL")
      ).toString();

      // A, B, C should withdraw 0 - their deposits have been completely used up
      assert.equal(await debtToken.balanceOf(alice.address), "0");
      assert.equal(await debtToken.balanceOf(alice.address), "0");
      assert.equal(await debtToken.balanceOf(alice.address), "0");
      // D should withdraw around 0.9999 DebtToken, since his deposit of 9999.9 was reduced by a factor of 1e-5
      assert.isAtMost(
        th.getDifference((await debtToken.balanceOf(dennis.address)).toString(), dec(99999, 12)),
        100000,
      );

      // 99.5 FIL is offset at each L, 0.5 goes to gas comp
      // Each depositor gets FIL rewards of around 99.5 FIL - 1e17 error tolerance
      assert.isTrue(
        toBN(alice_FILWithdrawn)
          .sub(toBN(dec(995, 17)))
          .abs()
          .lte(toBN(dec(1, 17))),
      );
      assert.isTrue(
        toBN(bob_FILWithdrawn)
          .sub(toBN(dec(995, 17)))
          .abs()
          .lte(toBN(dec(1, 17))),
      );
      assert.isTrue(
        toBN(carol_FILWithdrawn)
          .sub(toBN(dec(995, 17)))
          .abs()
          .lte(toBN(dec(1, 17))),
      );
      assert.isTrue(
        toBN(dennis_FILWithdrawn)
          .sub(toBN(dec(995, 17)))
          .abs()
          .lte(toBN(dec(1, 17))),
      );
    });

    it("withdrawFromSP(): 2 depositors can withdraw after each receiving half of a pool-emptying liquidation", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Defaulters 1-3 each withdraw 24100, 24300, 24500 DebtToken (inc gas comp)
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(24100, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(24300, 18)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(200, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(24500, 18)),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(200, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      // A, B provide 10k DebtToken
      await debtToken.connect(whale).transfer(A.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(B.address, dec(10000, 18));
      await stabilityPool.connect(A).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(B).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 liquidated. SP emptied
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.equal(receiptL1.status, 1);

      // Check compounded deposits
      const A_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(A.address);
      const B_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(B.address);
      // console.log(`A_deposit: ${A_deposit}`)
      // console.log(`B_deposit: ${B_deposit}`)
      assert.equal(A_deposit, "0");
      assert.equal(B_deposit, "0");

      // Check SP tracker is zero
      const debtTokenInSP_1 = await stabilityPool.getTotalDebtTokenDeposits();
      // console.log(`debtTokenInSP_1: ${debtTokenInSP_1}`)
      assert.equal(debtTokenInSP_1, "0");

      // Check SP DebtToken balance is zero
      const spDebtTokenBalance_1 = await debtToken.balanceOf(stabilityPool.address);
      // console.log(`spDebtTokenBalance_1: ${spDebtTokenBalance_1}`)
      assert.equal(spDebtTokenBalance_1, "0");

      // Attempt withdrawals
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txA = await stabilityPool.connect(A).withdrawFromSP(dec(1000, 18));
      const txB = await stabilityPool.connect(B).withdrawFromSP(dec(1000, 18));
      const receiptA = await txA.wait();
      const receiptB = await txB.wait();
      await priceFeed.setPrice(dec(100, 18));

      assert.equal(receiptA.status, 1);
      assert.equal(receiptB.status, 1);

      // ==========

      // C, D provide 10k DebtToken
      await debtToken.connect(whale).transfer(C.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(D.address, dec(10000, 18));
      await stabilityPool.connect(C).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(D).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 2 liquidated.  SP emptied
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);

      // Check compounded deposits
      const C_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(C.address);
      const D_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(D.address);
      // console.log(`A_deposit: ${C_deposit}`)
      // console.log(`B_deposit: ${D_deposit}`)
      assert.equal(C_deposit, "0");
      assert.equal(D_deposit, "0");

      // Check SP tracker is zero
      const debtTokenInSP_2 = await stabilityPool.getTotalDebtTokenDeposits();
      // console.log(`debtTokenInSP_2: ${debtTokenInSP_2}`)
      assert.equal(debtTokenInSP_2, "0");

      // Check SP DebtToken balance is zero
      const spDebtTokenBalance_2 = await debtToken.balanceOf(stabilityPool.address);
      // console.log(`spDebtTokenBalance_2: ${spDebtTokenBalance_2}`)
      assert.equal(spDebtTokenBalance_2, "0");

      // Attempt withdrawals
      // Increasing the price for a moment to avoid pending liquidations to block withdrawal
      await priceFeed.setPrice(dec(200, 18));
      const txC = await stabilityPool.connect(C).withdrawFromSP(dec(1000, 18));
      const txD = await stabilityPool.connect(D).withdrawFromSP(dec(1000, 18));
      const receiptC = await txC.wait();
      const receiptD = await txD.wait();
      await priceFeed.setPrice(dec(100, 18));

      assert.equal(receiptC.status, 1);
      assert.equal(receiptD.status, 1);

      // ============

      // E, F provide 10k DebtToken
      await debtToken.connect(whale).transfer(E.address, dec(10000, 18));
      await debtToken.connect(whale).transfer(F.address, dec(10000, 18));
      await stabilityPool.connect(E).provideToSP(dec(10000, 18), ZERO_ADDRESS);
      await stabilityPool.connect(F).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 3 liquidated. SP emptied
      const txL3 = await troveManager.connect(owner).liquidate(defaulter_3.address);
      const receiptL3 = await txL3.wait();
      assert.equal(receiptL3.status, 1);

      // Check compounded deposits
      const E_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(E.address);
      const F_deposit = await stabilityPool.getCompoundedDebtTokenDeposit(F.address);
      assert.equal(E_deposit, "0");
      assert.equal(F_deposit, "0");

      // Check SP tracker is zero
      const debtTokenInSP_3 = await stabilityPool.getTotalDebtTokenDeposits();
      assert.equal(debtTokenInSP_3, "0");

      // Check SP DebtToken balance is zero
      const spDebtTokenBalance_3 = await debtToken.balanceOf(stabilityPool.address);
      // console.log(`spDebtTokenBalance_3: ${spDebtTokenBalance_3}`)
      assert.equal(spDebtTokenBalance_3, "0");

      // Attempt withdrawals
      const txE = await stabilityPool.connect(E).withdrawFromSP(dec(1000, 18));
      const txF = await stabilityPool.connect(F).withdrawFromSP(dec(1000, 18));
      const receiptE = await txE.wait();
      const receiptF = await txF.wait();

      assert.equal(receiptE.status, 1);
      assert.equal(receiptF.status, 1);
    });

    it("withdrawFromSP(): Depositor's FIL gain stops increasing after two scale changes", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // Defaulters 1-5 each withdraw up to debt of 9999.9999999 DebtToken
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_2)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_2.address,
          defaulter_2.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_3)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_3.address,
          defaulter_3.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_4)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_4.address,
          defaulter_4.address,
          { value: dec(100, "ether") },
        );
      await borrowerOperations
        .connect(defaulter_5)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(99999, 17)),
          defaulter_5.address,
          defaulter_5.address,
          { value: dec(100, "ether") },
        );

      // price drops by 50%
      await priceFeed.setPrice(dec(100, 18));

      await debtToken.connect(whale).transfer(alice.address, dec(10000, 18));
      await stabilityPool.connect(alice).provideToSP(dec(10000, 18), ZERO_ADDRESS);

      // Defaulter 1 liquidated.
      const txL1 = await troveManager.connect(owner).liquidate(defaulter_1.address);
      const receiptL1 = await txL1.wait();
      assert.equal(receiptL1.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 13)); // P decreases to 1e(18-5) = 1e13
      assert.equal(await stabilityPool.currentScale(), "0");

      // B deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(bob.address, dec(99999, 17));
      await stabilityPool.connect(bob).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 2 liquidated
      const txL2 = await troveManager.connect(owner).liquidate(defaulter_2.address);
      const receiptL2 = await txL2.wait();
      assert.equal(receiptL2.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 17)); // Scale changes and P changes to 1e(13-5+9) = 1e17
      assert.equal(await stabilityPool.currentScale(), "1");

      // C deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(carol.address, dec(99999, 17));
      await stabilityPool.connect(carol).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 3 liquidated
      const txL3 = await troveManager.connect(owner).liquidate(defaulter_3.address);
      const receiptL3 = await txL3.wait();
      assert.equal(receiptL3.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 12)); // P decreases to 1e(17-5) = 1e12
      assert.equal(await stabilityPool.currentScale(), "1");

      // D deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(dennis.address, dec(99999, 17));
      await stabilityPool.connect(dennis).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 4 liquidated
      const txL4 = await troveManager.connect(owner).liquidate(defaulter_4.address);
      const receiptL4 = await txL4.wait();
      assert.equal(receiptL4.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 16)); // Scale changes and P changes to 1e(12-5+9) = 1e16
      assert.equal(await stabilityPool.currentScale(), "2");

      const alice_FILGainAt2ndScaleChange = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();

      // E deposits 9999.9 DebtToken
      await debtToken.connect(whale).transfer(erin.address, dec(99999, 17));
      await stabilityPool.connect(erin).provideToSP(dec(99999, 17), ZERO_ADDRESS);

      // Defaulter 5 liquidated
      const txL5 = await troveManager.connect(owner).liquidate(defaulter_5.address);
      const receiptL5 = await txL5.wait();
      assert.equal(receiptL5.status, 1);
      assert.equal(await stabilityPool.P(), dec(1, 11)); // P decreases to 1e(16-5) = 1e11
      assert.equal(await stabilityPool.currentScale(), "2");

      const alice_FILGainAfterFurtherLiquidation = (
        await stabilityPool.getDepositorFILGain(alice.address)
      ).toString();

      const alice_scaleSnapshot = (
        await stabilityPool.depositSnapshots(alice.address)
      )[2].toString();

      assert.equal(alice_scaleSnapshot, "0");
      assert.equal(alice_FILGainAt2ndScaleChange, alice_FILGainAfterFurtherLiquidation);
    });

    // --- Extreme values, confirm no overflows ---

    it("withdrawFromSP(): Large liquidated coll/debt, deposits and FIL price", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // FIL:USD price is $2 billion per FIL
      await priceFeed.setPrice(dec(2, 27));

      const depositors = [alice, bob];
      for (account of depositors) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(1, 36), account.address, account.address, {
            value: dec(2, 27),
          });
        await stabilityPool.connect(account).provideToSP(dec(1, 36), ZERO_ADDRESS);
      }

      // Defaulter opens trove with 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(1, 36)),
          defaulter_1.address,
          defaulter_1.address,
          { value: dec(1, 27) },
        );

      // FIL:USD price drops to $1 billion per FIL
      await priceFeed.setPrice(dec(1, 27));

      // Defaulter liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(1, 36));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(1, 36));

      // Grab the FIL gain from the emitted event in the tx log
      const alice_FILWithdrawn = await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL");
      const bob_FILWithdrawn = await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL");

      // Check DebtToken balances
      const aliceDebtTokenBalance = await debtToken.balanceOf(alice.address);
      const aliceExpectedDebtTokenBalance = toBN(dec(5, 35));
      const aliceDebtTokenBalDiff = aliceDebtTokenBalance.sub(aliceExpectedDebtTokenBalance).abs();

      assert.isTrue(aliceDebtTokenBalDiff.lte(toBN(dec(1, 18)))); // error tolerance of 1e18

      const bobDebtTokenBalance = await debtToken.balanceOf(bob.address);
      const bobExpectedDebtTokenBalance = toBN(dec(5, 35));
      const bobDebtTokenBalDiff = bobDebtTokenBalance.sub(bobExpectedDebtTokenBalance).abs();

      assert.isTrue(bobDebtTokenBalDiff.lte(toBN(dec(1, 18))));

      // Check FIL gains
      const aliceExpectedFILGain = toBN(dec(4975, 23));
      const aliceFILDiff = aliceExpectedFILGain.sub(toBN(alice_FILWithdrawn));

      assert.isTrue(aliceFILDiff.lte(toBN(dec(1, 18))));

      const bobExpectedFILGain = toBN(dec(4975, 23));
      const bobFILDiff = bobExpectedFILGain.sub(toBN(bob_FILWithdrawn));

      assert.isTrue(bobFILDiff.lte(toBN(dec(1, 18))));
    });

    it("withdrawFromSP(): Small liquidated coll/debt, large deposits and FIL price", async () => {
      // Whale opens Trove with 100k FIL
      await borrowerOperations
        .connect(whale)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(100000, 18)),
          whale.address,
          whale.address,
          {
            value: dec(100000, "ether"),
          },
        );

      // FIL:USD price is $2 billion per FIL
      await priceFeed.setPrice(dec(2, 27));
      const price = await priceFeed.getPrice();

      const depositors = [alice, bob];
      for (account of depositors) {
        await borrowerOperations
          .connect(account)
          .openTrove(th._100pct, dec(1, 38), account.address, account.address, {
            value: dec(2, 29),
          });
        await stabilityPool.connect(account).provideToSP(dec(1, 38), ZERO_ADDRESS);
      }

      // Defaulter opens trove with 50e-7 FIL and  5000 DebtToken. 200% ICR
      await borrowerOperations
        .connect(defaulter_1)
        .openTrove(
          th._100pct,
          await getOpenTroveDebtTokenAmount(dec(5000, 18)),
          defaulter_1.address,
          defaulter_1.address,
          { value: "5000000000000" },
        );

      // FIL:USD price drops to $1 billion per FIL
      await priceFeed.setPrice(dec(1, 27));

      // Defaulter liquidated
      await troveManager.connect(owner).liquidate(defaulter_1.address);

      const txA = await stabilityPool.connect(alice).withdrawFromSP(dec(1, 38));
      const txB = await stabilityPool.connect(bob).withdrawFromSP(dec(1, 38));

      const alice_FILWithdrawn = await th.getEventArgByName(txA, "FILGainWithdrawn", "_FIL");
      const bob_FILWithdrawn = await th.getEventArgByName(txB, "FILGainWithdrawn", "_FIL");

      const aliceDebtTokenBalance = await debtToken.balanceOf(alice.address);
      const aliceExpectedDebtTokenBalance = toBN("99999999999999997500000000000000000000");
      const aliceDebtTokenBalDiff = aliceDebtTokenBalance.sub(aliceExpectedDebtTokenBalance).abs();

      assert.isTrue(aliceDebtTokenBalDiff.lte(toBN(dec(1, 18))));

      const bobDebtTokenBalance = await debtToken.balanceOf(bob.address);
      const bobExpectedDebtTokenBalance = toBN("99999999999999997500000000000000000000");
      const bobDebtTokenBalDiff = bobDebtTokenBalance.sub(bobExpectedDebtTokenBalance).abs();

      assert.isTrue(bobDebtTokenBalDiff.lte(toBN("100000000000000000000")));

      // Expect FIL gain per depositor of ~1e11 wei to be rounded to 0 by the FILGainedPerUnitStaked calculation (e / D), where D is ~1e36.
      assert.equal(alice_FILWithdrawn.toString(), "0");
      assert.equal(bob_FILWithdrawn.toString(), "0");
    });
  });
});

contract("Reset chain state", async () => {});
