const SortedTroves = artifacts.require("./SortedTroves.sol");
const TroveManager = artifacts.require("./TroveManager.sol");
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol");
const DebtToken = artifacts.require("./DebtToken.sol");
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol");
const GasPool = artifacts.require("./GasPool.sol");
const CollSurplusPool = artifacts.require("./CollSurplusPool.sol");
const FunctionCaller = artifacts.require("./TestContracts/FunctionCaller.sol");
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol");
const HintHelpers = artifacts.require("./HintHelpers.sol");

const ProtocolTokenStaking = artifacts.require("./ProtocolTokenStaking.sol");
const ProtocolToken = artifacts.require("./ProtocolToken.sol");
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const Unipool = artifacts.require("./Unipool.sol");

const ProtocolTokenTester = artifacts.require("./ProtocolTokenTester.sol");
const CommunityIssuanceTester = artifacts.require("./CommunityIssuanceTester.sol");
const StabilityPoolTester = artifacts.require("./StabilityPoolTester.sol");
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol");
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol");
const ProtocolMathTester = artifacts.require("./ProtocolMathTester.sol");
const BorrowerOperationsTester = artifacts.require("./BorrowerOperationsTester.sol");
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol");
const DebtTokenTester = artifacts.require("./DebtTokenTester.sol");

// Proxy scripts
const BorrowerOperationsScript = artifacts.require("BorrowerOperationsScript");
const BorrowerWrappersScript = artifacts.require("BorrowerWrappersScript");
const TroveManagerScript = artifacts.require("TroveManagerScript");
const StabilityPoolScript = artifacts.require("StabilityPoolScript");
const TokenScript = artifacts.require("TokenScript");
const ProtocolStakingScript = artifacts.require("ProtocolStakingScript");
const {
  buildUserProxies,
  BorrowerOperationsProxy,
  BorrowerWrappersProxy,
  TroveManagerProxy,
  StabilityPoolProxy,
  SortedTrovesProxy,
  TokenProxy,
  ProtocolTokenStakingProxy,
} = require("../utils/proxyHelpers.js");

/* "Protocol core" consists of all contracts in the core protocol system.

ProtocolToken contracts consist of only those contracts related to the ProtocolToken:

-the ProtocolToken
-the Lockup factory and lockup contracts
-the ProtocolTokenStaking contract
-the CommunityIssuance contract 
*/

const ZERO_ADDRESS = "0x" + "0".repeat(40);
const maxBytes32 = "0x" + "f".repeat(64);

class DeploymentHelper {
  // static async getFactory(name) {
  //   const factory = await ethers.getContractFactory(name);
  //   return factory;
  // }

  // static async deploy(factory, params = []) {
  //   const contract = await factory.deploy(...params);
  //   // await this.deployerWallet.provider.waitForTransaction(
  //   //   contract.deployTransaction.hash,
  //   //   this.configParams.TX_CONFIRMATIONS,
  //   // );

  //   return contract;
  // }

