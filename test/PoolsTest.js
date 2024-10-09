const StabilityPool = artifacts.require("./StabilityPool.sol")
const ActivePool = artifacts.require("./ActivePool.sol")
const DefaultPool = artifacts.require("./DefaultPool.sol")
const NonPayable = artifacts.require("./NonPayable.sol")

const testHelpers = require("../utils/testHelpers.js")

const th = testHelpers.TestHelper
const dec = th.dec

const _minus_1_Ether = web3.utils.toWei('-1', 'ether')

contract('StabilityPool', async accounts => {
  /* mock* are EOA’s, temporarily used to call protected functions.
  TODO: Replace with mock contracts, and later complete transactions from EOA
  */
  let stabilityPool

  const [owner, alice] = accounts;

  beforeEach(async () => {
    stabilityPool = await StabilityPool.new()
    const mockActivePoolAddress = (await NonPayable.new()).address
    const dumbContractAddress = (await NonPayable.new()).address
    await stabilityPool.setAddresses(dumbContractAddress, dumbContractAddress, mockActivePoolAddress, dumbContractAddress, dumbContractAddress, dumbContractAddress, dumbContractAddress)
  })

  it('getFIL(): gets the recorded FIL balance', async () => {
    const recordedFILBalance = await stabilityPool.getFIL()
    assert.equal(recordedFILBalance, 0)
  })

  it('getTotalDebtTokenDeposits(): gets the recorded debt token balance', async () => {
    const recordedFILBalance = await stabilityPool.getTotalDebtTokenDeposits()
    assert.equal(recordedFILBalance, 0)
  })
})

contract('ActivePool', async accounts => {

  let activePool, mockBorrowerOperations

  const [owner, alice] = accounts;
  beforeEach(async () => {
    activePool = await ActivePool.new()
    mockBorrowerOperations = await NonPayable.new()
    const dumbContractAddress = (await NonPayable.new()).address
    await activePool.setAddresses(mockBorrowerOperations.address, dumbContractAddress, dumbContractAddress, dumbContractAddress)
  })

  it('getFIL(): gets the recorded FIL balance', async () => {
    const recordedFILBalance = await activePool.getFIL()
    assert.equal(recordedFILBalance, 0)
  })

  it('getDebt(): gets the recorded DebtToken balance', async () => {
    const recordedFILBalance = await activePool.getDebt()
    assert.equal(recordedFILBalance, 0)
  })
 
  it('increaseDebtToken(): increases the recorded DebtToken balance by the correct amount', async () => {
    const recordedDebtToken_balanceBefore = await activePool.getDebt()
    assert.equal(recordedDebtToken_balanceBefore, 0)

    // await activePool.increaseDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseDebtData = th.getTransactionData('increaseDebt(uint256)', ['0x64'])
    const tx = await mockBorrowerOperations.forward(activePool.address, increaseDebtData)
    assert.isTrue(tx.receipt.status)
    const recordedDebtToken_balanceAfter = await activePool.getDebt()
    assert.equal(recordedDebtToken_balanceAfter, 100)
  })
  // Decrease
  it('decreaseDebtToken(): decreases the recorded DebtToken balance by the correct amount', async () => {
    // start the pool on 100 wei
    //await activePool.increaseDebt(100, { from: mockBorrowerOperationsAddress })
    const increaseDebtData = th.getTransactionData('increaseDebt(uint256)', ['0x64'])
    const tx1 = await mockBorrowerOperations.forward(activePool.address, increaseDebtData)
    assert.isTrue(tx1.receipt.status)

    const recordedDebtToken_balanceBefore = await activePool.getDebt()
    assert.equal(recordedDebtToken_balanceBefore, 100)

    //await activePool.decreaseDebt(100, { from: mockBorrowerOperationsAddress })
    const decreaseDebtData = th.getTransactionData('decreaseDebt(uint256)', ['0x64'])
    const tx2 = await mockBorrowerOperations.forward(activePool.address, decreaseDebtData)
    assert.isTrue(tx2.receipt.status)
    const recordedDebtToken_balanceAfter = await activePool.getDebt()
    assert.equal(recordedDebtToken_balanceAfter, 0)
  })

  // send raw ether
  it('sendFIL(): decreases the recorded FIL balance by the correct amount', async () => {
    // setup: give pool 2 ether
    const activePool_initialBalance = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    assert.equal(activePool_initialBalance, 0)
    // start pool with 2 ether
    //await web3.eth.sendTransaction({ from: mockBorrowerOperationsAddress, to: activePool.address, value: dec(2, 'ether') })
    const tx1 = await mockBorrowerOperations.forward(activePool.address, '0x', { from: owner, value: dec(2, 'ether') })
    assert.isTrue(tx1.receipt.status)

    const activePool_BalanceBeforeTx = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    const alice_Balance_BeforeTx = web3.utils.toBN(await web3.eth.getBalance(alice))

    assert.equal(activePool_BalanceBeforeTx, dec(2, 'ether'))

    // send ether from pool to alice
    //await activePool.sendFIL(alice, dec(1, 'ether'), { from: mockBorrowerOperationsAddress })
    const sendFILData = th.getTransactionData('sendFIL(address,uint256)', [alice, web3.utils.toHex(dec(1, 'ether'))])
    const tx2 = await mockBorrowerOperations.forward(activePool.address, sendFILData, { from: owner })
    assert.isTrue(tx2.receipt.status)

    const activePool_BalanceAfterTx = web3.utils.toBN(await web3.eth.getBalance(activePool.address))
    const alice_Balance_AfterTx = web3.utils.toBN(await web3.eth.getBalance(alice))

    const alice_BalanceChange = alice_Balance_AfterTx.sub(alice_Balance_BeforeTx)
    const pool_BalanceChange = activePool_BalanceAfterTx.sub(activePool_BalanceBeforeTx)
    assert.equal(alice_BalanceChange, dec(1, 'ether'))
    assert.equal(pool_BalanceChange, _minus_1_Ether)
  })
})

