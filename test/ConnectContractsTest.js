const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;

contract(
  "Deployment script - Sets correct contract addresses dependencies after deployment",
  async () => {
    let owner;

    let priceFeed;
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
      await hre.network.provider.send("hardhat_reset");

      [owner] = await ethers.getSigners();

      const transactionCount = await owner.getTransactionCount();
      const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
        owner.address,
        transactionCount + 1,
      );

      const coreContracts = await deploymentHelper.deployProtocolCore(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
        cpContracts,
      );
      const protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
        owner.address,
        cpContracts,
      );

      priceFeed = coreContracts.priceFeedTestnet;
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
    });

    it("Sets the correct PriceFeed address in TroveManager", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await troveManager.priceFeed();

      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    it("Sets the correct DebtToken address in TroveManager", async () => {
      const debtTokenAddress = debtToken.address;

      const recordedClvTokenAddress = await troveManager.debtToken();

      assert.equal(debtTokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct SortedTroves address in TroveManager", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress = await troveManager.sortedTroves();

      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    it("Sets the correct BorrowerOperations address in TroveManager", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await troveManager.borrowerOperationsAddress();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    // ActivePool in TroveM
    it("Sets the correct ActivePool address in TroveManager", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddresss = await troveManager.activePool();

      assert.equal(activePoolAddress, recordedActivePoolAddresss);
    });

    // DefaultPool in TroveM
    it("Sets the correct DefaultPool address in TroveManager", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddresss = await troveManager.defaultPool();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddresss);
    });

    // StabilityPool in TroveM
    it("Sets the correct StabilityPool address in TroveManager", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddresss = await troveManager.stabilityPool();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddresss);
    });

    // ProtocolToken Staking in TroveM
    it("Sets the correct ProtocolTokenStaking address in TroveManager", async () => {
      const protocolTokenStakingAddress = protocolTokenStaking.address;

      const recordedProtocolTokenStakingAddress = await troveManager.protocolTokenStaking();
      assert.equal(protocolTokenStakingAddress, recordedProtocolTokenStakingAddress);
    });

    // Active Pool

    it("Sets the correct StabilityPool address in ActivePool", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress = await activePool.stabilityPoolAddress();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });

    it("Sets the correct DefaultPool address in ActivePool", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await activePool.defaultPoolAddress();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    it("Sets the correct BorrowerOperations address in ActivePool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await activePool.borrowerOperationsAddress();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct TroveManager address in ActivePool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await activePool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Stability Pool

    it("Sets the correct ActivePool address in StabilityPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await stabilityPool.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct BorrowerOperations address in StabilityPool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await stabilityPool.borrowerOperations();

      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct DebtToken address in StabilityPool", async () => {
      const debtTokenAddress = debtToken.address;

      const recordedClvTokenAddress = await stabilityPool.debtToken();

      assert.equal(debtTokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct TroveManager address in StabilityPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await stabilityPool.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Default Pool

    it("Sets the correct TroveManager address in DefaultPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await defaultPool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    it("Sets the correct ActivePool address in DefaultPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await defaultPool.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct TroveManager address in SortedTroves", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress = await sortedTroves.borrowerOperationsAddress();
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    it("Sets the correct BorrowerOperations address in SortedTroves", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await sortedTroves.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    //--- BorrowerOperations ---

    // TroveManager in BO
    it("Sets the correct TroveManager address in BorrowerOperations", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await borrowerOperations.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // setPriceFeed in BO
    it("Sets the correct PriceFeed address in BorrowerOperations", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await borrowerOperations.priceFeed();
      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    // setSortedTroves in BO
    it("Sets the correct SortedTroves address in BorrowerOperations", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress = await borrowerOperations.sortedTroves();
      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    // setActivePool in BO
    it("Sets the correct ActivePool address in BorrowerOperations", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await borrowerOperations.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // setDefaultPool in BO
    it("Sets the correct DefaultPool address in BorrowerOperations", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await borrowerOperations.defaultPool();
      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    // ProtocolToken Staking in BO
    it("Sets the correct ProtocolTokenStaking address in BorrowerOperations", async () => {
      const protocolTokenStakingAddress = protocolTokenStaking.address;

      const recordedProtocolTokenStakingAddress =
        await borrowerOperations.protocolTokenStakingAddress();
      assert.equal(protocolTokenStakingAddress, recordedProtocolTokenStakingAddress);
    });

    // --- ProtocolToken Staking ---

    // Sets ProtocolToken in ProtocolTokenStaking
    it("Sets the correct ProtocolToken address in ProtocolTokenStaking", async () => {
      const protocolTokenAddress = protocolToken.address;

      const recordedProtocolTokenAddress = await protocolTokenStaking.protocolToken();
      assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
    });

    // Sets ActivePool in ProtocolTokenStaking
    it("Sets the correct ActivePool address in ProtocolTokenStaking", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await protocolTokenStaking.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // Sets DebtToken in ProtocolTokenStaking
    it("Sets the correct ActivePool address in ProtocolTokenStaking", async () => {
      const debtTokenAddress = debtToken.address;

      const recordedDebtTokenAddress = await protocolTokenStaking.debtToken();
      assert.equal(debtTokenAddress, recordedDebtTokenAddress);
    });

    // Sets TroveManager in ProtocolTokenStaking
    it("Sets the correct ActivePool address in ProtocolTokenStaking", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await protocolTokenStaking.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Sets BorrowerOperations in ProtocolTokenStaking
    it("Sets the correct BorrowerOperations address in ProtocolTokenStaking", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await protocolTokenStaking.borrowerOperationsAddress();
      assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress);
    });

    // ---  ProtocolToken ---

    // Sets ProtocolTokenStaking in ProtocolToken
    it("Sets the correct ProtocolTokenStaking address in ProtocolToken", async () => {
      const protocolTokenStakingAddress = protocolTokenStaking.address;

      const recordedProtocolTokenStakingAddress = await protocolToken.protocolTokenStakingAddress();
      assert.equal(protocolTokenStakingAddress, recordedProtocolTokenStakingAddress);
    });

    // --- LCF  ---

    // Sets ProtocolToken in LockupContractFactory
    it("Sets the correct ProtocolToken address in LockupContractFactory", async () => {
      const protocolTokenAddress = protocolToken.address;

      const recordedProtocolTokenAddress = await lockupContractFactory.protocolTokenAddress();
      assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
    });

    // --- CI ---

    // Sets ProtocolToken in CommunityIssuance
    it("Sets the correct ProtocolToken address in CommunityIssuance", async () => {
      const protocolTokenAddress = protocolToken.address;

      const recordedProtocolTokenAddress = await communityIssuance.protocolToken();
      assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
    });

    it("Sets the correct StabilityPool address in CommunityIssuance", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress = await communityIssuance.stabilityPoolAddress();
      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });
  },
);
