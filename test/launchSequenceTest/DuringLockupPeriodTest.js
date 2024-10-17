const LockupContract = artifacts.require("./LockupContract.sol");
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol");
const deploymentHelper = require("../../utils/deploymentHelpers.js");

const { TestHelper: th, TimeValues: timeValues } = require("../../utils/testHelpers.js");
const { dec, toBN, assertRevert, ZERO_ADDRESS } = th;

contract("During the initial lockup period", async (accounts) => {
  const [
    deployer,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_364_DAYS = timeValues.SECONDS_IN_ONE_DAY * 364;

  let protocolTokenContracts;
  let coreContracts;

  // LCs for team members on vesting schedules
  let LC_T1;
  let LC_T2;
  let LC_T3;

  // LCs for investors
  let LC_I1;
  let LC_I2;
  let LC_I3;

  // 1e24 = 1 million tokens with 18 decimal digits
  const teamMemberInitialEntitlement_1 = dec(1, 24);
  const teamMemberInitialEntitlement_2 = dec(2, 24);
  const teamMemberInitialEntitlement_3 = dec(3, 24);
  const investorInitialEntitlement_1 = dec(4, 24);
  const investorInitialEntitlement_2 = dec(5, 24);
  const investorInitialEntitlement_3 = dec(6, 24);

  const protocolTokenEntitlement_A = dec(1, 24);
  const protocolTokenEntitlement_B = dec(2, 24);
  const protocolTokenEntitlement_C = dec(3, 24);
  const protocolTokenEntitlement_D = dec(4, 24);
  const protocolTokenEntitlement_E = dec(5, 24);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;

  beforeEach(async () => {
    // Deploy all contracts from the first account
    coreContracts = await deploymentHelper.deployProtocolCore(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    protocolTokenContracts = await deploymentHelper.deployProtocolTokenTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig,
    );

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;

    await deploymentHelper.connectProtocolTokenContracts(protocolTokenContracts);
    await deploymentHelper.connectCoreContracts(coreContracts, protocolTokenContracts);
    await deploymentHelper.connectProtocolTokenContractsToCore(
      protocolTokenContracts,
      coreContracts,
    );

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
      protocolToken,
      web3,
      timeValues.SECONDS_IN_ONE_YEAR,
    );
    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN("2"));
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      protocolToken,
      web3,
      secondsInTwoYears,
    );

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(
      teamMember_1,
      oneYearFromSystemDeployment,
      { from: deployer },
    );
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(
      teamMember_2,
      oneYearFromSystemDeployment,
      { from: deployer },
    );
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(
      teamMember_3,
      oneYearFromSystemDeployment,
      { from: deployer },
    );

    // Deploy 3 LCs for investors
    const deployedLCtx_I1 = await lockupContractFactory.deployLockupContract(
      investor_1,
      oneYearFromSystemDeployment,
      { from: deployer },
    );
    const deployedLCtx_I2 = await lockupContractFactory.deployLockupContract(
      investor_2,
      oneYearFromSystemDeployment,
      { from: deployer },
    );
    const deployedLCtx_I3 = await lockupContractFactory.deployLockupContract(
      investor_3,
      oneYearFromSystemDeployment,
      { from: deployer },
    );

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1);
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2);
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3);

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1);
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2);
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3);

    // Multisig transfers initial ProtocolToken entitlements to LCs
    await protocolToken.transfer(LC_T1.address, teamMemberInitialEntitlement_1, { from: multisig });
    await protocolToken.transfer(LC_T2.address, teamMemberInitialEntitlement_2, { from: multisig });
    await protocolToken.transfer(LC_T3.address, teamMemberInitialEntitlement_3, { from: multisig });

    await protocolToken.transfer(LC_I1.address, investorInitialEntitlement_1, { from: multisig });
    await protocolToken.transfer(LC_I2.address, investorInitialEntitlement_2, { from: multisig });
    await protocolToken.transfer(LC_I3.address, investorInitialEntitlement_3, { from: multisig });

    // Fast forward time 364 days, so that still less than 1 year since launch has passed
    await th.fastForwardTime(SECONDS_IN_364_DAYS, web3.currentProvider);
  });

  describe("ProtocolToken transfer during first year after ProtocolToken deployment", async (accounts) => {
    // --- Deployer transfer restriction, 1st year ---
    it("Multisig can not transfer ProtocolToken to a LC that was deployed directly", async () => {
      // Multisig deploys LC_A
      const LC_A = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: multisig,
      });

      // Account F deploys LC_B
      const LC_B = await LockupContract.new(protocolToken.address, B, oneYearFromSystemDeployment, {
        from: F,
      });

      // ProtocolToken deployer deploys LC_C
      const LC_C = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: deployer,
      });

      // Multisig attempts ProtocolToken transfer to LC_A
      try {
        const protocolTokenTransferTx_A = await protocolToken.transfer(LC_A.address, dec(1, 18), {
          from: multisig,
        });
        assert.isFalse(protocolTokenTransferTx_A.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "ProtocolToken: recipient must be a LockupContract registered in the Factory",
        );
      }

      // Multisig attempts ProtocolToken transfer to LC_B
      try {
        const protocolTokenTransferTx_B = await protocolToken.transfer(LC_B.address, dec(1, 18), {
          from: multisig,
        });
        assert.isFalse(protocolTokenTransferTx_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "ProtocolToken: recipient must be a LockupContract registered in the Factory",
        );
      }

      try {
        const protocolTokenTransferTx_C = await protocolToken.transfer(LC_C.address, dec(1, 18), {
          from: multisig,
        });
        assert.isFalse(protocolTokenTransferTx_C.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "ProtocolToken: recipient must be a LockupContract registered in the Factory",
        );
      }
    });

    it("Multisig can not transfer to an EOA or protocol system contracts", async () => {
      // Multisig attempts ProtocolToken transfer to EOAs
      const protocolTokenTransferTxPromise_1 = protocolToken.transfer(A, dec(1, 18), {
        from: multisig,
      });
      const protocolTokenTransferTxPromise_2 = protocolToken.transfer(B, dec(1, 18), {
        from: multisig,
      });
      await assertRevert(protocolTokenTransferTxPromise_1);
      await assertRevert(protocolTokenTransferTxPromise_2);

      // Multisig attempts ProtocolToken transfer to core protocol contracts
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenTransferTxPromise = protocolToken.transfer(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenTransferTxPromise,
          "ProtocolToken: recipient must be a LockupContract registered in the Factory",
        );
      }

      // Multisig attempts ProtocolToken transfer to ProtocolToken contracts (excluding LCs)
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenTransferTxPromise = protocolToken.transfer(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          {
            from: multisig,
          },
        );
        await assertRevert(
          protocolTokenTransferTxPromise,
          "ProtocolToken: recipient must be a LockupContract registered in the Factory",
        );
      }
    });

    // --- Deployer approval restriction, 1st year ---
    it("Multisig can not approve any EOA or protocol system contract to spend their ProtocolToken", async () => {
      // Multisig attempts to approve EOAs to spend ProtocolToken
      const protocolTokenApproveTxPromise_1 = protocolToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const protocolTokenApproveTxPromise_2 = protocolToken.approve(B, dec(1, 18), {
        from: multisig,
      });
      await assertRevert(
        protocolTokenApproveTxPromise_1,
        "ProtocolToken: caller must not be the multisig",
      );
      await assertRevert(
        protocolTokenApproveTxPromise_2,
        "ProtocolToken: caller must not be the multisig",
      );

      // Multisig attempts to approve protocol contracts to spend ProtocolToken
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenApproveTxPromise = protocolToken.approve(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenApproveTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }

      // Multisig attempts to approve ProtocolToken contracts to spend ProtocolToken (excluding LCs)
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenApproveTxPromise = protocolToken.approve(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenApproveTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }
    });

    // --- Deployer increaseAllowance restriction, 1st year ---
    it("Multisig can not increaseAllowance for any EOA or protocol contract", async () => {
      // Multisig attempts to approve EOAs to spend ProtocolToken
      const protocolTokenIncreaseAllowanceTxPromise_1 = protocolToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: multisig },
      );
      const protocolTokenIncreaseAllowanceTxPromise_2 = protocolToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: multisig },
      );
      await assertRevert(
        protocolTokenIncreaseAllowanceTxPromise_1,
        "ProtocolToken: caller must not be the multisig",
      );
      await assertRevert(
        protocolTokenIncreaseAllowanceTxPromise_2,
        "ProtocolToken: caller must not be the multisig",
      );

      // Multisig attempts to approve protocol contracts to spend ProtocolToken
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenIncreaseAllowanceTxPromise = protocolToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenIncreaseAllowanceTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }

      // Multisig attempts to approve ProtocolToken contracts to spend ProtocolToken (excluding LCs)
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenIncreaseAllowanceTxPromise = protocolToken.increaseAllowance(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenIncreaseAllowanceTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }
    });

    // --- Deployer decreaseAllowance restriction, 1st year ---
    it("Multisig can not decreaseAllowance for any EOA or protocol contract", async () => {
      // Multisig attempts to decreaseAllowance on EOAs
      const protocolTokenDecreaseAllowanceTxPromise_1 = protocolToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: multisig },
      );
      const protocolTokenDecreaseAllowanceTxPromise_2 = protocolToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: multisig },
      );
      await assertRevert(
        protocolTokenDecreaseAllowanceTxPromise_1,
        "ProtocolToken: caller must not be the multisig",
      );
      await assertRevert(
        protocolTokenDecreaseAllowanceTxPromise_2,
        "ProtocolToken: caller must not be the multisig",
      );

      // Multisig attempts to decrease allowance on protocol contracts
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenDecreaseAllowanceTxPromise = protocolToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenDecreaseAllowanceTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }

      // Multisig attempts to decrease allowance on ProtocolToken contracts (excluding LCs)
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenDecreaseAllowanceTxPromise = protocolToken.decreaseAllowance(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: multisig },
        );
        await assertRevert(
          protocolTokenDecreaseAllowanceTxPromise,
          "ProtocolToken: caller must not be the multisig",
        );
      }
    });

    // --- Multisig transferFrom restriction, 1st year ---
    it("Multisig can not be the sender in a transferFrom() call", async () => {
      // EOAs attempt to use multisig as sender in a transferFrom()
      const protocolTokenTransferFromTxPromise_1 = protocolToken.transferFrom(
        multisig,
        A,
        dec(1, 18),
        { from: A },
      );
      const protocolTokenTransferFromTxPromise_2 = protocolToken.transferFrom(
        multisig,
        C,
        dec(1, 18),
        { from: B },
      );
      await assertRevert(
        protocolTokenTransferFromTxPromise_1,
        "ProtocolToken: sender must not be the multisig",
      );
      await assertRevert(
        protocolTokenTransferFromTxPromise_2,
        "ProtocolToken: sender must not be the multisig",
      );
    });

    //  --- staking, 1st year ---
    it("Multisig can not stake their ProtocolToken in the staking contract", async () => {
      const ProtocolTokenStakingTxPromise_1 = protocolTokenStaking.stake(dec(1, 18), {
        from: multisig,
      });
      await assertRevert(
        ProtocolTokenStakingTxPromise_1,
        "ProtocolToken: sender must not be the multisig",
      );
    });

    // --- Anyone else ---

    it("Anyone (other than Multisig) can transfer ProtocolToken to LCs deployed by anyone through the Factory", async () => {
      // Start D, E, F with some ProtocolToken
      await protocolToken.unprotectedMint(D, dec(1, 24));
      await protocolToken.unprotectedMint(E, dec(2, 24));
      await protocolToken.unprotectedMint(F, dec(3, 24));

      // H, I, and Deployer deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: H },
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: I },
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        oneYearFromSystemDeployment,
        { from: multisig },
      );

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A);
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B);
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await protocolToken.balanceOf(LCAddress_A), "0");
      assert.equal(await protocolToken.balanceOf(LCAddress_B), "0");
      assert.equal(await protocolToken.balanceOf(LCAddress_C), "0");

      // D, E, F transfer ProtocolToken to LCs
      await protocolToken.transfer(LCAddress_A, dec(1, 24), { from: D });
      await protocolToken.transfer(LCAddress_B, dec(2, 24), { from: E });
      await protocolToken.transfer(LCAddress_C, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await protocolToken.balanceOf(LCAddress_A), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(LCAddress_B), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(LCAddress_C), dec(3, 24));
    });

    it("Anyone (other than Multisig) can transfer ProtocolToken to LCs deployed by anyone directly", async () => {
      // Start D, E, F with some ProtocolToken
      await protocolToken.unprotectedMint(D, dec(1, 24));
      await protocolToken.unprotectedMint(E, dec(2, 24));
      await protocolToken.unprotectedMint(F, dec(3, 24));

      // H, I, LiqAG deploy lockup contracts with A, B, C as beneficiaries, respectively
      const LC_A = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: H,
      });
      const LC_B = await LockupContract.new(protocolToken.address, B, oneYearFromSystemDeployment, {
        from: I,
      });
      const LC_C = await LockupContract.new(protocolToken.address, C, oneYearFromSystemDeployment, {
        from: multisig,
      });

      // Check balances of LCs are 0
      assert.equal(await protocolToken.balanceOf(LC_A.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_B.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_C.address), "0");

      // D, E, F transfer ProtocolToken to LCs
      await protocolToken.transfer(LC_A.address, dec(1, 24), { from: D });
      await protocolToken.transfer(LC_B.address, dec(2, 24), { from: E });
      await protocolToken.transfer(LC_C.address, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await protocolToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("Anyone (other than multisig) can transfer to an EOA", async () => {
      // Start D, E, F with some ProtocolToken
      await protocolToken.unprotectedMint(D, dec(1, 24));
      await protocolToken.unprotectedMint(E, dec(2, 24));
      await protocolToken.unprotectedMint(F, dec(3, 24));

      // ProtocolToken holders transfer to other transfer to EOAs
      const protocolTokenTransferTx_1 = await protocolToken.transfer(A, dec(1, 18), { from: D });
      const protocolTokenTransferTx_2 = await protocolToken.transfer(B, dec(1, 18), { from: E });
      const protocolTokenTransferTx_3 = await protocolToken.transfer(multisig, dec(1, 18), {
        from: F,
      });

      assert.isTrue(protocolTokenTransferTx_1.receipt.status);
      assert.isTrue(protocolTokenTransferTx_2.receipt.status);
      assert.isTrue(protocolTokenTransferTx_3.receipt.status);
    });

    it("Anyone (other than multisig) can approve any EOA or to spend their ProtocolToken", async () => {
      // EOAs approve EOAs to spend ProtocolToken
      const protocolTokenApproveTx_1 = await protocolToken.approve(A, dec(1, 18), { from: F });
      const protocolTokenApproveTx_2 = await protocolToken.approve(B, dec(1, 18), { from: G });
      await assert.isTrue(protocolTokenApproveTx_1.receipt.status);
      await assert.isTrue(protocolTokenApproveTx_2.receipt.status);
    });

    it("Anyone (other than multisig) can increaseAllowance for any EOA or protocol contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend ProtocolToken
      const protocolTokenIncreaseAllowanceTx_1 = await protocolToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: F },
      );
      const protocolTokenIncreaseAllowanceTx_2 = await protocolToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G },
      );
      await assert.isTrue(protocolTokenIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(protocolTokenIncreaseAllowanceTx_2.receipt.status);

      // Increase allowance of core protocol contracts
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenIncreaseAllowanceTx = await protocolToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of ProtocolToken contracts
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenIncreaseAllowanceTx = await protocolToken.increaseAllowance(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone (other than multisig) can decreaseAllowance for any EOA or protocol contract", async () => {
      //First, increase allowance of A, B and coreContracts and ProtocolToken contracts
      const protocolTokenIncreaseAllowanceTx_1 = await protocolToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: F },
      );
      const protocolTokenIncreaseAllowanceTx_2 = await protocolToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G },
      );
      await assert.isTrue(protocolTokenIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(protocolTokenIncreaseAllowanceTx_2.receipt.status);

      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenTransferTx = await protocolToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenTransferTx.receipt.status);
      }

      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenTransferTx = await protocolToken.increaseAllowance(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenTransferTx.receipt.status);
      }

      // Decrease allowance of A, B
      const protocolTokenDecreaseAllowanceTx_1 = await protocolToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: F },
      );
      const protocolTokenDecreaseAllowanceTx_2 = await protocolToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: G },
      );
      await assert.isTrue(protocolTokenDecreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(protocolTokenDecreaseAllowanceTx_2.receipt.status);

      // Decrease allowance of core contracts
      for (const contract of Object.keys(coreContracts)) {
        const protocolTokenDecreaseAllowanceTx = await protocolToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of ProtocolToken contracts
      for (const contract of Object.keys(protocolTokenContracts)) {
        const protocolTokenDecreaseAllowanceTx = await protocolToken.decreaseAllowance(
          protocolTokenContracts[contract].address,
          dec(1, 18),
          { from: F },
        );
        await assert.isTrue(protocolTokenDecreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone (other than multisig) can be the sender in a transferFrom() call", async () => {
      // Fund A, B
      await protocolToken.unprotectedMint(A, dec(1, 18));
      await protocolToken.unprotectedMint(B, dec(1, 18));

      // A, B approve F, G
      await protocolToken.approve(F, dec(1, 18), { from: A });
      await protocolToken.approve(G, dec(1, 18), { from: B });

      const protocolTokenTransferFromTx_1 = await protocolToken.transferFrom(A, F, dec(1, 18), {
        from: F,
      });
      const protocolTokenTransferFromTx_2 = await protocolToken.transferFrom(B, C, dec(1, 18), {
        from: G,
      });
      await assert.isTrue(protocolTokenTransferFromTx_1.receipt.status);
      await assert.isTrue(protocolTokenTransferFromTx_2.receipt.status);
    });

    it("Anyone (other than deployer) can stake their ProtocolToken in the staking contract", async () => {
      // Fund F
      await protocolToken.unprotectedMint(F, dec(1, 18));

      const ProtocolTokenStakingTx_1 = await protocolTokenStaking.stake(dec(1, 18), { from: F });
      await assert.isTrue(ProtocolTokenStakingTx_1.receipt.status);
    });
  });
  // --- LCF ---

  describe("Lockup Contract Factory negative tests", async (accounts) => {
    it("deployLockupContract(): reverts when ProtocolToken token address is not set", async () => {
      // Fund F
      await protocolToken.unprotectedMint(F, dec(20, 24));

      // deploy new LCF
      const LCFNew = await LockupContractFactory.new();

      // Check ProtocolToken address not registered
      const registeredProtocolTokenAddr = await LCFNew.protocolTokenAddress();
      assert.equal(registeredProtocolTokenAddr, ZERO_ADDRESS);

      const tx = LCFNew.deployLockupContract(A, oneYearFromSystemDeployment, { from: F });
      await assertRevert(tx);
    });
  });

  // --- LCs ---
  describe("Transferring ProtocolToken to LCs", async (accounts) => {
    it("Multisig can transfer ProtocolToken (vesting) to lockup contracts they deployed", async () => {
      const initialProtocolTokenBalanceOfLC_T1 = await protocolToken.balanceOf(LC_T1.address);
      const initialProtocolTokenBalanceOfLC_T2 = await protocolToken.balanceOf(LC_T2.address);
      const initialProtocolTokenBalanceOfLC_T3 = await protocolToken.balanceOf(LC_T3.address);

      // Check initial LC balances == entitlements
      assert.equal(initialProtocolTokenBalanceOfLC_T1, teamMemberInitialEntitlement_1);
      assert.equal(initialProtocolTokenBalanceOfLC_T2, teamMemberInitialEntitlement_2);
      assert.equal(initialProtocolTokenBalanceOfLC_T3, teamMemberInitialEntitlement_3);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Multisig transfers vesting amount
      await protocolToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await protocolToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await protocolToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC ProtocolToken balances
      const protocolTokenBalanceOfLC_T1_1 = await protocolToken.balanceOf(LC_T1.address);
      const protocolTokenBalanceOfLC_T2_1 = await protocolToken.balanceOf(LC_T2.address);
      const protocolTokenBalanceOfLC_T3_1 = await protocolToken.balanceOf(LC_T3.address);

      // // Check team member LC balances have increased
      assert.isTrue(
        protocolTokenBalanceOfLC_T1_1.eq(
          th.toBN(initialProtocolTokenBalanceOfLC_T1).add(th.toBN(dec(1, 24))),
        ),
      );
      assert.isTrue(
        protocolTokenBalanceOfLC_T2_1.eq(
          th.toBN(initialProtocolTokenBalanceOfLC_T2).add(th.toBN(dec(1, 24))),
        ),
      );
      assert.isTrue(
        protocolTokenBalanceOfLC_T3_1.eq(
          th.toBN(initialProtocolTokenBalanceOfLC_T3).add(th.toBN(dec(1, 24))),
        ),
      );

      // Another month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Multisig transfers vesting amount
      await protocolToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await protocolToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await protocolToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC ProtocolToken balances
      const protocolTokenBalanceOfLC_T1_2 = await protocolToken.balanceOf(LC_T1.address);
      const protocolTokenBalanceOfLC_T2_2 = await protocolToken.balanceOf(LC_T2.address);
      const protocolTokenBalanceOfLC_T3_2 = await protocolToken.balanceOf(LC_T3.address);

      // Check team member LC balances have increased again
      assert.isTrue(
        protocolTokenBalanceOfLC_T1_2.eq(protocolTokenBalanceOfLC_T1_1.add(th.toBN(dec(1, 24)))),
      );
      assert.isTrue(
        protocolTokenBalanceOfLC_T2_2.eq(protocolTokenBalanceOfLC_T2_1.add(th.toBN(dec(1, 24)))),
      );
      assert.isTrue(
        protocolTokenBalanceOfLC_T3_2.eq(protocolTokenBalanceOfLC_T3_1.add(th.toBN(dec(1, 24)))),
      );
    });

    it("Multisig can transfer ProtocolToken to lockup contracts deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract with themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        twoYearsFromSystemDeployment,
        {
          from: A,
        },
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
        {
          from: B,
        },
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        {
          from: C,
        },
      );

      // LCs for team members on vesting schedules
      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await protocolToken.balanceOf(LC_A.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_B.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Multisig transfers ProtocolToken to LCs deployed by other accounts
      await protocolToken.transfer(LC_A.address, dec(1, 24), { from: multisig });
      await protocolToken.transfer(LC_B.address, dec(2, 24), { from: multisig });
      await protocolToken.transfer(LC_C.address, dec(3, 24), { from: multisig });

      // Check balances of LCs have increased
      assert.equal(await protocolToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(LC_C.address), dec(3, 24));
    });
  });

  describe("Deploying new LCs", async (accounts) => {
    it("ProtocolToken Deployer can deploy LCs through the Factory", async () => {
      // ProtocolToken deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        {
          from: deployer,
        },
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
        {
          from: deployer,
        },
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        {
          from: deployer,
        },
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Multisig can deploy LCs through the Factory", async () => {
      // ProtocolToken deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        {
          from: multisig,
        },
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
        {
          from: multisig,
        },
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        {
          from: multisig,
        },
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Anyone can deploy LCs through the Factory", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        {
          from: teamMember_1,
        },
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        {
          from: investor_2,
        },
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        deployer,
        "9595995999999900000023423234",
        { from: A },
      );
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        {
          from: B,
        },
      );

      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
    });

    it("ProtocolToken Deployer can deploy LCs directly", async () => {
      // ProtocolToken deployer deploys LCs
      const LC_A = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: deployer,
      });
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash);

      const LC_B = await LockupContract.new(
        protocolToken.address,
        B,
        twoYearsFromSystemDeployment,
        {
          from: deployer,
        },
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash);

      const LC_C = await LockupContract.new(
        protocolToken.address,
        C,
        twoYearsFromSystemDeployment,
        {
          from: deployer,
        },
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash);

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Multisig can deploy LCs directly", async () => {
      // ProtocolToken deployer deploys LCs
      const LC_A = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: multisig,
      });
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash);

      const LC_B = await LockupContract.new(
        protocolToken.address,
        B,
        twoYearsFromSystemDeployment,
        {
          from: multisig,
        },
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash);

      const LC_C = await LockupContract.new(
        protocolToken.address,
        C,
        twoYearsFromSystemDeployment,
        {
          from: multisig,
        },
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash);

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Anyone can deploy LCs directly", async () => {
      // Various EOAs deploy LCs
      const LC_A = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: D,
      });
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash);

      const LC_B = await LockupContract.new(
        protocolToken.address,
        B,
        twoYearsFromSystemDeployment,
        {
          from: E,
        },
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash);

      const LC_C = await LockupContract.new(
        protocolToken.address,
        C,
        twoYearsFromSystemDeployment,
        {
          from: F,
        },
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash);

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Anyone can deploy LCs with unlockTime = one year from deployment, directly and through factory", async () => {
      // Deploy directly
      const LC_1 = await LockupContract.new(protocolToken.address, A, oneYearFromSystemDeployment, {
        from: D,
      });
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(LC_1.transactionHash);

      const LC_2 = await LockupContract.new(protocolToken.address, B, oneYearFromSystemDeployment, {
        from: deployer,
      });
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(LC_2.transactionHash);

      const LC_3 = await LockupContract.new(protocolToken.address, C, oneYearFromSystemDeployment, {
        from: multisig,
      });
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(LC_2.transactionHash);

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        {
          from: E,
        },
      );
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        {
          from: deployer,
        },
      );
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        {
          from: multisig,
        },
      );

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status);
      assert.isTrue(LCTxReceipt_2.status);
      assert.isTrue(LCTxReceipt_3.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
      assert.isTrue(LCDeploymentTx_5.receipt.status);
      assert.isTrue(LCDeploymentTx_6.receipt.status);
    });

    it("Anyone can deploy LCs with unlockTime > one year from deployment, directly and through factory", async () => {
      const justOverOneYear = oneYearFromSystemDeployment.add(toBN("1"));
      const _17YearsFromDeployment = oneYearFromSystemDeployment.add(
        toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN("2")),
      );

      // Deploy directly
      const LC_1 = await LockupContract.new(
        protocolToken.address,
        A,
        twoYearsFromSystemDeployment,
        {
          from: D,
        },
      );
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(LC_1.transactionHash);

      const LC_2 = await LockupContract.new(protocolToken.address, B, justOverOneYear, {
        from: multisig,
      });
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(LC_2.transactionHash);

      const LC_3 = await LockupContract.new(protocolToken.address, E, _17YearsFromDeployment, {
        from: E,
      });
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(LC_3.transactionHash);

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        {
          from: E,
        },
      );
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        {
          from: multisig,
        },
      );
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        {
          from: teamMember_2,
        },
      );

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status);
      assert.isTrue(LCTxReceipt_2.status);
      assert.isTrue(LCTxReceipt_3.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
      assert.isTrue(LCDeploymentTx_5.receipt.status);
      assert.isTrue(LCDeploymentTx_6.receipt.status);
    });

    it("No one can deploy LCs with unlockTime < one year from deployment, directly or through factory", async () => {
      const justUnderOneYear = oneYearFromSystemDeployment.sub(toBN("1"));

      // Attempt to deploy directly
      const directDeploymentTxPromise_1 = LockupContract.new(
        protocolToken.address,
        A,
        justUnderOneYear,
        { from: D },
      );
      const directDeploymentTxPromise_2 = LockupContract.new(protocolToken.address, B, "43200", {
        from: multisig,
      });
      const directDeploymentTxPromise_3 = LockupContract.new(protocolToken.address, E, "354534", {
        from: E,
      });

      // Attempt to deploy through factory
      const factoryDploymentTxPromise_1 = lockupContractFactory.deployLockupContract(
        A,
        justUnderOneYear,
        { from: E },
      );
      const factoryDploymentTxPromise_2 = lockupContractFactory.deployLockupContract(C, "43200", {
        from: multisig,
      });
      const factoryDploymentTxPromise_3 = lockupContractFactory.deployLockupContract(D, "354534", {
        from: teamMember_2,
      });

      // Check deployments reverted
      await assertRevert(
        directDeploymentTxPromise_1,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
      await assertRevert(
        directDeploymentTxPromise_2,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
      await assertRevert(
        directDeploymentTxPromise_3,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
      await assertRevert(
        factoryDploymentTxPromise_1,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
      await assertRevert(
        factoryDploymentTxPromise_2,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
      await assertRevert(
        factoryDploymentTxPromise_3,
        "LockupContract: unlock time must be at least one year after system deployment",
      );
    });

    describe("Withdrawal Attempts on LCs before unlockTime has passed ", async (accounts) => {
      it("Multisig can't withdraw from a funded LC they deployed for another beneficiary through the Factory before the unlockTime", async () => {
        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_T1.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        // Multisig attempts withdrawal from LC they deployed through the Factory
        try {
          const withdrawalAttempt = await LC_T1.withdrawProtocolToken({ from: multisig });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      });

      it("Multisig can't withdraw from a funded LC that someone else deployed before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          {
            from: D,
          },
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        //ProtocolToken multisig fund the newly deployed LCs
        await protocolToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        // Multisig attempts withdrawal from LCs
        try {
          const withdrawalAttempt_B = await LC_B.withdrawProtocolToken({ from: multisig });
          assert.isFalse(withdrawalAttempt_B.receipt.status);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      });

      it("Beneficiary can't withdraw from their funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          {
            from: D,
          },
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        // Multisig funds contracts
        await protocolToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        /* Beneficiaries of all LCS - team, investor, and newly created LCs - 
        attempt to withdraw from their respective funded contracts */
        const LCs = [LC_T1, LC_T2, LC_T3, LC_I1, LC_I2, LC_T3, LC_B];

        for (LC of LCs) {
          try {
            const beneficiary = await LC.beneficiary();
            const withdrawalAttempt = await LC.withdrawProtocolToken({ from: beneficiary });
            assert.isFalse(withdrawalAttempt.receipt.status);
          } catch (error) {
            assert.include(error.message, "LockupContract: The lockup duration must have passed");
          }
        }
      });

      it("No one can withdraw from a beneficiary's funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          {
            from: D,
          },
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        // Multisig funds contract
        await protocolToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        const variousEOAs = [teamMember_2, deployer, multisig, investor_1, A, C, D, E];

        // Several EOAs attempt to withdraw from LC deployed by D
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_B.withdrawProtocolToken({ from: account });
            assert.isFalse(withdrawalAttempt.receipt.status);
          } catch (error) {
            assert.include(error.message, "LockupContract: caller is not the beneficiary");
          }
        }

        // Several EOAs attempt to withdraw from LC_T1 deployed by ProtocolToken deployer
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_T1.withdrawProtocolToken({ from: account });
            assert.isFalse(withdrawalAttempt.receipt.status);
          } catch (error) {
            assert.include(error.message, "LockupContract: caller is not the beneficiary");
          }
        }
      });
    });
  });
});