contract('DefaultPool', async accounts => {
 
  let defaultPool, mockTroveManager, mockActivePool

  const [owner, alice] = accounts;
  beforeEach(async () => {
    defaultPool = await DefaultPool.new()
    mockTroveManager = await NonPayable.new()
    mockActivePool = await NonPayable.new()
    await defaultPool.setAddresses(mockTroveManager.address, mockActivePool.address)
  })

  it('getFIL(): gets the recorded DebtToken balance', async () => {
    const recordedFILBalance = await defaultPool.getFIL()
    assert.equal(recordedFILBalance, 0)
  })

  it('getDebt(): gets the recorded DebtToken balance', async () => {
    const recordedFILBalance = await defaultPool.getDebt()
    assert.equal(recordedFILBalance, 0)
  })
 
  it('increaseDebtToken(): increases the recorded DebtToken balance by the correct amount', async () => {
    const recordedDebtToken_balanceBefore = await defaultPool.getDebt()
    assert.equal(recordedDebtToken_balanceBefore, 0)

    // await defaultPool.increaseDebt(100, { from: mockTroveManagerAddress })
    const increaseDebtData = th.getTransactionData('increaseDebt(uint256)', ['0x64'])
    const tx = await mockTroveManager.forward(defaultPool.address, increaseDebtData)
    assert.isTrue(tx.receipt.status)

    const recordedDebtToken_balanceAfter = await defaultPool.getDebt()
    assert.equal(recordedDebtToken_balanceAfter, 100)
  })
  
  it('decreaseDebtToken(): decreases the recorded DebtToken balance by the correct amount', async () => {
    // start the pool on 100 wei
    //await defaultPool.increaseDebt(100, { from: mockTroveManagerAddress })
    const increaseDebtData = th.getTransactionData('increaseDebt(uint256)', ['0x64'])
    const tx1 = await mockTroveManager.forward(defaultPool.address, increaseDebtData)
    assert.isTrue(tx1.receipt.status)

    const recordedDebtToken_balanceBefore = await defaultPool.getDebt()
    assert.equal(recordedDebtToken_balanceBefore, 100)

    // await defaultPool.decreaseDebt(100, { from: mockTroveManagerAddress })
    const decreaseDebtData = th.getTransactionData('decreaseDebt(uint256)', ['0x64'])
    const tx2 = await mockTroveManager.forward(defaultPool.address, decreaseDebtData)
    assert.isTrue(tx2.receipt.status)

    const recordedDebtToken_balanceAfter = await defaultPool.getDebt()
    assert.equal(recordedDebtToken_balanceAfter, 0)
  })

  // send raw ether
  it('sendFILToActivePool(): decreases the recorded FIL balance by the correct amount', async () => {
    // setup: give pool 2 ether
    const defaultPool_initialBalance = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    assert.equal(defaultPool_initialBalance, 0)

    // start pool with 2 ether
    //await web3.eth.sendTransaction({ from: mockActivePool.address, to: defaultPool.address, value: dec(2, 'ether') })
    const tx1 = await mockActivePool.forward(defaultPool.address, '0x', { from: owner, value: dec(2, 'ether') })
    assert.isTrue(tx1.receipt.status)

    const defaultPool_BalanceBeforeTx = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    const activePool_Balance_BeforeTx = web3.utils.toBN(await web3.eth.getBalance(mockActivePool.address))

    assert.equal(defaultPool_BalanceBeforeTx, dec(2, 'ether'))

    // send ether from pool to alice
    //await defaultPool.sendFILToActivePool(dec(1, 'ether'), { from: mockTroveManagerAddress })
    const sendFILData = th.getTransactionData('sendFILToActivePool(uint256)', [web3.utils.toHex(dec(1, 'ether'))])
    await mockActivePool.setPayable(true)
    const tx2 = await mockTroveManager.forward(defaultPool.address, sendFILData, { from: owner })
    assert.isTrue(tx2.receipt.status)

    const defaultPool_BalanceAfterTx = web3.utils.toBN(await web3.eth.getBalance(defaultPool.address))
    const activePool_Balance_AfterTx = web3.utils.toBN(await web3.eth.getBalance(mockActivePool.address))

    const activePool_BalanceChange = activePool_Balance_AfterTx.sub(activePool_Balance_BeforeTx)
    const defaultPool_BalanceChange = defaultPool_BalanceAfterTx.sub(defaultPool_BalanceBeforeTx)
    assert.equal(activePool_BalanceChange, dec(1, 'ether'))
    assert.equal(defaultPool_BalanceChange, _minus_1_Ether)
  })
})

contract('Reset chain state', async accounts => {})
