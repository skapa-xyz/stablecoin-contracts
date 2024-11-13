const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;

const _minus_1_Ether = web3.utils.toWei("-1", "ether");

contract("StabilityPool", async () => {
  /* mock* are EOA’s, temporarily used to call protected functions.
  TODO: Replace with mock contracts, and later complete transactions from EOA
  */
  let stabilityPool;

  beforeEach(async () => {
    const protocolBaseFactory = await ethers.getContractFactory("ProtocolBase");
    const stabilityPoolFactory = await ethers.getContractFactory("StabilityPool");

    const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    stabilityPool = await deploymentHelper.deployProxy(
      stabilityPoolFactory,
      [
        dumbContract.address,
        dumbContract.address,
        dumbContract.address,
        dumbContract.address,
        dumbContract.address,
        dumbContract.address,
        dumbContract.address,
      ],
      [th.GAS_COMPENSATION, th.MIN_NET_DEBT],
    );
  });

  it("getFIL(): gets the recorded FIL balance", async () => {
    const recordedFILBalance = await stabilityPool.getFIL();
    assert.equal(recordedFILBalance, 0);
  });

  it("getTotalDebtTokenDeposits(): gets the recorded debt token balance", async () => {
    const recordedFILBalance = await stabilityPool.getTotalDebtTokenDeposits();
    assert.equal(recordedFILBalance, 0);
  });
});

contract("ActivePool", async (accounts) => {
  let activePool, mockBorrowerOperations;

  const [owner, alice] = accounts;
  beforeEach(async () => {
    const activePoolFactory = await ethers.getContractFactory("ActivePool");
    const nonPayableFactory = await ethers.getContractFactory("NonPayable");
    const protocolBaseFactory = await ethers.getContractFactory("ProtocolBase");

    const dumbContract = await protocolBaseFactory.deploy(th.GAS_COMPENSATION, th.MIN_NET_DEBT);
    mockBorrowerOperations = await nonPayableFactory.deploy();
    activePool = await deploymentHelper.deployProxy(activePoolFactory, [
      mockBorrowerOperations.address,
      dumbContract.address,
      dumbContract.address,
      dumbContract.address,
    ]);
  });

  it("getFIL(): gets the recorded FIL balance", async () => {
    const recordedFILBalance = await activePool.getFIL();
    assert.equal(recordedFILBalance, 0);
  });

  it("getDebt(): gets the recorded DebtToken balance", async () => {
    const recordedFILBalance = await activePool.getDebt();
    assert.equal(recordedFILBalance, 0);
  });

  it("increaseDebtToken(): increases the recorded DebtToken balance by the correct amount", async () => {
    const recordedDebtToken_balanceBefore = await activePool.getDebt();
    assert.equal(recordedDebtToken_balanceBefore, 0);

    // await activePool.increaseDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseDebtData = th.getTransactionData("increaseDebt(uint256)", ["0x64"]);
    const tx = await mockBorrowerOperations.forward(activePool.address, increaseDebtData);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    const recordedDebtToken_balanceAfter = await activePool.getDebt();
    assert.equal(recordedDebtToken_balanceAfter, 100);
  });
  // Decrease
  it("decreaseDebtToken(): decreases the recorded DebtToken balance by the correct amount", async () => {
    // start the pool on 100 wei
    //await activePool.increaseDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseDebtData = th.getTransactionData("increaseDebt(uint256)", ["0x64"]);
    const tx1 = await mockBorrowerOperations.forward(activePool.address, increaseDebtData);
    const receipt1 = await tx1.wait();
    assert.equal(receipt1.status, 1);

    const recordedDebtToken_balanceBefore = await activePool.getDebt();
    assert.equal(recordedDebtToken_balanceBefore, 100);

    //await activePool.decreaseDebt(100, { from: mockBorrowerOperationsAddress })
    const decreaseDebtData = th.getTransactionData("decreaseDebt(uint256)", ["0x64"]);
    const tx2 = await mockBorrowerOperations.forward(activePool.address, decreaseDebtData);
    const receipt2 = await tx2.wait();
    assert.equal(receipt2.status, 1);
    const recordedDebtToken_balanceAfter = await activePool.getDebt();
    assert.equal(recordedDebtToken_balanceAfter, 0);
  });

  // send raw ether
  it("sendFIL(): decreases the recorded FIL balance by the correct amount", async () => {
    // setup: give pool 2 ether
    const activePool_initialBalance = th.toBN(await web3.eth.getBalance(activePool.address));
    assert.equal(activePool_initialBalance, 0);
    // start pool with 2 ether
    //await web3.eth.sendTransaction({ from: mockBorrowerOperationsAddress, to: activePool.address, value: dec(2, 'ether') })
    const tx1 = await mockBorrowerOperations.forward(activePool.address, "0x", {
      from: owner,
      value: dec(2, "ether"),
    });
    const receipt = await tx1.wait();
    assert.equal(receipt.status, 1);

    const activePool_BalanceBeforeTx = th.toBN(await web3.eth.getBalance(activePool.address));
    const alice_Balance_BeforeTx = th.toBN(await web3.eth.getBalance(alice));

    assert.equal(activePool_BalanceBeforeTx, dec(2, "ether"));

    // send ether from pool to alice
    //await activePool.sendFIL(alice, dec(1, 'ether'), { from: mockBorrowerOperationsAddress })
    const sendFILData = th.getTransactionData("sendFIL(address,uint256)", [
      alice,
      web3.utils.toHex(dec(1, "ether")),
    ]);
    const tx2 = await mockBorrowerOperations.forward(activePool.address, sendFILData, {
      from: owner,
    });
    const receipt2 = await tx2.wait();
    assert.equal(receipt2.status, 1);

    const activePool_BalanceAfterTx = th.toBN(await web3.eth.getBalance(activePool.address));
    const alice_Balance_AfterTx = th.toBN(await web3.eth.getBalance(alice));

    const alice_BalanceChange = alice_Balance_AfterTx.sub(alice_Balance_BeforeTx);
    const pool_BalanceChange = activePool_BalanceAfterTx.sub(activePool_BalanceBeforeTx);
    assert.equal(alice_BalanceChange, dec(1, "ether"));
    assert.equal(pool_BalanceChange, _minus_1_Ether);
  });
});

