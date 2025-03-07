const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const { TestHelper: th, MoneyValues: mv } = require("../utils/testHelpers.js");

contract("All initialize functions", async () => {
  let owner, alice, bob;

  let contracts;
  let debtToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let collSurplusPool;
  let gasPool;
  let hintHelpers;

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
    collSurplusPool = contracts.collSurplusPool;
    gasPool = contracts.gasPool;
    hintHelpers = contracts.hintHelpers;

    protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
    communityIssuance = protocolTokenContracts.communityIssuance;
    protocolToken = protocolTokenContracts.protocolToken;
    lockupContractFactory = protocolTokenContracts.lockupContractFactory;
  });

  const testInitialize = async (name, contract, numberOfAddresses, params) => {
    if (!params) {
      const protocolBaseFactory = await deploymentHelper.getFactory("ProtocolBase");
      const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
      params = Array(numberOfAddresses).fill(dumbContract.address);
    }
    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(
      contract.address,
    );
    const implementationContract = await ethers.getContractAt(name, implementationAddress);

    // fails if called
    await th.assertRevert(contract.connect(owner).initialize(...params));
    await th.assertRevert(implementationContract.connect(owner).initialize(...params));
  };

  describe("ActivePool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("ActivePool", activePool, 4);
    });
  });

  describe("BorrowerOperations", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("BorrowerOperations", borrowerOperations, 10);
    });
  });

  describe("CollSurplusPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("CollSurplusPool", collSurplusPool, 3);
    });
  });

  describe("DefaultPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("DefaultPool", defaultPool, 2);
    });
  });

  describe("DebtToken", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("DebtToken", debtToken, 3);
    });
  });

  describe("GasPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("GasPool", gasPool, 0);
    });
  });

  describe("HintHelpers", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("HintHelpers", hintHelpers, 2);
    });
  });

  describe("StabilityPool", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("StabilityPool", stabilityPool, 7);
    });
  });

  describe("SortedTroves", async () => {
    it("initialize(): reverts when called", async () => {
      const protocolBaseFactory = await deploymentHelper.getFactory("ProtocolBase");
      const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
      const params = [10000001, dumbContract.address, dumbContract.address];

      await testInitialize("SortedTroves", sortedTroves, 3, params);
    });
  });

  describe("TroveManager", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("TroveManager", troveManager, 10);
    });
  });

  describe("CommunityIssuance", async () => {
    it("initialize(): reverts when called", async () => {
      const params = [protocolToken.address, stabilityPool.address];
      await testInitialize("CommunityIssuance", communityIssuance, 2, params);
    });
  });

  describe("ProtocolTokenStaking", async () => {
    it("initialize(): reverts when called", async () => {
      await testInitialize("ProtocolTokenStaking", protocolTokenStaking, 5);
    });
  });

  describe("LockupContractFactory", async () => {
    it("initialize(): reverts when called", async () => {
      testInitialize("LockupContractFactory", lockupContractFactory, 1, [protocolToken.address]);
    });
  });
});
