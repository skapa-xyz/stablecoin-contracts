const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;

contract("SortedTroves", async () => {
  const assertSortedListIsOrdered = async (contracts) => {
    const price = await contracts.priceFeedTestnet.getPrice();

    let trove = await contracts.sortedTroves.getLast();
    while (trove !== (await contracts.sortedTroves.getFirst())) {
      // Get the adjacent upper trove ("prev" moves up the list, from lower ICR -> higher ICR)
      const prevTrove = await contracts.sortedTroves.getPrev(trove);

      const troveICR = await contracts.troveManager.getCurrentICR(trove, price);
      const prevTroveICR = await contracts.troveManager.getCurrentICR(prevTrove, price);

      assert.isTrue(prevTroveICR.gte(troveICR));

      const troveNICR = await contracts.troveManager.getNominalICR(trove);
      const prevTroveNICR = await contracts.troveManager.getNominalICR(prevTrove);

      assert.isTrue(prevTroveNICR.gte(troveNICR));

      // climb the list
      trove = prevTrove;
    }
  };

  let owner, alice, bob, carol, dennis, erin, defaulter_1, A, B, C, D, E, F, G, H, I, J, whale;

  let priceFeed;
  let sortedTroves;
  let troveManager;
  let borrowerOperations;
  let debtToken;

  let contracts;

  const openTrove = async (params) => th.openTrove(contracts, params);

  before(async () => {
    [owner, alice, bob, carol, dennis, erin, defaulter_1, A, B, C, D, E, F, G, H, I, J, whale] =
      await ethers.getSigners();
  });

  describe("SortedTroves", () => {
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

      await deploymentHelper.deployProtocolTokenContracts(owner.address, cpContracts);

      priceFeed = contracts.priceFeedTestnet;
      sortedTroves = contracts.sortedTroves;
      troveManager = contracts.troveManager;
      borrowerOperations = contracts.borrowerOperations;
      debtToken = contracts.debtToken;
    });

    it("contains(): returns true for addresses that have opened troves", async () => {
      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });
      await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: bob } });
      await openTrove({ ICR: toBN(dec(2000, 18)), extraParams: { from: carol } });

      // Confirm trove statuses became active
      assert.equal((await troveManager.Troves(alice.address))[3], "1");
      assert.equal((await troveManager.Troves(bob.address))[3], "1");
      assert.equal((await troveManager.Troves(carol.address))[3], "1");

      // Check sorted list contains troves
      assert.isTrue(await sortedTroves.contains(alice.address));
      assert.isTrue(await sortedTroves.contains(bob.address));
      assert.isTrue(await sortedTroves.contains(carol.address));
    });

    it("contains(): returns false for addresses that have not opened troves", async () => {
      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });
      await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: bob } });
      await openTrove({ ICR: toBN(dec(2000, 18)), extraParams: { from: carol } });

      // Confirm troves have non-existent status
      assert.equal((await troveManager.Troves(dennis.address))[3], "0");
      assert.equal((await troveManager.Troves(erin.address))[3], "0");

      // Check sorted list do not contain troves
      assert.isFalse(await sortedTroves.contains(dennis.address));
      assert.isFalse(await sortedTroves.contains(erin.address));
    });

    it("contains(): returns false for addresses that opened and then closed a trove", async () => {
      await openTrove({
        ICR: toBN(dec(1000, 18)),
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        extraParams: { from: whale },
      });

      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });
      await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: bob } });
      await openTrove({ ICR: toBN(dec(2000, 18)), extraParams: { from: carol } });

      // to compensate borrowing fees
      await debtToken.connect(whale).transfer(alice.address, dec(1000, 18));
      await debtToken.connect(whale).transfer(bob.address, dec(1000, 18));
      await debtToken.connect(whale).transfer(carol.address, dec(1000, 18));

      // A, B, C close troves
      await borrowerOperations.connect(alice).closeTrove();
      await borrowerOperations.connect(bob).closeTrove();
      await borrowerOperations.connect(carol).closeTrove();

      // Confirm trove statuses became closed
      assert.equal((await troveManager.Troves(alice.address))[3], "2");
      assert.equal((await troveManager.Troves(bob.address))[3], "2");
      assert.equal((await troveManager.Troves(carol.address))[3], "2");

      // Check sorted list does not contain troves
      assert.isFalse(await sortedTroves.contains(alice.address));
      assert.isFalse(await sortedTroves.contains(bob.address));
      assert.isFalse(await sortedTroves.contains(carol.address));
    });

    // true for addresses that opened -> closed -> opened a trove
    it("contains(): returns true for addresses that opened, closed and then re-opened a trove", async () => {
      await openTrove({
        ICR: toBN(dec(1000, 18)),
        extraDebtTokenAmount: toBN(dec(3000, 18)),
        extraParams: { from: whale },
      });

      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });
      await openTrove({ ICR: toBN(dec(20, 18)), extraParams: { from: bob } });
      await openTrove({ ICR: toBN(dec(2000, 18)), extraParams: { from: carol } });

      // to compensate borrowing fees
      await debtToken.connect(whale).transfer(alice.address, dec(1000, 18));
      await debtToken.connect(whale).transfer(bob.address, dec(1000, 18));
      await debtToken.connect(whale).transfer(carol.address, dec(1000, 18));

      // A, B, C close troves
      await borrowerOperations.connect(alice).closeTrove();
      await borrowerOperations.connect(bob).closeTrove();
      await borrowerOperations.connect(carol).closeTrove();

      // Confirm trove statuses became closed
      assert.equal((await troveManager.Troves(alice.address))[3], "2");
      assert.equal((await troveManager.Troves(bob.address))[3], "2");
      assert.equal((await troveManager.Troves(carol.address))[3], "2");

      await openTrove({ ICR: toBN(dec(1000, 16)), extraParams: { from: alice } });
      await openTrove({ ICR: toBN(dec(2000, 18)), extraParams: { from: bob } });
      await openTrove({ ICR: toBN(dec(3000, 18)), extraParams: { from: carol } });

      // Confirm trove statuses became open again
      assert.equal((await troveManager.Troves(alice.address))[3], "1");
      assert.equal((await troveManager.Troves(bob.address))[3], "1");
      assert.equal((await troveManager.Troves(carol.address))[3], "1");

      // Check sorted list does  contain troves
      assert.isTrue(await sortedTroves.contains(alice.address));
      assert.isTrue(await sortedTroves.contains(bob.address));
      assert.isTrue(await sortedTroves.contains(carol.address));
    });

    // false when list size is 0
    it("contains(): returns false when there are no troves in the system", async () => {
      assert.isFalse(await sortedTroves.contains(alice.address));
      assert.isFalse(await sortedTroves.contains(bob.address));
      assert.isFalse(await sortedTroves.contains(carol.address));
    });

    // true when list size is 1 and the trove the only one in system
    it("contains(): true when list size is 1 and the trove the only one in system", async () => {
      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });

      assert.isTrue(await sortedTroves.contains(alice.address));
    });

    // false when list size is 1 and trove is not in the system
    it("contains(): false when list size is 1 and trove is not in the system", async () => {
      await openTrove({ ICR: toBN(dec(150, 16)), extraParams: { from: alice } });

      assert.isFalse(await sortedTroves.contains(bob.address));
    });

    // --- getMaxSize ---

    it("getMaxSize(): Returns the maximum list size", async () => {
      const max = await sortedTroves.getMaxSize();
      assert.equal(web3.utils.toHex(max), th.maxBytes32);
    });

    // --- findInsertPosition ---

    it("Finds the correct insert position given two addresses that loosely bound the correct position", async () => {
      await priceFeed.setPrice(dec(100, 18));

      // NICR sorted in descending order
      await openTrove({ ICR: toBN(dec(500, 18)), extraParams: { from: whale } });
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: A } });
      await openTrove({ ICR: toBN(dec(5, 18)), extraParams: { from: B } });
      await openTrove({ ICR: toBN(dec(250, 16)), extraParams: { from: C } });
      await openTrove({ ICR: toBN(dec(166, 16)), extraParams: { from: D } });
      await openTrove({ ICR: toBN(dec(125, 16)), extraParams: { from: E } });

      // Expect a trove with NICR 300% to be inserted between B and C
      const targetNICR = dec(3, 18);

      // Pass addresses that loosely bound the right postiion
      const hints = await sortedTroves.findInsertPosition(targetNICR, A.address, E.address);

      // Expect the exact correct insert hints have been returned
      assert.equal(hints[0], B.address);
      assert.equal(hints[1], C.address);

      // The price doesn’t affect the hints
      await priceFeed.setPrice(dec(500, 18));
      const hints2 = await sortedTroves.findInsertPosition(targetNICR, A.address, E.address);

      // Expect the exact correct insert hints have been returned
      assert.equal(hints2[0], B.address);
      assert.equal(hints2[1], C.address);
    });

    //--- Ordering ---
    // infinte ICR (zero collateral) is not possible anymore, therefore, skipping
    it.skip("stays ordered after troves with 'infinite' ICR receive a redistribution", async () => {
      // make several troves with 0 debt and collateral, in random order
      await borrowerOperations.openTrove(th._100pct, 0, whale, whale, {
        from: whale,
        value: dec(50, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, 0, A, A, { from: A, value: dec(1, "ether") });
      await borrowerOperations.openTrove(th._100pct, 0, B, B, { from: B, value: dec(37, "ether") });
      await borrowerOperations.openTrove(th._100pct, 0, C, C, { from: C, value: dec(5, "ether") });
      await borrowerOperations.openTrove(th._100pct, 0, D, D, { from: D, value: dec(4, "ether") });
      await borrowerOperations.openTrove(th._100pct, 0, E, E, { from: E, value: dec(19, "ether") });

      // Make some troves with non-zero debt, in random order
      await borrowerOperations.openTrove(th._100pct, dec(5, 19), F, F, {
        from: F,
        value: dec(1, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(3, 18), G, G, {
        from: G,
        value: dec(37, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(2, 20), H, H, {
        from: H,
        value: dec(5, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(17, 18), I, I, {
        from: I,
        value: dec(4, "ether"),
      });
      await borrowerOperations.openTrove(th._100pct, dec(5, 21), J, J, {
        from: J,
        value: dec(1345, "ether"),
      });

      const price_1 = await priceFeed.getPrice();

      // Check troves are ordered
      await assertSortedListIsOrdered(contracts);

      await borrowerOperations.openTrove(th._100pct, dec(100, 18), defaulter_1, defaulter_1, {
        from: defaulter_1,
        value: dec(1, "ether"),
      });
      assert.isTrue(await sortedTroves.contains(defaulter_1.address));

      // Price drops
      await priceFeed.setPrice(dec(100, 18));
      const price_2 = await priceFeed.getPrice();

      // Liquidate a trove
      await troveManager.liquidate(defaulter_1);
      assert.isFalse(await sortedTroves.contains(defaulter_1.address));

      // Check troves are ordered
      await assertSortedListIsOrdered(contracts);
    });
  });
});