  static async deployProtocolCore(gasCompensation, minNetDebt) {
    // Get contract factories
    // const priceFeedTestnetFactory = await this.getFactory("PriceFeedTestnet");
    // const sortedTrovesFactory = await this.getFactory("SortedTroves");
    // const troveManagerFactory = await this.getFactory("TroveManager");
    // const activePoolFactory = await this.getFactory("ActivePool");
    // const stabilityPoolFactory = await this.getFactory("StabilityPool");
    // const gasPoolFactory = await this.getFactory("GasPool");
    // const defaultPoolFactory = await this.getFactory("DefaultPool");
    // const collSurplusPoolFactory = await this.getFactory("CollSurplusPool");
    // const functionCallerFactory = await this.getFactory("FunctionCaller");
    // const borrowerOperationsFactory = await this.getFactory("BorrowerOperations");
    // const hintHelpersFactory = await this.getFactory("HintHelpers");
    // const debtTokenFactory = await this.getFactory("DebtToken");

    const priceFeedTestnet = await PriceFeedTestnet.new();
    const sortedTroves = await SortedTroves.new();
    const troveManager = await TroveManager.new(gasCompensation, minNetDebt);
    const activePool = await ActivePool.new();
    const stabilityPool = await StabilityPool.new(gasCompensation, minNetDebt);
    const gasPool = await GasPool.new();
    const defaultPool = await DefaultPool.new();
    const collSurplusPool = await CollSurplusPool.new();
    const functionCaller = await FunctionCaller.new();
    const borrowerOperations = await BorrowerOperations.new(gasCompensation, minNetDebt);
    const hintHelpers = await HintHelpers.new(gasCompensation, minNetDebt);
    const debtToken = await DebtToken.new();

    // const priceFeedTestnet = await this.deploy(priceFeedTestnetFactory);
    // const sortedTroves = await this.deploy(sortedTrovesFactory);
    // const troveManager = await this.deploy(troveManagerFactory, [gasCompensation, minNetDebt]);
    // const activePool = await this.deploy(activePoolFactory);
    // const stabilityPool = await this.deploy(stabilityPoolFactory, [gasCompensation, minNetDebt]);
    // const gasPool = await this.deploy(gasPoolFactory);
    // const defaultPool = await this.deploy(defaultPoolFactory);
    // const collSurplusPool = await this.deploy(collSurplusPoolFactory);
    // const functionCaller = await this.deploy(functionCallerFactory);
    // const borrowerOperations = await this.deploy(borrowerOperationsFactory, [
    //   gasCompensation,
    //   minNetDebt,
    // ]);
    // const hintHelpers = await this.deploy(hintHelpersFactory, [gasCompensation, minNetDebt]);
    // const debtToken = await this.deploy(debtTokenFactory, [
    //   troveManager.address,
    //   stabilityPool.address,
    //   borrowerOperations.address,
    // ]);

    DebtToken.setAsDeployed(debtToken);
    DefaultPool.setAsDeployed(defaultPool);
    PriceFeedTestnet.setAsDeployed(priceFeedTestnet);
    SortedTroves.setAsDeployed(sortedTroves);
    TroveManager.setAsDeployed(troveManager);
    ActivePool.setAsDeployed(activePool);
    StabilityPool.setAsDeployed(stabilityPool);
    GasPool.setAsDeployed(gasPool);
    CollSurplusPool.setAsDeployed(collSurplusPool);
    FunctionCaller.setAsDeployed(functionCaller);
    BorrowerOperations.setAsDeployed(borrowerOperations);
    HintHelpers.setAsDeployed(hintHelpers);

    const coreContracts = {
      priceFeedTestnet,
      debtToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      functionCaller,
      borrowerOperations,
      hintHelpers,
    };
    return coreContracts;
  }

