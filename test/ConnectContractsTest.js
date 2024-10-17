const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;

contract(
  "Deployment script - Sets correct contract addresses dependencies after deployment",
  async (accounts) => {
    const [owner] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

    let priceFeed;
    let debtToken;
    let sortedTroves;
    let troveManager;
    let activePool;
    let stabilityPool;
    let defaultPool;
    let functionCaller;
    let borrowerOperations;
    let protocolTokenStaking;
    let protocolToken;
    let communityIssuance;
    let lockupContractFactory;

    before(async () => {
      const coreContracts = await deploymentHelper.deployLiquityCore(
        th.GAS_COMPENSATION,
        th.MIN_NET_DEBT,
      );
      const protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig,
      );

      priceFeed = coreContracts.priceFeedTestnet;
      debtToken = coreContracts.debtToken;
      sortedTroves = coreContracts.sortedTroves;
      troveManager = coreContracts.troveManager;
      activePool = coreContracts.activePool;
      stabilityPool = coreContracts.stabilityPool;
      defaultPool = coreContracts.defaultPool;
      functionCaller = coreContracts.functionCaller;
      borrowerOperations = coreContracts.borrowerOperations;

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

    // Sets CI in ProtocolToken
    it("Sets the correct CommunityIssuance address in ProtocolToken", async () => {
      const communityIssuanceAddress = communityIssuance.address;

      const recordedcommunityIssuanceAddress = await protocolToken.communityIssuanceAddress();
      assert.equal(communityIssuanceAddress, recordedcommunityIssuanceAddress);
    });

    // Sets ProtocolTokenStaking in ProtocolToken
    it("Sets the correct ProtocolTokenStaking address in ProtocolToken", async () => {
      const protocolTokenStakingAddress = protocolTokenStaking.address;

      const recordedProtocolTokenStakingAddress = await protocolToken.protocolTokenStakingAddress();
      assert.equal(protocolTokenStakingAddress, recordedProtocolTokenStakingAddress);
    });

    // Sets LCF in ProtocolToken
    it("Sets the correct LockupContractFactory address in ProtocolToken", async () => {
      const LCFAddress = lockupContractFactory.address;

      const recordedLCFAddress = await protocolToken.lockupContractFactory();
      assert.equal(LCFAddress, recordedLCFAddress);
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
