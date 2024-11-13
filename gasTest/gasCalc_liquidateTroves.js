/* Script that logs gas costs for protocol operations under various conditions. 

  Note: uses Mocha testing structure, but the purpose of each test is simply to print gas costs.

  'asserts' are only used to confirm the setup conditions.
*/
const fs = require("fs");

const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;

const ZERO_ADDRESS = th.ZERO_ADDRESS;
const _100pct = th._100pct;

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

    functionCaller = contracts.functionCaller;

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;
  });

  // --- TESTS ---

  // --- liquidateTroves() -  pure redistributions ---

  // 1 trove
  it("", async () => {
    const message = "liquidateTroves(). n = 1. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //1 accts open Trove with 1 ether and withdraw 100 token
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidateTroves(1);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 2. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //2 accts open Trove with 1 ether and withdraw 100 token
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 110 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(110, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidateTroves(1);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 3. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //3 accts open Trove with 1 ether and withdraw 100 token
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 5. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //5 accts open Trove with 1 ether and withdraw 100 token
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 10. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  //20 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 20. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //20 accts open Trove with 1 ether and withdraw 100 token
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 30. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 40. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //40 accts open Trove with 1 ether and withdraw 100 token
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 45. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //45 accts open Trove with 1 ether and withdraw 100 token
    const _45_Defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _45_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(45);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _45_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 50 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 50. Pure redistribution";
    // 10 accts each open Trove
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(10000, 18),
    );

    //50 accts open Trove
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters are active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(10000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    const TCR = await troveManager.getTCR(await priceFeed.getPrice());
    console.log(`TCR: ${TCR}`);

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(50);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message = "liquidateTroves(). n = 60. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    //60 accts open Trove with 1 ether and withdraw 100 token
    const _60_Defaulters = signers.slice(1, 61);
    await th.openTrove_allAccounts(_60_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _60_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    const TCR = await troveManager.getTCR(await priceFeed.getPrice());
    console.log(`TCR: ${TCR}`);

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(60);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _60_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 65 troves
  it("", async () => {
    const message = "liquidateTroves(). n = 65. Pure redistribution";
    // 10 accts each open Trove with 15 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(15, "ether"),
      dec(100, 18),
    );

    //65 accts open Trove with 1 ether and withdraw 100 token
    const _65_Defaulters = signers.slice(1, 66);
    await th.openTrove_allAccounts(_65_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _65_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    const TCR = await troveManager.getTCR(await priceFeed.getPrice());
    console.log(`TCR: ${TCR}`);
    // 1451258961356880573
    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager.connect(signers[0]).liquidateTroves(65);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _65_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- liquidate Troves - all troves offset by Stability Pool - no pending distribution rewards ---

  // 1 trove
  it("", async () => {
    const message =
      "liquidateTroves(). n = 1. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //1 acct opens Trove with 1 ether and withdraw 100 token
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 2. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //2 accts open Trove with 1 ether and withdraw 100 token
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 3. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //3 accts open Trove with 1 ether and withdraw 100 token
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 5. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //5 accts open Trove with 1 ether and withdraw 100 token
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 10. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 20 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 20. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //20 accts open Trove with 1 ether and withdraw 100 token
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 30. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //30 accts open Trove with 1 ether and withdraw 100 token
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 40. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //40 accts open Trove with 1 ether and withdraw 100 token
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 50 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 50. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(10000, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //50 accts open Trove with 1 ether and withdraw 100 token
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters are active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(50);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 55 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 55. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //50 accts open Trove with 1 ether and withdraw 100 token
    const _55_Defaulters = signers.slice(1, 56);
    await th.openTrove_allAccounts(_55_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters are active
    for (account of _55_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(55);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _55_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- liquidate Troves - all troves offset by Stability Pool - Has pending distribution rewards ---

  // 1 trove
  it("", async () => {
    const message =
      "liquidateTroves(). n = 1. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 1 Accounts to be liquidated in the test tx --
    const _1_Defaulter = signers.slice(1, 2);
    await th.openTrove_allAccounts(_1_Defaulter, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _1_Defaulter) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(1);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _1_Defaulter) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 2 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 2. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 2 Accounts to be liquidated in the test tx --
    const _2_Defaulters = signers.slice(1, 3);
    await th.openTrove_allAccounts(_2_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _2_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(2);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _2_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 3 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 3. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 3 Accounts to be liquidated in the test tx --
    const _3_Defaulters = signers.slice(1, 4);
    await th.openTrove_allAccounts(_3_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _3_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(3);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _3_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 5 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 5. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 5 Accounts to be liquidated in the test tx --
    const _5_Defaulters = signers.slice(1, 6);
    await th.openTrove_allAccounts(_5_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _5_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(5);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _5_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 10 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 10. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 10 Accounts to be liquidated in the test tx --
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(10);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 20 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 20. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 20 Accounts to be liquidated in the test tx --
    const _20_Defaulters = signers.slice(1, 21);
    await th.openTrove_allAccounts(_20_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _20_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(20);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _20_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 30 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 30. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 30 Accounts to be liquidated in the test tx --
    const _30_Defaulters = signers.slice(1, 31);
    await th.openTrove_allAccounts(_30_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _30_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(30);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _30_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 40 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 40. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 40 Accounts to be liquidated in the test tx --
    const _40_Defaulters = signers.slice(1, 41);
    await th.openTrove_allAccounts(_40_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _40_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(40);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _40_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 45 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 45. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(10, "ether"),
      dec(100, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(100, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 50 Accounts to be liquidated in the test tx --
    const _45_Defaulters = signers.slice(1, 46);
    await th.openTrove_allAccounts(_45_Defaulters, contracts, dec(1, "ether"), dec(100, 18));

    // Check all defaulters active
    for (account of _45_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(45);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _45_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // 50 troves
  it("", async () => {
    const message =
      "liquidateTroves(). n = 50. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(1000, "ether"),
      dec(10000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(10000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 50 Accounts to be liquidated in the test tx --
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(100, "ether"), dec(9500, 18));

    // Check all defaulters active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager.connect(signers[0]).liquidateTroves(50);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- batchLiquidateTroves ---

  // ---batchLiquidateTroves(): Pure redistribution ---
  it("", async () => {
    const message = "batchLiquidateTroves(). batch size = 10. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters are active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(2000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(20, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_10_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message = "batchLiquidateTroves(). batch size = 50. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    //50 accts open Trove with 1 ether and withdraw 100 token
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters are active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(2000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(20, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // Price drops, defaulters' troves fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 500 is liquidated, creates pending distribution rewards for all
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_50_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check defaulters' troves have been closed
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // ---batchLiquidateTroves(): Full SP offset, no pending rewards ---

  // 10 troves
  it("", async () => {
    const message =
      "batchLiquidateTroves(). batch size = 10. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //10 accts open Trove with 1 ether and withdraw 100 token
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters are active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_10_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "batchLiquidateTroves(). batch size = 50. All fully offset with Stability Pool. No pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);

    //50 accts open Trove with 1 ether and withdraw 100 token
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters are active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Price drops, defaulters falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_50_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check Troves are closed
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // ---batchLiquidateTroves(): Full SP offset, HAS pending rewards ---

  it("", async () => {
    const message =
      "batchLiquidateTroves(). batch size = 10. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 100 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 100 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(2000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(20, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 10 Accounts to be liquidated in the test tx --
    const _10_Defaulters = signers.slice(1, 11);
    await th.openTrove_allAccounts(_10_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters active
    for (account of _10_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_10_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _10_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
    }

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "batchLiquidateTroves(). batch size = 50. All fully offset with Stability Pool. Has pending distribution rewards.";
    // 10 accts each open Trove with 10 ether, withdraw 2000 token
    await th.openTrove_allAccounts(
      signers.slice(101, 111),
      contracts,
      dec(200, "ether"),
      dec(2000, 18),
    );

    // Account 500 opens with 1 ether and withdraws 2000 token
    await borrowerOperations
      .connect(signers[500])
      .openTrove(_100pct, dec(2000, 18), signers[500].address, ZERO_ADDRESS, {
        value: dec(20, "ether"),
      });
    assert.isTrue(await sortedTroves.contains(signers[500].address));

    // --- 50 Accounts to be liquidated in the test tx --
    const _50_Defaulters = signers.slice(1, 51);
    await th.openTrove_allAccounts(_50_Defaulters, contracts, dec(20, "ether"), dec(2000, 18));

    // Check all defaulters active
    for (account of _50_Defaulters) {
      assert.isTrue(await sortedTroves.contains(account.address));
    }

    // Account 500 is liquidated, creates pending distribution rewards for all
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[500].address);
    assert.isFalse(await sortedTroves.contains(signers[500].address));
    await priceFeed.setPrice(dec(200, 18));

    // Whale opens trove and fills SP with 1 billion token
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(1, 27), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, 27),
      });
    await stabilityPool.connect(signers[999]).provideToSP(dec(1, 27), ZERO_ADDRESS);
    assert.equal(await stabilityPool.getTotalDebtTokenDeposits(), dec(1, 27));

    // Price drops, defaulters' ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Check Recovery Mode is false
    assert.isFalse(await troveManager.checkRecoveryMode(await priceFeed.getPrice()));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Liquidate troves
    const tx = await troveManager
      .connect(signers[0])
      .batchLiquidateTroves(_50_Defaulters.map(({ address }) => address));
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Check all defaulters liquidated
    for (account of _50_Defaulters) {
      assert.isFalse(await sortedTroves.contains(account.address));
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