  static async deployTesterContracts(gasCompensation, minNetDebt) {
    const testerContracts = {};

    // const priceFeedTestnetFactory = await this.getFactory("PriceFeedTestnet");
    // const sortedTrovesFactory = await this.getFactory("SortedTroves");

    // const communityIssuanceTesterFactory = await this.getFactory("CommunityIssuanceTester");
    // const activePoolTesterFactory = await this.getFactory("ActivePoolTester");
    // const defaultPoolTesterFactory = await this.getFactory("DefaultPoolTester");
    // const stabilityPoolTesterFactory = await this.getFactory("StabilityPoolTester");
    // const gasPoolFactory = await this.getFactory("GasPool");
    // const collSurplusPoolFactory = await this.getFactory("CollSurplusPool");
    // const protocolMathTesterFactory = await this.getFactory("ProtocolMathTester");
    // const borrowerOperationsTesterFactory = await this.getFactory("BorrowerOperationsTester");
    // const troveManagerTesterFactory = await this.getFactory("TroveManagerTester");
    // const functionCallerFactory = await this.getFactory("FunctionCaller");
    // const hintHelpersFactory = await this.getFactory("HintHelpers");
    // const debtTokenTesterFactory = await this.getFactory("DebtTokenTester");

    // Contract without testers (yet)
    testerContracts.priceFeedTestnet = await PriceFeedTestnet.new();
    testerContracts.sortedTroves = await SortedTroves.new();
    // testerContracts.priceFeedTestnet = await this.deploy(priceFeedTestnetFactory);
    // testerContracts.sortedTroves = await this.deploy(sortedTrovesFactory);
    // Actual tester contracts
    testerContracts.communityIssuance = await CommunityIssuanceTester.new();
    testerContracts.activePool = await ActivePoolTester.new();
    testerContracts.defaultPool = await DefaultPoolTester.new();
    testerContracts.stabilityPool = await StabilityPoolTester.new(gasCompensation, minNetDebt);
    testerContracts.gasPool = await GasPool.new();
    testerContracts.collSurplusPool = await CollSurplusPool.new();
    testerContracts.math = await ProtocolMathTester.new();
    testerContracts.borrowerOperations = await BorrowerOperationsTester.new(
      gasCompensation,
      minNetDebt,
    );
    testerContracts.troveManager = await TroveManagerTester.new(gasCompensation, minNetDebt);
    testerContracts.functionCaller = await FunctionCaller.new();
    testerContracts.hintHelpers = await HintHelpers.new(gasCompensation, minNetDebt);
    testerContracts.debtToken = await DebtTokenTester.new(
      testerContracts.troveManager.address,
      testerContracts.stabilityPool.address,
      testerContracts.borrowerOperations.address,
    );
    // testerContracts.communityIssuance = await this.deploy(communityIssuanceTesterFactory);
    // testerContracts.activePool = await this.deploy(activePoolTesterFactory);
    // testerContracts.defaultPool = await this.deploy(defaultPoolTesterFactory);
    // testerContracts.stabilityPool = await this.deploy(stabilityPoolTesterFactory, [
    //   gasCompensation,
    //   minNetDebt,
    // ]);
    // testerContracts.gasPool = await this.deploy(gasPoolFactory);
    // testerContracts.collSurplusPool = await this.deploy(collSurplusPoolFactory);
    // testerContracts.math = await this.deploy(protocolMathTesterFactory);
    // testerContracts.borrowerOperations = await this.deploy(borrowerOperationsTesterFactory, [
    //   gasCompensation,
    //   minNetDebt,
    // ]);
    // testerContracts.troveManager = await this.deploy(troveManagerTesterFactory, [
    //   gasCompensation,
    //   minNetDebt,
    // ]);
    // testerContracts.functionCaller = await this.deploy(functionCallerFactory);
    // testerContracts.hintHelpers = await this.deploy(hintHelpersFactory, [
    //   gasCompensation,
    //   minNetDebt,
    // ]);
    // testerContracts.debtToken = await this.deploy(debtTokenTesterFactory, [
    //   testerContracts.troveManager.address,
    //   testerContracts.stabilityPool.address,
    //   testerContracts.borrowerOperations.address,
    // ]);

    return testerContracts;
  }