contract("DefaultPool", async () => {
  let defaultPool, mockTroveManager, mockActivePool;
  let owner, alice;

  before(async () => {
    signers = await ethers.getSigners();
    [owner, alice] = signers;
  });

  beforeEach(async () => {
    await hre.network.provider.send("hardhat_reset");

    const nonPayableFactory = await ethers.getContractFactory("NonPayable");
    const defaultPoolFactory = await ethers.getContractFactory("DefaultPool");

    mockTroveManager = await nonPayableFactory.deploy();
    mockActivePool = await nonPayableFactory.deploy();
    defaultPool = await deploymentHelper.deployProxy(defaultPoolFactory, [
      mockTroveManager.address,
      mockActivePool.address,
    ]);
  });

  it("getFIL(): gets the recorded DebtToken balance", async () => {
    const recordedFILBalance = await defaultPool.getFIL();
    assert.equal(recordedFILBalance, 0);
  });

  it("getDebt(): gets the recorded DebtToken balance", async () => {
    const recordedFILBalance = await defaultPool.getDebt();
    assert.equal(recordedFILBalance, 0);
  });

  it("increaseDebtToken(): increases the recorded DebtToken balance by the correct amount", async () => {
    const recordedDebtToken_balanceBefore = await defaultPool.getDebt();
    assert.equal(recordedDebtToken_balanceBefore, 0);

    // await defaultPool.increaseDebt(100, { from: mockTroveManagerAddress })
    const increaseDebtData = th.getTransactionData("increaseDebt(uint256)", ["0x64"]);
    const tx = await mockTroveManager.forward(defaultPool.address, increaseDebtData);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    const recordedDebtToken_balanceAfter = await defaultPool.getDebt();
    assert.equal(recordedDebtToken_balanceAfter, 100);
  });

  it("decreaseDebtToken(): decreases the recorded DebtToken balance by the correct amount", async () => {
    // start the pool on 100 wei
    //await defaultPool.increaseDebt(100, { from: mockTroveManagerAddress })
    const increaseDebtData = th.getTransactionData("increaseDebt(uint256)", ["0x64"]);
    const tx1 = await mockTroveManager.forward(defaultPool.address, increaseDebtData);
    const receipt1 = await tx1.wait();
    assert.equal(receipt1.status, 1);

    const recordedDebtToken_balanceBefore = await defaultPool.getDebt();
    assert.equal(recordedDebtToken_balanceBefore, 100);

    // await defaultPool.decreaseDebt(100, { from: mockTroveManagerAddress })
    const decreaseDebtData = th.getTransactionData("decreaseDebt(uint256)", ["0x64"]);
    const tx2 = await mockTroveManager.forward(defaultPool.address, decreaseDebtData);
    const receipt = await tx2.wait();
    assert.equal(receipt.status, 1);

    const recordedDebtToken_balanceAfter = await defaultPool.getDebt();
    assert.equal(recordedDebtToken_balanceAfter, 0);
  });

  // send raw ether
  it("sendFILToActivePool(): decreases the recorded FIL balance by the correct amount", async () => {
    // setup: give pool 2 ether
    const defaultPool_initialBalance = th.toBN(await web3.eth.getBalance(defaultPool.address));
    assert.equal(defaultPool_initialBalance, 0);

    // start pool with 2 ether
    //await web3.eth.sendTransaction({ from: mockActivePool.address, to: defaultPool.address, value: dec(2, 'ether') })
    const tx1 = await mockActivePool.connect(owner).forward(defaultPool.address, "0x", {
      value: dec(2, "ether"),
    });
    const receipt = await tx1.wait();
    assert.equal(receipt.status, 1);

    const defaultPool_BalanceBeforeTx = th.toBN(await web3.eth.getBalance(defaultPool.address));
    const activePool_Balance_BeforeTx = th.toBN(await web3.eth.getBalance(mockActivePool.address));

    assert.equal(defaultPool_BalanceBeforeTx, dec(2, "ether"));

    // send ether from pool to alice
    //await defaultPool.sendFILToActivePool(dec(1, 'ether'), { from: mockTroveManagerAddress })
    const sendFILData = th.getTransactionData("sendFILToActivePool(uint256)", [
      web3.utils.toHex(dec(1, "ether")),
    ]);
    await mockActivePool.setPayable(true);
    const tx2 = await mockTroveManager.connect(owner).forward(defaultPool.address, sendFILData);
    const receipt2 = await tx2.wait();
    assert.equal(receipt2.status, 1);

    const defaultPool_BalanceAfterTx = th.toBN(await web3.eth.getBalance(defaultPool.address));
    const activePool_Balance_AfterTx = th.toBN(await web3.eth.getBalance(mockActivePool.address));

    const activePool_BalanceChange = activePool_Balance_AfterTx.sub(activePool_Balance_BeforeTx);
    const defaultPool_BalanceChange = defaultPool_BalanceAfterTx.sub(defaultPool_BalanceBeforeTx);
    assert.equal(activePool_BalanceChange, dec(1, "ether"));
    assert.equal(defaultPool_BalanceChange, _minus_1_Ether);
  });
});

contract("Reset chain state", async () => {});
