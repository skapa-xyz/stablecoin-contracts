const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
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

    const protocolTokenContracts = await deploymentHelper.deployProtocolTokenTesterContracts(
      owner.address,
      cpContracts,
    );

    protocolToken = protocolTokenContracts.protocolToken;
    communityIssuance = protocolTokenContracts.communityIssuance;
  });

  describe("Initial allocation", async () => {
    it("triggerInitialAllocation(): allocates to a single user", async () => {
      const accounts = [A.address];
      const amounts = [dec(1, 18)];

      await protocolToken.triggerInitialAllocation(accounts, amounts);

      assert.equal(await protocolToken.balanceOf(accounts[0]), dec(1, 18));
    });

    it("triggerInitialAllocation(): allocates to multiple users", async () => {
      const accounts = [A, B].map((x) => x.address);
      const amounts = [1, 2].map((x) => dec(x, 18));

      await protocolToken.triggerInitialAllocation(accounts, amounts);

      assert.equal(await protocolToken.balanceOf(accounts[0]), dec(1, 18));
      assert.equal(await protocolToken.balanceOf(accounts[1]), dec(2, 18));
    });

    it("triggerInitialAllocation(): allocates zero to a user", async () => {
      const accounts = [A.address];
      const amounts = ["0"];

      await protocolToken.triggerInitialAllocation(accounts, amounts);

      assert.equal(await protocolToken.balanceOf(accounts[0]), "0");
    });

    it("triggerInitialAllocation(): reverts if called multiple times", async () => {
      const accounts = [A.address];
      const amounts = [dec(1, 18)];

      await protocolToken.triggerInitialAllocation(accounts, amounts);

      await assertRevert(
        protocolToken.triggerInitialAllocation(accounts, amounts),
        "ProtocolToken: already allocated",
      );
    });

    it("triggerInitialAllocation(): reverts if input length of accounts and amounts do not match", async () => {
      const accounts = [A, B].map((x) => x.address);
      const amounts = [1, 2, 3].map((x) => dec(x, 18));

      await assertRevert(
        protocolToken.triggerInitialAllocation(accounts, amounts),
        "ProtocolToken: accounts and amounts length mismatch",
      );
    });

    it("triggerInitialAllocation(): reverts if caller is not owner", async () => {
      const accounts = [A.address];
      const amounts = [dec(1, 18)];

      await assertRevert(
        protocolToken.connect(A).triggerInitialAllocation(accounts, amounts),
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("Annual allocation", async () => {
    let accounts;
    let amounts;

    before(async () => {
      accounts = [A.address];
      amounts = [dec(1, 18)];
    });

    it("updateAnnualAllocationRate(): updates the annual allocation rate", async () => {
      const rate = dec(1, 16);
      await protocolToken.triggerInitialAllocation(accounts, amounts);
      await protocolToken.updateAnnualAllocationRate(rate);

      assert.equal(await protocolToken.annualAllocationRate(), rate);
    });

    it("updateAnnualAllocationRate(): reverts if rate is greater than 100%", async () => {
      const rate = "1000000000000000001";
      await protocolToken.triggerInitialAllocation(accounts, amounts);

      await assertRevert(
        protocolToken.updateAnnualAllocationRate(rate),
        "ProtocolToken: annual allocation rate must be less than or equal to 100%",
      );
    });

    it("updateAnnualAllocationRate(): reverts if called by non-owner", async () => {
      const rate = dec(1, 16);
      await protocolToken.triggerInitialAllocation(accounts, amounts);

      await assertRevert(
        protocolToken.connect(A).updateAnnualAllocationRate(rate),
        "Ownable: caller is not the owner",
      );
    });

    it("updateAnnualAllocationRecipient(): updates the annual allocation recipient", async () => {
      const recipient = C.address;
      await protocolToken.triggerInitialAllocation(accounts, amounts);
      await protocolToken.updateAnnualAllocationRecipient(recipient);

      assert.equal(await protocolToken.annualAllocationRecipient(), recipient);
    });

    it("updateAnnualAllocationRecipient(): reverts if called by non-owner", async () => {
      const recipient = C.address;
      await protocolToken.triggerInitialAllocation(accounts, amounts);
      await assertRevert(
        protocolToken.connect(A).updateAnnualAllocationRecipient(recipient),
        "Ownable: caller is not the owner",
      );
    });

    it("triggerAnnualAllocation(): triggers the annual allocation by owner", async () => {
      const rate = await protocolToken.annualAllocationRate();
      await protocolToken.triggerInitialAllocation(accounts, amounts);

      const totalSupplyBefore = await protocolToken.totalSupply();

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      await protocolToken.triggerAnnualAllocation();

      const totalSupplyAfter = await protocolToken.totalSupply();

      assert.equal(
        totalSupplyAfter.sub(totalSupplyBefore).toString(),
        totalSupplyBefore.mul(rate).div(dec(1, 18)).toString(),
      );

      await assertRevert(
        protocolToken.triggerAnnualAllocation(),
        "ProtocolToken: annual allocation is not yet available",
      );
    });

    it("triggerAnnualAllocation(): triggers the annual allocation by non-owner", async () => {
      await protocolToken.triggerInitialAllocation(accounts, amounts);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);

      await protocolToken.triggerAnnualAllocation();
    });

    it("triggerAnnualAllocation(): reverts if called before the initial allocation", async () => {
      await assertRevert(
        protocolToken.triggerAnnualAllocation(),
        "ProtocolToken: initial allocation has not been done yet",
      );
    });

    it("triggerAnnualAllocation(): reverts if called before one year has passed", async () => {
      await protocolToken.triggerInitialAllocation(accounts, amounts);

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR - timeValues.SECONDS_IN_ONE_MINUTE,
        web3.currentProvider,
      );

      await assertRevert(
        protocolToken.triggerAnnualAllocation(),
        "ProtocolToken: annual allocation is not yet available",
      );

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MINUTE, web3.currentProvider);

      await protocolToken.triggerAnnualAllocation();
    });
  });
});