  static async deployProtocolTokenContracts(bountyAddress, lpRewardsAddress, multisigAddress) {
    // const protocolTokenStakingFactory = await this.getFactory("ProtocolTokenStaking");
    // const lockupContractFactoryFactory = await this.getFactory("LockupContractFactory");
    // const communityIssuanceFactory = await this.getFactory("CommunityIssuance");
    // const protocolTokenFactory = await this.getFactory("ProtocolToken");

    const protocolTokenStaking = await ProtocolTokenStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuance.new();

    // const protocolTokenStaking = await this.deploy(protocolTokenStakingFactory);
    // const lockupContractFactory = await this.deploy(lockupContractFactoryFactory);
    // const communityIssuance = await this.deploy(communityIssuanceFactory);
    // const protocolToken = await this.deploy(protocolTokenFactory, [
    //   communityIssuance.address,
    //   protocolTokenStaking.address,
    //   lockupContractFactory.address,
    //   bountyAddress,
    //   lpRewardsAddress,
    //   multisigAddress,
    // ]);

    ProtocolTokenStaking.setAsDeployed(protocolTokenStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuance.setAsDeployed(communityIssuance);

    // Deploy ProtocolToken, passing Community Issuance and Factory addresses to the constructor
    const protocolToken = await ProtocolToken.new();
    ProtocolToken.setAsDeployed(protocolToken);

    const protocolTokenContracts = {
      protocolTokenStaking,
      lockupContractFactory,
      communityIssuance,
      protocolToken,
    };
    return protocolTokenContracts;
  }

  static async deployProtocolTokenTesterContracts(
    bountyAddress,
    lpRewardsAddress,
    multisigAddress,
  ) {
    // const protocolTokenStakingFactory = await this.getFactory("ProtocolTokenStaking");
    // const lockupContractFactoryFactory = await this.getFactory("LockupContractFactory");
    // const communityIssuanceFactory = await this.getFactory("CommunityIssuanceTester");
    // const protocolTokenFactory = await this.getFactory("ProtocolTokenTester");

    const protocolTokenStaking = await ProtocolTokenStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuanceTester.new();

    // const protocolTokenStaking = await this.deploy(protocolTokenStakingFactory);
    // const lockupContractFactory = await this.deploy(lockupContractFactoryFactory);
    // const communityIssuance = await this.deploy(communityIssuanceFactory);
    // const protocolToken = await this.deploy(protocolTokenFactory, [
    //   communityIssuance.address,
    //   protocolTokenStaking.address,
    //   lockupContractFactory.address,
    //   bountyAddress,
    //   lpRewardsAddress,
    //   multisigAddress,
    // ]);

    ProtocolTokenStaking.setAsDeployed(protocolTokenStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuanceTester.setAsDeployed(communityIssuance);

    // Deploy ProtocolToken, passing Community Issuance and Factory addresses to the constructor
    const protocolToken = await ProtocolTokenTester.new();
    ProtocolTokenTester.setAsDeployed(protocolToken);

    const protocolTokenContracts = {
      protocolTokenStaking,
      lockupContractFactory,
      communityIssuance,
      protocolToken,
    };
    return protocolTokenContracts;
  }

  static async deployDebtToken(contracts) {
    // const debtTokenFactory = await this.getFactory("DebtToken");
    // contracts.debtToken = await this.deploy(debtTokenFactory, [
    //   contracts.troveManager.address,
    //   contracts.stabilityPool.address,
    //   contracts.borrowerOperations.address,
    // ]);
    contracts.debtToken = await DebtToken.new();
    return contracts;
  }

  static async deployDebtTokenTester(contracts) {
    // const debtTokenFactory = await this.getFactory("DebtTokenTester");
    // contracts.debtToken = await this.deploy(debtTokenFactory, [
    //   contracts.troveManager.address,
    //   contracts.stabilityPool.address,
    //   contracts.borrowerOperations.address,
    // ]);
    contracts.debtToken = await DebtTokenTester.new();
    return contracts;
  }

  static async deployProxyScripts(contracts, protocolTokenContracts, owner, users) {
    const proxies = await buildUserProxies(users);

    // const borrowerWrappersScriptFactory = await this.getFactory("BorrowerWrappersScript");
    // const borrowerOperationsScriptFactory = await this.getFactory("BorrowerOperationsScript");
    // const troveManagerScriptFactory = await this.getFactory("TroveManagerScript");
    // const stabilityPoolScriptFactory = await this.getFactory("StabilityPoolScript");
    // const tokenScriptFactory = await this.getFactory("TokenScript");
    // const protocolStakingScriptFactory = await this.getFactory("ProtocolStakingScript");

    const borrowerWrappersScript = await BorrowerWrappersScript.new(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      protocolTokenContracts.protocolTokenStaking.address,
    );
    // const borrowerWrappersScript = await this.deploy(borrowerWrappersScriptFactory, [
    //   contracts.borrowerOperations.address,
    //   contracts.troveManager.address,
    //   protocolTokenContracts.protocolTokenStaking.address,
    // ]);
    contracts.borrowerWrappers = new BorrowerWrappersProxy(
      owner,
      proxies,
      borrowerWrappersScript.address,
    );

    const borrowerOperationsScript = await BorrowerOperationsScript.new(
      contracts.borrowerOperations.address,
    );
    // const borrowerOperationsScript = await this.deploy(borrowerOperationsScriptFactory, [
    //   contracts.borrowerOperations.address,
    // ]);
    contracts.borrowerOperations = new BorrowerOperationsProxy(
      owner,
      proxies,
      borrowerOperationsScript.address,
      contracts.borrowerOperations,
    );

    const troveManagerScript = await TroveManagerScript.new(contracts.troveManager.address);
    // const troveManagerScript = await this.deploy(troveManagerScriptFactory, [
    //   contracts.troveManager.address,
    // ]);
    contracts.troveManager = new TroveManagerProxy(
      owner,
      proxies,
      troveManagerScript.address,
      contracts.troveManager,
    );

    const stabilityPoolScript = await StabilityPoolScript.new(contracts.stabilityPool.address);
    // const stabilityPoolScript = await this.deploy(stabilityPoolScriptFactory, [
    //   contracts.stabilityPool.address,
    // ]);
    contracts.stabilityPool = new StabilityPoolProxy(
      owner,
      proxies,
      stabilityPoolScript.address,
      contracts.stabilityPool,
    );

    contracts.sortedTroves = new SortedTrovesProxy(owner, proxies, contracts.sortedTroves);

    const debtTokenScript = await TokenScript.new(contracts.debtToken.address);
    // const debtTokenScript = await this.deploy(tokenScriptFactory, [contracts.debtToken.address]);
    contracts.debtToken = new TokenProxy(
      owner,
      proxies,
      debtTokenScript.address,
      contracts.debtToken,
    );

    const protocolTokenScript = await TokenScript.new(protocolTokenContracts.protocolToken.address);
    // const protocolTokenScript = await this.deploy(tokenScriptFactory, [
    //   protocolTokenContracts.protocolToken.address,
    // ]);
    protocolTokenContracts.protocolToken = new TokenProxy(
      owner,
      proxies,
      protocolTokenScript.address,
      protocolTokenContracts.protocolToken,
    );

    const protocolTokenStakingScript = await ProtocolStakingScript.new(
      protocolTokenContracts.protocolTokenStaking.address,
    );
    // const protocolTokenStakingScript = await this.deploy(protocolStakingScriptFactory, [
    //   protocolTokenContracts.protocolTokenStaking.address,
    // ]);
    protocolTokenContracts.protocolTokenStaking = new ProtocolTokenStakingProxy(
      owner,
      proxies,
      protocolTokenStakingScript.address,
      protocolTokenContracts.protocolTokenStaking,
    );
  }

  // Connect contracts to their dependencies
  static async connectCoreContracts(contracts, protocolTokenContracts) {
    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.setParams(
      maxBytes32,
      contracts.troveManager.address,
      contracts.borrowerOperations.address,
    );

    // set contract addresses in the FunctionCaller
    await contracts.functionCaller.setTroveManagerAddress(contracts.troveManager.address);
    await contracts.functionCaller.setSortedTrovesAddress(contracts.sortedTroves.address);

    // set contracts in the Trove Manager
    await contracts.troveManager.setAddresses(
      contracts.borrowerOperations.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.debtToken.address,
      contracts.sortedTroves.address,
      protocolTokenContracts.protocolToken.address,
      protocolTokenContracts.protocolTokenStaking.address,
    );

    // set contracts in BorrowerOperations
    await contracts.borrowerOperations.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.sortedTroves.address,
      contracts.debtToken.address,
      protocolTokenContracts.protocolTokenStaking.address,
    );

    // set contracts in the Pools
    await contracts.stabilityPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.debtToken.address,
      contracts.sortedTroves.address,
      contracts.priceFeedTestnet.address,
      protocolTokenContracts.communityIssuance.address,
    );

    await contracts.activePool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.defaultPool.address,
    );

