const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;

const dec = th.dec;
const toBN = th.toBN;
const assertRevert = th.assertRevert;

/* The majority of access control tests are contained in this file. However, tests for restrictions 
on the protocol admin address's capabilities during the first year are found in:

test/launchSequenceTest/DuringLockupPeriodTest.js */

contract(
  "Access Control: Protocol functions with the caller restricted to protocol contract(s)",
  async () => {
    let owner, alice, bob, carol;
    let lpRewardsAddress, multisig;

    let coreContracts;

    let debtToken;
    let sortedTroves;
    let troveManager;
    let activePool;
    let stabilityPool;
    let defaultPool;
    let borrowerOperations;

    let protocolTokenStaking;
    let protocolToken;
    let communityIssuance;
    let lockupContractFactory;

    before(async () => {
      const signers = await ethers.getSigners();

      [owner, alice, bob, carol] = signers;
      [lpRewardsAddress, multisig] = signers.slice(998, 1000);

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

      coreContracts = await deploymentHelper.deployProtocolCore(
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

      coreContracts.troveManager = troveManagerTester;
      coreContracts.debtToken = debtTokenTester;

      debtToken = coreContracts.debtToken;
      sortedTroves = coreContracts.sortedTroves;
      troveManager = coreContracts.troveManager;
      activePool = coreContracts.activePool;
      stabilityPool = coreContracts.stabilityPool;
      defaultPool = coreContracts.defaultPool;
      borrowerOperations = coreContracts.borrowerOperations;

      protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
      protocolToken = protocolTokenContracts.protocolToken;
      communityIssuance = protocolTokenContracts.communityIssuance;
      lockupContractFactory = protocolTokenContracts.lockupContractFactory;

      for (const signer of signers.slice(0, 10)) {
        await th.openTrove(coreContracts, {
          extraDebtTokenAmount: toBN(dec(20000, 18)),
          ICR: toBN(dec(2, 18)),
          extraParams: { from: signer },
        });
      }

      const expectedCISupplyCap = "32000000000000000000000000"; // 32mil

      // Check CI has been properly funded
      const bal = await protocolToken.balanceOf(communityIssuance.address);
      assert.equal(bal, expectedCISupplyCap);
    });

    describe("BorrowerOperations", async () => {
      it("moveFILGainToTrove(): reverts when called by an account that is not StabilityPool", async () => {
        // Attempt call from alice
        try {
          await borrowerOperations
            .connect(bob)
            .moveFILGainToTrove(bob.address, bob.address, bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "BorrowerOps: Caller is not Stability Pool")
        }
      });
    });

    describe("TroveManager", async () => {
      // applyPendingRewards
      it("applyPendingRewards(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).applyPendingRewards(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // updateRewardSnapshots
      it("updateRewardSnapshots(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).updateTroveRewardSnapshots(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // removeStake
      it("removeStake(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).removeStake(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // updateStakeAndTotalStakes
      it("updateStakeAndTotalStakes(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).updateStakeAndTotalStakes(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // closeTrove
      it("closeTrove(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).closeTrove(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // addTroveOwnerToArray
      it("addTroveOwnerToArray(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).addTroveOwnerToArray(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // setTroveStatus
      it("setTroveStatus(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).setTroveStatus(bob.address, 1);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // increaseTroveColl
      it("increaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).increaseTroveColl(bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // decreaseTroveColl
      it("decreaseTroveColl(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).decreaseTroveColl(bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // increaseTroveDebt
      it("increaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).increaseTroveDebt(bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });

      // decreaseTroveDebt
      it("decreaseTroveDebt(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        try {
          await troveManager.connect(alice).decreaseTroveDebt(bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is not the BorrowerOperations contract")
        }
      });
    });

    describe("ActivePool", async () => {
      // sendFIL
      it("sendFIL(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
        // Attempt call from alice
        try {
          await activePool.connect(alice).sendFIL(alice.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(
            err.message,
            "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
          );
        }
      });

      // increaseDebt
      it("increaseDebt(): reverts when called by an account that is not BO nor TroveM", async () => {
        // Attempt call from alice
        try {
          await activePool.connect(alice).increaseDebt(100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager");
        }
      });

      // decreaseDebt
      it("decreaseDebt(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
        // Attempt call from alice
        try {
          await activePool.connect(alice).decreaseDebt(100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(
            err.message,
            "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool",
          );
        }
      });

      // fallback (payment)
      it("fallback(): reverts when called by an account that is not Borrower Operations nor Default Pool", async () => {
        // Attempt call from alice
        try {
          await web3.eth.sendTransaction({
            from: alice.address,
            to: activePool.address,
            value: 100,
          });
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "ActivePool: Caller is neither BO nor Default Pool");
        }
      });
    });

    describe("DefaultPool", async () => {
      // sendFILToActivePool
      it("sendFILToActivePool(): reverts when called by an account that is not TroveManager", async () => {
        // Attempt call from alice
        try {
          await defaultPool.connect(alice).sendFILToActivePool(100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is not the TroveManager");
        }
      });

      // increaseDebt
      it("increaseDebt(): reverts when called by an account that is not TroveManager", async () => {
        // Attempt call from alice
        try {
          await defaultPool.connect(alice).increaseDebt(100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is not the TroveManager");
        }
      });

      // decreaseDebt
      it("decreaseDebt(): reverts when called by an account that is not TroveManager", async () => {
        // Attempt call from alice
        try {
          await defaultPool.connect(alice).decreaseDebt(100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is not the TroveManager");
        }
      });

      // fallback (payment)
      it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
        // Attempt call from alice
        try {
          await web3.eth.sendTransaction({
            from: alice.address,
            to: defaultPool.address,
            value: 100,
          });
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "DefaultPool: Caller is not the ActivePool");
        }
      });
    });

    describe("StabilityPool", async () => {
      // --- onlyTroveManager ---

      // offset
      it("offset(): reverts when called by an account that is not TroveManager", async () => {
        // Attempt call from alice
        try {
          const txAlice = await stabilityPool.connect(alice).offset(100, 10);
          assert.fail(txAlice);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is not TroveManager");
        }
      });

      // --- onlyActivePool ---

      // fallback (payment)
      it("fallback(): reverts when called by an account that is not the Active Pool", async () => {
        // Attempt call from alice
        try {
          await web3.eth.sendTransaction({
            from: alice.address,
            to: stabilityPool.address,
            value: 100,
          });
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "StabilityPool: Caller is not ActivePool");
        }
      });
    });

    describe("DebtToken", async () => {
      //    mint
      it("mint(): reverts when called by an account that is not BorrowerOperations", async () => {
        // Attempt call from alice
        const txAlice = debtToken.connect(alice).mint(bob.address, 100);
        await th.assertRevert(txAlice, "Caller is not BorrowerOperations");
      });

      // burn
      it("burn(): reverts when called by an account that is not BO nor TroveM nor SP", async () => {
        // Attempt call from alice
        try {
          await debtToken.connect(alice).burn(bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is neither BorrowerOperations nor TroveManager nor StabilityPool")
        }
      });

      // sendToPool
      it("sendToPool(): reverts when called by an account that is not StabilityPool", async () => {
        // Attempt call from alice
        try {
          await debtToken.connect(alice).sendToPool(bob.address, activePool.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is not the StabilityPool");
        }
      });

      // returnFromPool
      it("returnFromPool(): reverts when called by an account that is not TroveManager nor StabilityPool", async () => {
        // Attempt call from alice
        try {
          await debtToken.connect(alice).returnFromPool(activePool.address, bob.address, 100);
        } catch (err) {
          assert.include(err.message, "revert");
          // assert.include(err.message, "Caller is neither TroveManager nor StabilityPool")
        }
      });
    });

    describe("SortedTroves", async () => {
      // --- onlyBorrowerOperations ---
      //     insert
      it("insert(): reverts when called by an account that is not BorrowerOps or TroveM", async () => {
        // Attempt call from alice
        try {
          await sortedTroves
            .connect(alice)
            .insert(bob.address, "150000000000000000000", bob.address, bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, " Caller is neither BO nor TroveM");
        }
      });

      // --- onlyTroveManager ---
      // remove
      it("remove(): reverts when called by an account that is not TroveManager", async () => {
        // Attempt call from alice
        try {
          await sortedTroves.connect(alice).remove(bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, " Caller is not the TroveManager");
        }
      });

      // --- onlyTroveMorBM ---
      // reinsert
      it("reinsert(): reverts when called by an account that is neither BorrowerOps nor TroveManager", async () => {
        // Attempt call from alice
        try {
          await sortedTroves
            .connect(alice)
            .reInsert(bob.address, "150000000000000000000", bob.address, bob.address);
        } catch (err) {
          assert.include(err.message, "revert");
          assert.include(err.message, "Caller is neither BO nor TroveM");
        }
      });
    });

    describe("LockupContract", async () => {
      it("withdrawProtocolToken(): reverts when caller is not beneficiary", async () => {
        // deploy new LC with Carol as beneficiary
        const unlockTime = (await protocolToken.getAllocationStartTime()).add(
          toBN(timeValues.SECONDS_IN_ONE_YEAR),
        );
        const deployedLCtx = await lockupContractFactory
          .connect(owner)
          .deployLockupContract(carol.address, unlockTime);

        const LC = await th.getLCFromDeploymentTx(deployedLCtx);

        // ProtocolToken Multisig funds the LC
        await protocolToken.connect(multisig).transfer(LC.address, dec(100, 18));

        // Fast-forward one year, so that beneficiary can withdraw
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

        // Bob attempts to withdraw ProtocolToken
        try {
          await LC.connect(bob).withdrawProtocolToken();
        } catch (err) {
          assert.include(err.message, "revert");
        }

        // Confirm beneficiary, Carol, can withdraw
        const txCarol = await LC.connect(carol).withdrawProtocolToken();
        const receipt = await txCarol.wait();
        assert.equal(receipt.status, 1);
      });
    });

    describe("ProtocolTokenStaking", async () => {
      it("increaseF_DebtToken(): reverts when caller is not TroveManager", async () => {
        try {
          await protocolTokenStaking.connect(alice).increaseF_DebtToken(dec(1, 18));
        } catch (err) {
          assert.include(err.message, "revert");
        }
      });
    });

    describe("ProtocolToken", async () => {
      it("sendToProtocolTokenStaking(): reverts when caller is not the ProtocolTokenStaking", async () => {
        // Check multisig has some ProtocolToken
        assert.isTrue((await protocolToken.balanceOf(multisig.address)).gt(toBN("0")));

        // multisig tries to call it
        try {
          await protocolToken.connect(multisig).sendToProtocolTokenStaking(multisig.address, 1);
        } catch (err) {
          assert.include(err.message, "revert");
        }

        // FF >> time one year
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

        // Owner transfers 1 ProtocolToken to bob
        await protocolToken.connect(multisig).transfer(bob.address, dec(1, 18));
        assert.equal(await protocolToken.balanceOf(bob.address), dec(1, 18));

        // Bob tries to call it
        try {
          await protocolToken.connect(bob).sendToProtocolTokenStaking(bob.address, dec(1, 18));
        } catch (err) {
          assert.include(err.message, "revert");
        }
      });
    });

    describe("CommunityIssuance", async () => {
      it("sendProtocolToken(): reverts when caller is not the StabilityPool", async () => {
        const tx1 = communityIssuance.connect(alice).sendProtocolToken(alice.address, dec(100, 18));
        const tx2 = communityIssuance.connect(alice).sendProtocolToken(bob.address, dec(100, 18));
        const tx3 = communityIssuance
          .connect(alice)
          .sendProtocolToken(stabilityPool.address, dec(100, 18));

        assertRevert(tx1);
        assertRevert(tx2);
        assertRevert(tx3);
      });

      it("issueProtocolToken(): reverts when caller is not the StabilityPool", async () => {
        const tx1 = communityIssuance.connect(alice).issueProtocolToken();

        assertRevert(tx1);
      });
    });
  },
);
