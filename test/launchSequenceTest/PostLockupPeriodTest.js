const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const { dec, toBN } = th;

contract("After the initial lockup period has passed", async () => {
  let deployer,
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
    J;
  let bountyAddress, lpRewardsAddress, multisig;

  const SECONDS_IN_ONE_DAY = timeValues.SECONDS_IN_ONE_DAY;
  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_ONE_YEAR = timeValues.SECONDS_IN_ONE_YEAR;

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

  const teamMemberMonthlyVesting_1 = dec(1, 23);
  const teamMemberMonthlyVesting_2 = dec(2, 23);
  const teamMemberMonthlyVesting_3 = dec(3, 23);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;
  let justOverOneYearFromSystemDeployment;
  let _18monthsFromSystemDeployment;

  before(async () => {
    const signers = await ethers.getSigners();

    [
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
      J,
    ] = signers;
    [bountyAddress, lpRewardsAddress, multisig] = signers.slice(997, 1000);
  });

  beforeEach(async () => {
    // Deploy all contracts from the first account
    await hre.network.provider.send("hardhat_reset");

    const transactionCount = await deployer.getTransactionCount();
    const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
      deployer.address,
      transactionCount + 1,
    );
    coreContracts = await deploymentHelper.deployProtocolCore(
      th.GAS_COMPENSATION,
      th.MIN_NET_DEBT,
      cpContracts,
    );
    protocolTokenContracts = await deploymentHelper.deployProtocolTokenTesterContracts(
      bountyAddress.address,
      lpRewardsAddress.address,
      multisig.address,
      cpContracts,
    );

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
      protocolToken,
      web3,
      timeValues.SECONDS_IN_ONE_YEAR,
    );
    justOverOneYearFromSystemDeployment = oneYearFromSystemDeployment.add(toBN("1"));

    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN("2"));
    const secondsIn18Months = toBN(timeValues.SECONDS_IN_ONE_MONTH).mul(toBN("18"));
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      protocolToken,
      web3,
      secondsInTwoYears,
    );
    _18monthsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      protocolToken,
      web3,
      secondsIn18Months,
    );

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(teamMember_1.address, oneYearFromSystemDeployment);
    const deployedLCtx_T2 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(teamMember_2.address, oneYearFromSystemDeployment);
    const deployedLCtx_T3 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(teamMember_3.address, oneYearFromSystemDeployment);

    const deployedLCtx_I1 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(investor_1.address, oneYearFromSystemDeployment);
    const deployedLCtx_I2 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(investor_2.address, oneYearFromSystemDeployment);
    const deployedLCtx_I3 = await lockupContractFactory
      .connect(deployer)
      .deployLockupContract(investor_3.address, oneYearFromSystemDeployment);

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1);
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2);
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3);

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1);
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2);
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3);

    // Multisig transfers initial ProtocolToken entitlements to LCs
    await protocolToken.connect(multisig).transfer(LC_T1.address, teamMemberInitialEntitlement_1);
    await protocolToken.connect(multisig).transfer(LC_T2.address, teamMemberInitialEntitlement_2);
    await protocolToken.connect(multisig).transfer(LC_T3.address, teamMemberInitialEntitlement_3);

    await protocolToken.connect(multisig).transfer(LC_I1.address, investorInitialEntitlement_1);
    await protocolToken.connect(multisig).transfer(LC_I2.address, investorInitialEntitlement_2);
    await protocolToken.connect(multisig).transfer(LC_I3.address, investorInitialEntitlement_3);

    const systemDeploymentTime = await protocolToken.getDeploymentStartTime();

    // Every thirty days, mutlsig transfers vesting amounts to team members
    for (i = 0; i < 12; i++) {
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      await protocolToken.connect(multisig).transfer(LC_T1.address, teamMemberMonthlyVesting_1);
      await protocolToken.connect(multisig).transfer(LC_T2.address, teamMemberMonthlyVesting_2);
      await protocolToken.connect(multisig).transfer(LC_T3.address, teamMemberMonthlyVesting_3);
    }

    // After Since only 360 days have passed, fast forward 5 more days, until LCs unlock
    await th.fastForwardTime(SECONDS_IN_ONE_DAY * 5, web3.currentProvider);

    const endTime = toBN(await th.getLatestBlockTimestamp(web3));

    const timePassed = endTime.sub(systemDeploymentTime);
    // Confirm that just over one year has passed -  not more than 1000 seconds
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).lt(toBN("1000")));
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).gt(toBN("0")));
  });

  describe("Deploying new LCs", async () => {
    it("ProtocolToken Deployer can deploy new LCs", async () => {
      // ProtocolToken deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory
        .connect(deployer)
        .deployLockupContract(A.address, justOverOneYearFromSystemDeployment);
      const LCDeploymentTx_B = await lockupContractFactory
        .connect(deployer)
        .deployLockupContract(B.address, oneYearFromSystemDeployment);
      const LCDeploymentTx_C = await lockupContractFactory
        .connect(deployer)
        .deployLockupContract(C.address, "9595995999999900000023423234");

      const receipt_A = await LCDeploymentTx_A.wait();
      const receipt_B = await LCDeploymentTx_B.wait();
      const receipt_C = await LCDeploymentTx_C.wait();

      assert.equal(receipt_A.status, 1);
      assert.equal(receipt_B.status, 1);
      assert.equal(receipt_C.status, 1);
    });

    it("Anyone can deploy new LCs", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory
        .connect(teamMember_1)
        .deployLockupContract(A.address, justOverOneYearFromSystemDeployment);
      const LCDeploymentTx_2 = await lockupContractFactory
        .connect(investor_2)
        .deployLockupContract(C.address, oneYearFromSystemDeployment);
      const LCDeploymentTx_3 = await lockupContractFactory
        .connect(A)
        .deployLockupContract(deployer.address, "9595995999999900000023423234");

      const receipt_1 = await LCDeploymentTx_1.wait();
      const receipt_2 = await LCDeploymentTx_2.wait();
      const receipt_3 = await LCDeploymentTx_3.wait();

      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
      assert.equal(receipt_3.status, 1);
    });

    it("Anyone can deploy new LCs with unlockTime in the past", async () => {
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory
        .connect(teamMember_1)
        .deployLockupContract(A.address, justOverOneYearFromSystemDeployment);
      const LCDeploymentTx_2 = await lockupContractFactory
        .connect(E)
        .deployLockupContract(B.address, oneYearFromSystemDeployment);
      const LCDeploymentTx_3 = await lockupContractFactory
        .connect(multisig)
        .deployLockupContract(C.address, _18monthsFromSystemDeployment);

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);
      const LC_3 = await th.getLCFromDeploymentTx(LCDeploymentTx_3);

      const receipt_1 = await LCDeploymentTx_1.wait();
      const receipt_2 = await LCDeploymentTx_2.wait();
      const receipt_3 = await LCDeploymentTx_3.wait();

      // Check deployments succeeded
      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
      assert.equal(receipt_3.status, 1);

      // Check LCs have unlockTimes in the past
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();
      unlockTime_3 = await LC_3.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.lt(currentTime));
      assert.isTrue(unlockTime_2.lt(currentTime));
      assert.isTrue(unlockTime_3.lt(currentTime));
    });

    it("Anyone can deploy new LCs with unlockTime in the future", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory
        .connect(teamMember_1)
        .deployLockupContract(A.address, twoYearsFromSystemDeployment);
      const LCDeploymentTx_2 = await lockupContractFactory
        .connect(E)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);

      const receipt_1 = await LCDeploymentTx_1.wait();
      const receipt_2 = await LCDeploymentTx_2.wait();

      // Check deployments succeeded
      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);

      // Check LCs have unlockTimes in the future
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.gt(currentTime));
      assert.isTrue(unlockTime_2.gt(currentTime));
    });
  });

  describe("Beneficiary withdrawal from initial LC", async () => {
    it("A beneficiary can withdraw their full entitlement from their LC", async () => {
      // Check ProtocolToken balances of investors' LCs are equal to their initial entitlements
      assert.equal(await protocolToken.balanceOf(LC_I1.address), investorInitialEntitlement_1);
      assert.equal(await protocolToken.balanceOf(LC_I2.address), investorInitialEntitlement_2);
      assert.equal(await protocolToken.balanceOf(LC_I3.address), investorInitialEntitlement_3);

      // Check ProtocolToken balances of investors are 0
      assert.equal(await protocolToken.balanceOf(investor_1.address), "0");
      assert.equal(await protocolToken.balanceOf(investor_2.address), "0");
      assert.equal(await protocolToken.balanceOf(investor_3.address), "0");

      // All investors withdraw from their respective LCs
      await LC_I1.connect(investor_1).withdrawProtocolToken();
      await LC_I2.connect(investor_2).withdrawProtocolToken();
      await LC_I3.connect(investor_3).withdrawProtocolToken();

      // Check ProtocolToken balances of investors now equal their entitlements
      assert.equal(await protocolToken.balanceOf(investor_1.address), investorInitialEntitlement_1);
      assert.equal(await protocolToken.balanceOf(investor_2.address), investorInitialEntitlement_2);
      assert.equal(await protocolToken.balanceOf(investor_3.address), investorInitialEntitlement_3);

      // Check ProtocolToken balances of investors' LCs are now 0
      assert.equal(await protocolToken.balanceOf(LC_I1.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_I2.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_I3.address), "0");
    });

    it("A beneficiary on a vesting schedule can withdraw their total vested amount from their LC", async () => {
      // Get ProtocolToken balances of LCs for beneficiaries (team members) on vesting schedules
      const protocolTokenBalanceOfLC_T1_Before = await protocolToken.balanceOf(LC_T1.address);
      const protocolTokenBalanceOfLC_T2_Before = await protocolToken.balanceOf(LC_T2.address);
      const protocolTokenBalanceOfLC_T3_Before = await protocolToken.balanceOf(LC_T3.address);

      // Check ProtocolToken balances of vesting beneficiaries' LCs are greater than their initial entitlements
      assert.isTrue(protocolTokenBalanceOfLC_T1_Before.gt(th.toBN(teamMemberInitialEntitlement_1)));
      assert.isTrue(protocolTokenBalanceOfLC_T2_Before.gt(th.toBN(teamMemberInitialEntitlement_2)));
      assert.isTrue(protocolTokenBalanceOfLC_T3_Before.gt(th.toBN(teamMemberInitialEntitlement_3)));

      // Check ProtocolToken balances of beneficiaries are 0
      assert.equal(await protocolToken.balanceOf(teamMember_1.address), "0");
      assert.equal(await protocolToken.balanceOf(teamMember_2.address), "0");
      assert.equal(await protocolToken.balanceOf(teamMember_3.address), "0");

      // All beneficiaries withdraw from their respective LCs
      await LC_T1.connect(teamMember_1).withdrawProtocolToken();
      await LC_T2.connect(teamMember_2).withdrawProtocolToken();
      await LC_T3.connect(teamMember_3).withdrawProtocolToken();

      // Check beneficiaries' ProtocolToken balances now equal their accumulated vested entitlements
      assert.isTrue(
        (await protocolToken.balanceOf(teamMember_1.address)).eq(
          protocolTokenBalanceOfLC_T1_Before,
        ),
      );
      assert.isTrue(
        (await protocolToken.balanceOf(teamMember_2.address)).eq(
          protocolTokenBalanceOfLC_T2_Before,
        ),
      );
      assert.isTrue(
        (await protocolToken.balanceOf(teamMember_3.address)).eq(
          protocolTokenBalanceOfLC_T3_Before,
        ),
      );

      // Check ProtocolToken balances of beneficiaries' LCs are now 0
      assert.equal(await protocolToken.balanceOf(LC_T1.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_T2.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_T3.address), "0");
    });

    it("Beneficiaries can withdraw full ProtocolToken balance of LC if it has increased since lockup period ended", async () => {
      // Check ProtocolToken balances of investors' LCs are equal to their initial entitlements
      assert.equal(await protocolToken.balanceOf(LC_I1.address), investorInitialEntitlement_1);
      assert.equal(await protocolToken.balanceOf(LC_I2.address), investorInitialEntitlement_2);
      assert.equal(await protocolToken.balanceOf(LC_I3.address), investorInitialEntitlement_3);

      // Check ProtocolToken balances of investors are 0
      assert.equal(await protocolToken.balanceOf(investor_1.address), "0");
      assert.equal(await protocolToken.balanceOf(investor_2.address), "0");
      assert.equal(await protocolToken.balanceOf(investor_3.address), "0");

      // ProtocolToken multisig sends extra ProtocolToken to investor LCs
      await protocolToken.connect(multisig).transfer(LC_I1.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_I2.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_I3.address, dec(1, 24));

      // 1 month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ProtocolToken multisig again sends extra ProtocolToken to investor LCs
      await protocolToken.connect(multisig).transfer(LC_I1.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_I2.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_I3.address, dec(1, 24));

      // Get ProtocolToken balances of LCs for investors
      const protocolTokenBalanceOfLC_I1_Before = await protocolToken.balanceOf(LC_I1.address);
      const protocolTokenBalanceOfLC_I2_Before = await protocolToken.balanceOf(LC_I2.address);
      const protocolTokenBalanceOfLC_I3_Before = await protocolToken.balanceOf(LC_I3.address);

      // Check ProtocolToken balances of investors' LCs are greater than their initial entitlements
      assert.isTrue(protocolTokenBalanceOfLC_I1_Before.gt(th.toBN(investorInitialEntitlement_1)));
      assert.isTrue(protocolTokenBalanceOfLC_I2_Before.gt(th.toBN(investorInitialEntitlement_2)));
      assert.isTrue(protocolTokenBalanceOfLC_I3_Before.gt(th.toBN(investorInitialEntitlement_3)));

      // All investors withdraw from their respective LCs
      await LC_I1.connect(investor_1).withdrawProtocolToken();
      await LC_I2.connect(investor_2).withdrawProtocolToken();
      await LC_I3.connect(investor_3).withdrawProtocolToken();

      // Check ProtocolToken balances of investors now equal their LC balances prior to withdrawal
      assert.isTrue(
        (await protocolToken.balanceOf(investor_1.address)).eq(protocolTokenBalanceOfLC_I1_Before),
      );
      assert.isTrue(
        (await protocolToken.balanceOf(investor_2.address)).eq(protocolTokenBalanceOfLC_I2_Before),
      );
      assert.isTrue(
        (await protocolToken.balanceOf(investor_3.address)).eq(protocolTokenBalanceOfLC_I3_Before),
      );

      // Check ProtocolToken balances of investors' LCs are now 0
      assert.equal(await protocolToken.balanceOf(LC_I1.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_I2.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_I3.address), "0");
    });
  });

  describe("Withdrawal attempts from LCs by non-beneficiaries", async () => {
    it("ProtocolToken Multisig can't withdraw from a LC they deployed through the Factory", async () => {
      try {
        const withdrawalAttempt = await LC_T1.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("ProtocolToken Multisig can't withdraw from a LC that someone else deployed", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, oneYearFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ProtocolToken multisig fund the newly deployed LCs
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      // ProtocolToken multisig attempts withdrawal from LC
      try {
        const withdrawalAttempt_B = await LC_B.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt_B.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Non-beneficiaries cannot withdraw from a LC", async () => {
      const variousEOAs = [
        teamMember_1,
        teamMember_3,
        deployer,
        investor_1,
        investor_2,
        investor_3,
        A,
        B,
        C,
        D,
        E,
      ];

      // Several EOAs attempt to withdraw from the LC that has teamMember_2 as beneficiary
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_T2.connect(account).withdrawProtocolToken();
          const receipt = await withdrawalAttempt.wait();
          assert.equal(receipt.status, 0);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });

  describe("Transferring ProtocolToken", async () => {
    it("ProtocolToken multisig can transfer ProtocolToken to LCs they deployed", async () => {
      const initialProtocolTokenBalanceOfLC_T1 = await protocolToken.balanceOf(LC_T1.address);
      const initialProtocolTokenBalanceOfLC_T2 = await protocolToken.balanceOf(LC_T2.address);
      const initialProtocolTokenBalanceOfLC_T3 = await protocolToken.balanceOf(LC_T3.address);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ProtocolToken multisig transfers vesting amount
      await protocolToken.connect(multisig).transfer(LC_T1.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_T2.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_T3.address, dec(1, 24));

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

      // ProtocolToken multisig transfers vesting amount
      await protocolToken.connect(multisig).transfer(LC_T1.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_T2.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_T3.address, dec(1, 24));

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

    it("ProtocolToken multisig can transfer tokens to LCs deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract ith themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory
        .connect(A)
        .deployLockupContract(A.address, oneYearFromSystemDeployment);
      const deployedLCtx_B = await lockupContractFactory
        .connect(B)
        .deployLockupContract(B.address, justOverOneYearFromSystemDeployment);
      const deployedLCtx_C = await lockupContractFactory
        .connect(C)
        .deployLockupContract(C.address, twoYearsFromSystemDeployment);

      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await protocolToken.balanceOf(LC_A.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_B.address), "0");
      assert.equal(await protocolToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // ProtocolToken multisig transfers ProtocolToken to LCs deployed by other accounts
      await protocolToken.connect(multisig).transfer(LC_A.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 24));
      await protocolToken.connect(multisig).transfer(LC_C.address, dec(3, 24));

      // Check balances of LCs have increased
      assert.equal(await protocolToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("ProtocolToken multisig can transfer ProtocolToken directly to any externally owned account", async () => {
      // Check ProtocolToken balances of EOAs
      assert.equal(await protocolToken.balanceOf(A.address), "0");
      assert.equal(await protocolToken.balanceOf(B.address), "0");
      assert.equal(await protocolToken.balanceOf(C.address), "0");

      // ProtocolToken multisig transfers ProtocolToken to EOAs
      const txA = await protocolToken.connect(multisig).transfer(A.address, dec(1, 24));
      const txB = await protocolToken.connect(multisig).transfer(B.address, dec(2, 24));
      const txC = await protocolToken.connect(multisig).transfer(C.address, dec(3, 24));

      // Check new balances have increased by correct amount
      assert.equal(await protocolToken.balanceOf(A.address), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(B.address), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(C.address), dec(3, 24));
    });

    it("Anyone can transfer ProtocolToken to LCs deployed by anyone", async () => {
      // Start D, E, F with some ProtocolToken
      await protocolToken.connect(multisig).transfer(D.address, dec(1, 24));
      await protocolToken.connect(multisig).transfer(E.address, dec(2, 24));
      await protocolToken.connect(multisig).transfer(F.address, dec(3, 24));

      // H, I, J deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory
        .connect(H)
        .deployLockupContract(A.address, oneYearFromSystemDeployment);
      const deployedLCtx_B = await lockupContractFactory
        .connect(I)
        .deployLockupContract(B.address, justOverOneYearFromSystemDeployment);
      const deployedLCtx_C = await lockupContractFactory
        .connect(J)
        .deployLockupContract(C.address, twoYearsFromSystemDeployment);

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A);
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B);
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await protocolToken.balanceOf(LCAddress_A), "0");
      assert.equal(await protocolToken.balanceOf(LCAddress_B), "0");
      assert.equal(await protocolToken.balanceOf(LCAddress_C), "0");

      // D, E, F transfer ProtocolToken to LCs
      await protocolToken.connect(D).transfer(LCAddress_A, dec(1, 24));
      await protocolToken.connect(E).transfer(LCAddress_B, dec(2, 24));
      await protocolToken.connect(F).transfer(LCAddress_C, dec(3, 24));

      // Check balances of LCs has increased
      assert.equal(await protocolToken.balanceOf(LCAddress_A), dec(1, 24));
      assert.equal(await protocolToken.balanceOf(LCAddress_B), dec(2, 24));
      assert.equal(await protocolToken.balanceOf(LCAddress_C), dec(3, 24));
    });

    it("Anyone can transfer to an EOA", async () => {
      // Start D, E, deployer with some ProtocolToken
      await protocolToken.unprotectedMint(D.address, dec(1, 24));
      await protocolToken.unprotectedMint(E.address, dec(2, 24));
      await protocolToken.unprotectedMint(deployer.address, dec(3, 24));
      await protocolToken.unprotectedMint(multisig.address, dec(4, 24));

      // ProtocolToken holders transfer to other EOAs
      const protocolTokenTransferTx_1 = await protocolToken
        .connect(D)
        .transfer(A.address, dec(1, 18));
      const protocolTokenTransferTx_2 = await protocolToken
        .connect(E)
        .transfer(deployer.address, dec(1, 18));
      const protocolTokenTransferTx_3 = await protocolToken
        .connect(deployer)
        .transfer(F.address, dec(1, 18));
      const protocolTokenTransferTx_4 = await protocolToken
        .connect(multisig)
        .transfer(G.address, dec(1, 18));

      const receipt_1 = await protocolTokenTransferTx_1.wait();
      const receipt_2 = await protocolTokenTransferTx_2.wait();
      const receipt_3 = await protocolTokenTransferTx_3.wait();
      const receipt_4 = await protocolTokenTransferTx_4.wait();

      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
      assert.equal(receipt_3.status, 1);
      assert.equal(receipt_4.status, 1);
    });

    it("Anyone can approve any EOA to spend their ProtocolToken", async () => {
      // EOAs approve EOAs to spend ProtocolToken
      const protocolTokenApproveTx_1 = await protocolToken
        .connect(multisig)
        .approve(A.address, dec(1, 18));
      const protocolTokenApproveTx_2 = await protocolToken
        .connect(G)
        .approve(B.address, dec(1, 18));
      const protocolTokenApproveTx_3 = await protocolToken
        .connect(F)
        .approve(deployer.address, dec(1, 18));
      const receipt_1 = await protocolTokenApproveTx_1.wait();
      const receipt_2 = await protocolTokenApproveTx_2.wait();
      const receipt_3 = await protocolTokenApproveTx_3.wait();

      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
      assert.equal(receipt_3.status, 1);
    });

    it("Anyone can be the sender in a transferFrom() call", async () => {
      // Fund B, C
      await protocolToken.unprotectedMint(B.address, dec(1, 18));
      await protocolToken.unprotectedMint(C.address, dec(1, 18));

      // LiqAG, B, C approve F, G, multisig respectively
      await protocolToken.connect(multisig).approve(F.address, dec(1, 18));
      await protocolToken.connect(B).approve(G.address, dec(1, 18));
      await protocolToken.connect(C).approve(multisig.address, dec(1, 18));

      // Approved addresses transfer from the address they're approved for
      const protocolTokenTransferFromTx_1 = await protocolToken
        .connect(F)
        .transferFrom(multisig.address, F.address, dec(1, 18));
      const protocolTokenTransferFromTx_2 = await protocolToken
        .connect(G)
        .transferFrom(B.address, multisig.address, dec(1, 18));
      const protocolTokenTransferFromTx_3 = await protocolToken
        .connect(multisig)
        .transferFrom(C.address, A.address, dec(1, 18));

      const receipt_1 = await protocolTokenTransferFromTx_1.wait();
      const receipt_2 = await protocolTokenTransferFromTx_2.wait();
      const receipt_3 = await protocolTokenTransferFromTx_3.wait();

      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
      assert.equal(receipt_3.status, 1);
    });

    it("Anyone can stake their ProtocolToken in the staking contract", async () => {
      // Fund F
      await protocolToken.unprotectedMint(F.address, dec(1, 18));

      const protocolTokenStakingTx_1 = await protocolTokenStaking.connect(F).stake(dec(1, 18));
      const protocolTokenStakingTx_2 = await protocolTokenStaking
        .connect(multisig)
        .stake(dec(1, 18));
      const receipt_1 = await protocolTokenStakingTx_1.wait();
      const receipt_2 = await protocolTokenStakingTx_2.wait();

      assert.equal(receipt_1.status, 1);
      assert.equal(receipt_2.status, 1);
    });
  });

  describe("Withdrawal Attempts on new LCs before unlockTime has passed", async () => {
    it("ProtocolToken Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, before the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // ProtocolToken multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("ProtocolToken Deployer can't withdraw from a funded LC that someone else deployed, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ProtocolToken multisig fund the newly deployed LCs
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // ProtocolToken multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt_B.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Beneficiary can't withdraw from their funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ProtocolToken multisig funds contracts
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      try {
        const beneficiaryAddr = await LC_B.beneficiary();
        const beneficiary = await ethers.getSigner(beneficiaryAddr);
        const withdrawalAttempt = await LC_B.connect(beneficiary).withdrawProtocolToken();
        const receipt = await withdrawalAttempt.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: The lockup duration must have passed");
      }
    });

    it("No one can withdraw from a beneficiary's funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ProtocolToken multisig funds contracts
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      const variousEOAs = [teamMember_2, multisig, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.connect(account).withdrawProtocolToken();
          const receipt = await withdrawalAttempt.wait();
          assert.equal(receipt.status, 0);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });

  describe("Withdrawals from new LCs after unlockTime has passed", async () => {
    it("ProtocolToken Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, after the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // ProtocolToken multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("ProtocolToken multisig can't withdraw from a funded LC when they are not the beneficiary, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //ProtocolToken multisig fund the newly deployed LC
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // ProtocolToken multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.connect(multisig).withdrawProtocolToken();
        const receipt = await withdrawalAttempt_B.wait();
        assert.equal(receipt.status, 0);
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary");
      }
    });

    it("Beneficiary can withdraw from their funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ProtocolToken multisig funds contract
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const beneficiary = await LC_B.beneficiary();
      assert.equal(beneficiary, B.address);

      // Get B's balance before
      const B_balanceBefore = await protocolToken.balanceOf(B.address);
      assert.equal(B_balanceBefore, "0");

      const withdrawalAttempt = await LC_B.connect(B).withdrawProtocolToken();
      const receipt = await withdrawalAttempt.wait();
      assert.equal(receipt.status, 1);

      // Get B's balance after
      const B_balanceAfter = await protocolToken.balanceOf(B.address);
      assert.equal(B_balanceAfter, dec(2, 18));
    });

    it("Non-beneficiaries can't withdraw from a beneficiary's funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory
        .connect(D)
        .deployLockupContract(B.address, _18monthsFromSystemDeployment);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // ProtocolToken multisig funds contracts
      await protocolToken.connect(multisig).transfer(LC_B.address, dec(2, 18));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const variousEOAs = [teamMember_2, deployer, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.connect(account).withdrawProtocolToken();
          const receipt = await withdrawalAttempt.wait();
          assert.equal(receipt.status, 0);
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary");
        }
      }
    });
  });
});