    await contracts.defaultPool.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address,
    );

    await contracts.collSurplusPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address,
    );

    // set contracts in HintHelpers
    await contracts.hintHelpers.setAddresses(
      contracts.sortedTroves.address,
      contracts.troveManager.address,
    );

    await contracts.debtToken.setAddresses(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address,
    );
  }

  static async connectProtocolTokenContracts(protocolTokenContracts) {
    protocolTokenContracts.protocolToken.setAddresses(
      protocolTokenContracts.communityIssuance.address,
      protocolTokenContracts.protocolTokenStaking.address,
      protocolTokenContracts.lockupContractFactory.address,
      protocolTokenContracts.bountyAddress,
      protocolTokenContracts.lpRewardsAddress,
      protocolTokenContracts.multisigAddress,
    );
    // Set ProtocolToken address in LCF
    await protocolTokenContracts.lockupContractFactory.setProtocolTokenAddress(
      protocolTokenContracts.protocolToken.address,
    );
  }

  static async connectProtocolTokenContractsToCore(protocolTokenContracts, coreContracts) {
    await protocolTokenContracts.protocolTokenStaking.setAddresses(
      protocolTokenContracts.protocolToken.address,
      coreContracts.debtToken.address,
      coreContracts.troveManager.address,
      coreContracts.borrowerOperations.address,
      coreContracts.activePool.address,
    );

    await protocolTokenContracts.communityIssuance.setAddresses(
      protocolTokenContracts.protocolToken.address,
      coreContracts.stabilityPool.address,
    );
  }

  static async connectUnipool(uniPool, protocolTokenContracts, uniswapPairAddr, duration) {
    await uniPool.setParams(
      protocolTokenContracts.protocolToken.address,
      uniswapPairAddr,
      duration,
    );
  }
}
module.exports = DeploymentHelper;
