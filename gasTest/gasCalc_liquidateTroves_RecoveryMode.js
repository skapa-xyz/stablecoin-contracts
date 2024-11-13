/* Script that logs gas costs for protocol operations under various conditions. 

  Note: uses Mocha testing structure, but the purpose of each test is simply to print gas costs.

  'asserts' are only used to confirm the setup conditions.
*/
const fs = require("fs");

const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const timeValues = testHelpers.TimeValues;
const _100pct = th._100pct;

const ZERO_ADDRESS = th.ZERO_ADDRESS;
const toBN = th.toBN;

contract("Gas cost tests", async () => {
  let signers;
  let owner;
  let bountyAddress;
  let lpRewardsAddress;
  let multisig;

  let priceFeed;

  let sortedTroves;
  let troveManager;
  let stabilityPool;
  let borrowerOperations;

  let contracts;
  let data = [];

  before(async () => {
    signers = await ethers.getSigners();

    [owner] = signers;
    [bountyAddress, lpRewardsAddress, multisig] = signers.slice(997, 1000);
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
    const protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
      bountyAddress.address,
      lpRewardsAddress.address,
      multisig.address,
      cpContracts,
    );

    priceFeed = contracts.priceFeedTestnet;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    stabilityPool = contracts.stabilityPool;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;
  });

  // --- liquidateTroves RECOVERY MODE - pure redistribution ---

  // 1 trove
  it("", async () => {
    const message = "liquidateTroves(). n = 1. Pure redistribution, Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //1 accts open Trove with 1 ether and withdraw 100 token
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));
    const price = await priceFeed.getPrice();

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 2. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //2 accts open Trove with 1 ether and withdraw 100 token
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 3. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //3 accts open Trove with 1 ether and withdraw 100 token
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 5. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //5 accts open Trove with 1 ether and withdraw 100 token
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 10. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  //20 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 20. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 90 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //20 accts open Trove with 1 ether and withdraw 100 token
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 30. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 90 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 40. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 90 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //40 accts open Trove with 1 ether and withdraw 100 token
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(60, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulters' troves have been closed
    for (const signer of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 45. Pure redistribution. Recovery Mode";
    // 10 accts each open Trove
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(90000, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //45 accts open Trove
    const _45_Defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters are active
    for (const signer of _45_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens Trove
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(9500, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(45);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (const signer of _45_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- liquidate Troves --- RECOVERY MODE --- Full offset, NO pending distribution rewards ----

  // 1 trove
  it("", async () => {
    const message =
      "liquidateTroves(). n = 1. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //1 acct opens Trove with 1 ether and withdraw 100 token
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _1_Defaulter) {
      console.log(`ICR: ${await troveManager.getCurrentICR(signer, price)}`);
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 2. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //2 acct opens Trove with 1 ether and withdraw 100 token
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _2_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 3. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //3 accts open Trove with 1 ether and withdraw 100 token
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _3_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 5. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //5 accts open Trove with 1 ether and withdraw 100 token
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _5_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 10. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _10_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 20 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 20. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _20_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 30. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _30_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 40. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //40 accts open Trove with 1 ether and withdraw 100 token
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _40_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 45. All fully offset with Stability Pool. No pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(90000, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    //45 accts open Trove with 1 ether and withdraw 100 token
    const _45_Defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters are active
    for (const signer of _45_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _45_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(45);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _45_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- liquidate Troves --- RECOVERY MODE --- Full offset, HAS pending distribution rewards ----

  // 1 trove
  it("", async () => {
    const message =
      "liquidateTroves(). n = 1. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //1 acct opens Trove with 1 ether and withdraw 100 token
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _1_Defaulter) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _1_Defaulter) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // // Check Troves are closed
    for (const signer of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 2. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //2 accts open Trove with 1 ether and withdraw 100 token
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _2_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _2_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 3. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //3 accts open Trove with 1 ether and withdraw 100 token
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _3_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _3_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 5. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //5 accts open Trove with 1 ether and withdraw 100 token
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _5_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _5_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 10. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _10_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _10_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 20 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 20. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //20 accts open Trove with 1 ether and withdraw 100 token
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _20_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _20_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 30. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _30_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _30_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 40. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove with 10 ether, withdraw 900 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(900, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //40 accts open Trove with 1 ether and withdraw 100 token
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(60, 18));

    // Check all defaulters are active
    for (const signer of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _40_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(120, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _40_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 45. All fully offset with Stability Pool. Has pending distribution rewards. In Recovery Mode";
    // 10 accts each open Trove
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(90000, 18),
    );
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    //45 accts opens
    const _45_Defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters are active
    for (const signer of _45_Defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 opens
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(11000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Check all defaulters have pending rewards
    for (const signer of _45_Defaulters) {
      assert.isTrue(await troveManager.hasPendingRewards(signer.address));
    }

    // Whale opens trove and fills SP with 1 billion token
    const whale = signers[999];
    await borrowerOperations
      .connect(whale)
      .openTrove(_100pct, dec(9, 28), whale.address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(whale).provideToSP(dec(9, 28), ZERO_ADDRESS);

    // Check SP has 9e28 token
    const debtTokenInSP = (await stabilityPool.getTotalDebtTokenDeposits()).toString();
    assert.equal(debtTokenInSP, dec(9, 28));

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));
    const price = await priceFeed.getPrice();

    // Check Recovery Mode is true
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check defaulter ICRs are all between 100% and 110%
    for (const signer of _45_Defaulters) {
      assert.isTrue(await th.ICRbetween100and110(signer, troveManager, price));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(45);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Recovery Mode is true after liquidations
    assert.isTrue(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Check Troves are closed
    for (const signer of _45_Defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    // Check initial troves with starting 10E/90token, and whale's trove, are still open
    for (const signer of signers.slice(101, 111)) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }
    assert.isTrue(await sortedTroves.contains(whale.address));

    //Check token in SP has decreased but is still > 0
    const debtTokenInSP_After = await stabilityPool.getTotalDebtTokenDeposits();
    assert.isTrue(debtTokenInSP_After.lt(toBN(dec(9, 28))));
    assert.isTrue(debtTokenInSP_After.gt(toBN("0")));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- BatchLiquidateTroves ---

  // --- Pure redistribution, no offset. WITH pending distribution rewards ---

  // 10 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 10. Pure redistribution. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraws token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    const _10_defaulters = signers.slice(1, 11);
    // --- Accounts to be liquidated in the test tx ---
    await th.openTrove_allAccounts(_10_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // Check all defaulters active
    for (const signer of _10_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_10_defaulters.map(({ address }) => address));

    // Check all defaulters liquidated
    for (const signer of _10_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 40. Pure redistribution. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(100, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _40_defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // Check all defaulters active
    for (const signer of _40_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_40_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _40_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 45. Pure redistribution. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _45_defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // check all defaulters active
    for (const signer of _45_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_45_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _45_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 50 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 50. Pure redistribution. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(100, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _50_defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // check all defaulters active
    for (const signer of _50_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_50_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _50_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- batchLiquidateTroves - pure offset with Stability Pool ---

  // 10 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 10. All troves fully offset. Have pending distribution rewards";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    const _10_defaulters = signers.slice(1, 11);
    // --- Accounts to be liquidated in the test tx ---
    await th.openTrove_allAccounts(_10_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // Check all defaulters active
    for (const signer of _10_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_10_defaulters.map(({ address }) => address));

    // Check all defaulters liquidated
    for (const signer of _10_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 40. All troves fully offset. Have pending distribution rewards";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(100, "ether"),
      dec(10000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _40_defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // Check all defaulters active
    for (const signer of _40_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_40_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _40_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 45. All troves fully offset. Have pending distribution rewards";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(100, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _45_defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // check all defaulters active
    for (const signer of _45_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_45_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _45_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 50 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). n = 50. All troves fully offset. Have pending distribution rewards";
    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(100, "ether"),
      dec(13000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(13000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    // --- Accounts to be liquidated in the test tx ---
    const _50_defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_defaulters, contracts, dec(100, "ether"), dec(13000, 18));

    // check all defaulters active
    for (const signer of _50_defaulters) {
      assert.isTrue(await sortedTroves.contains(signer.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    // Price drops, signer[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_50_defaulters.map(({ address }) => address));

    // check all defaulters liquidated
    for (const signer of _50_defaulters) {
      assert.isFalse(await sortedTroves.contains(signer.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("Export test data", async () => {
    fs.writeFile("gasTest/outputs/liquidateTrovesGasData.csv", data, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log(
          "LiquidateTroves() gas test data written to gasTest/outputs/liquidateTrovesGasData.csv",
        );
      }
    });
  });
});
