const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;

contract("DefaultPool", async (accounts) => {
  let defaultPool;
  let mockActivePool;
  let mockTroveManager;

  let [owner] = accounts;

  beforeEach("Deploy contracts", async () => {
    const defaultPoolFactory = await deploymentHelper.getFactory("DefaultPool");
    const nonPayableFactory = await deploymentHelper.getFactory("NonPayable");

    mockTroveManager = await nonPayableFactory.deploy();
    mockActivePool = await nonPayableFactory.deploy();
    defaultPool = await deploymentHelper.deployProxy(defaultPoolFactory, [
      mockTroveManager.address,
      mockActivePool.address,
    ]);
  });

  it("sendFILToActivePool(): fails if receiver cannot receive FIL", async () => {
    const amount = dec(1, "ether");

    // start pool with `amount`
    //await web3.eth.sendTransaction({ to: defaultPool.address, from: owner, value: amount })
    const tx = await mockActivePool.forward(defaultPool.address, "0x", {
      from: owner,
      value: amount,
    });
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // try to send ether from pool to non-payable
    //await th.assertRevert(defaultPool.sendFILToActivePool(amount, { from: owner }), 'DefaultPool: sending FIL failed')
    const sendFILData = th.getTransactionData("sendFILToActivePool(uint256)", [
      web3.utils.toHex(amount),
    ]);
    await th.assertRevert(
      mockTroveManager.forward(defaultPool.address, sendFILData, { from: owner }),
      "DefaultPool: sending FIL failed",
    );
  });
});

contract("Reset chain state", async () => {});
