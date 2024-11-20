const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const assertRevert = th.assertRevert;

contract("ProtocolToken - Allocation tests", async () => {
  let owner, A, B, C;

  let communityIssuance;
  let protocolToken;

  let contracts;

  before(async () => {
    [owner, A, B, C] = await ethers.getSigners();
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

    const protocolTokenContracts =
      await deploymentHelper.deployProtocolTokenTesterContracts(cpContracts);

    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
  });

  it("allocate(): allocates to a single user", async () => {
    const accounts = [A.address];
    const amounts = [dec(1, 18)];

    await protocolToken.allocate(accounts, amounts);

    assert.equal(await protocolToken.balanceOf(accounts[0]), dec(1, 18));
  });

  it("allocate(): allocates to multiple users", async () => {
    const accounts = [A, B].map((x) => x.address);
    const amounts = [1, 2].map((x) => dec(x, 18));

    await protocolToken.allocate(accounts, amounts);

    assert.equal(await protocolToken.balanceOf(accounts[0]), dec(1, 18));
    assert.equal(await protocolToken.balanceOf(accounts[1]), dec(2, 18));
  });

  it("allocate(): allocates zero to a user", async () => {
    const accounts = [A.address];
    const amounts = ["0"];

    await protocolToken.allocate(accounts, amounts);

    assert.equal(await protocolToken.balanceOf(accounts[0]), "0");
  });

  it("allocate(): reverts if called multiple times", async () => {
    const accounts = [A.address];
    const amounts = [dec(1, 18)];

    await protocolToken.allocate(accounts, amounts);

    await assertRevert(
      protocolToken.allocate(accounts, amounts),
      "ProtocolToken: already allocated",
    );
  });

  it("allocate(): reverts if input length of accounts and amounts do not match", async () => {
    const accounts = [A, B].map((x) => x.address);
    const amounts = [1, 2, 3].map((x) => dec(x, 18));

    await assertRevert(
      protocolToken.allocate(accounts, amounts),
      "ProtocolToken: accounts and amounts length mismatch",
    );
  });

  it("allocate(): reverts if caller is not owner", async () => {
    const accounts = [A.address];
    const amounts = [dec(1, 18)];

    await assertRevert(
      protocolToken.connect(A).allocate(accounts, amounts),
      "Ownable: caller is not the owner",
    );
  });
});
