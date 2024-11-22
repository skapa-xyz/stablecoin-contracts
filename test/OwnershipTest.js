const deploymentHelper = require("../utils/deploymentHelpers.js");
const { TestHelper: th, MoneyValues: mv } = require("../utils/testHelpers.js");

contract("All functions with onlyOwner modifier", async () => {
  let owner, alice, bob;

  let contracts;
  let debtToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;

  let protocolTokenStaking;
  let communityIssuance;
  let protocolToken;
  let lockupContractFactory;

  before(async () => {
    await hre.network.provider.send("hardhat_reset");

    [owner, alice, bob] = await ethers.getSigners();

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
      owner.address,
      cpContracts,
    );

    debtToken = contracts.debtToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    communityIssuance = protocolTokenContracts.communityIssuance;
    protocolToken = protocolTokenContracts.protocolToken;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;
  });

  const testInitialize = async (contract, numberOfAddresses) => {
    const protocolBaseFactory = await ethers.getContractFactory("ProtocolBase");
    const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    const params = Array(numberOfAddresses).fill(dumbContract.address);

    // fails if called
    await th.assertRevert(contract.connect(owner).initialize(...params));
  };

  describe("TroveManager", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(troveManager, 11);
    });
  });

  describe("BorrowerOperations", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(borrowerOperations, 10);
    });
  });

  describe("DefaultPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(defaultPool, 2);
    });
  });

  describe("StabilityPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(stabilityPool, 7);
    });
  });

  describe("ActivePool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(activePool, 4);
    });
  });

  describe("SortedTroves", async () => {
    it("setParams(): reverts when called", async () => {
      const protocolBaseFactory = await ethers.getContractFactory("ProtocolBase");
      const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
      // const dumbContract = await ProtocolBase.new(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
      const params = [10000001, dumbContract.address, dumbContract.address];

      // fails if called
      await th.assertRevert(sortedTroves.initialize(...params));
    });
  });

  describe("CommunityIssuance", async () => {
    it("initialize(): reverts when called", async () => {
      const params = [protocolToken.address, stabilityPool.address];
      // fails if called
      await th.assertRevert(communityIssuance.initialize(...params));
    });
  });

  describe("ProtocolTokenStaking", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize(protocolTokenStaking, 5);
    });
  });

  describe("LockupContractFactory", async () => {
    it("initialize(): reverts when called", async () => {
      await th.assertRevert(lockupContractFactory.initialize(protocolToken.address));
    });
  });
});
