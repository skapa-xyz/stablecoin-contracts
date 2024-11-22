const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const toBN = th.toBN;
const dec = th.dec;

contract(
  "Deploying the ProtocolToken contracts: LCF, CI, ProtocolTokenStaking, and ProtocolToken ",
  async () => {
    let deployer;
    let lpRewardsAddress, multisig;

    let protocolTokenContracts;

    let protocolTokenStaking;
    let protocolToken;
    let communityIssuance;
    let lockupContractFactory;

    const oneMillion = toBN(1000000);
    const digits = toBN("1000000000000000000");
    const thirtyTwo = toBN(32);
    const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits);

    before(async () => {
      const signers = await ethers.getSigners();

      [deployer] = signers;
      [lpRewardsAddress, multisig] = signers.slice(998, 1000);
    });

    beforeEach(async () => {
      await hre.network.provider.send("hardhat_reset");

      const transactionCount = await deployer.getTransactionCount();
      const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
        deployer.address,
        transactionCount + 1,
      );
      await deploymentHelper.deployProtocolCore(th.GAS_COMPENSATION, th.MIN_NET_DEBT, cpContracts);
      protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
        deployer.address,
        cpContracts,
      );

      const allocation = [
        { address: multisig.address, amount: toBN(dec(67000000, 18)) },
        { address: lpRewardsAddress.address, amount: toBN(dec(1000000, 18)) },
        {
          address: protocolTokenContracts.communityIssuance.address,
          amount: toBN(dec(32000000, 18)),
        },
      ];
      await deploymentHelper.allocateProtocolToken(protocolTokenContracts, allocation);

      protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
      protocolToken = protocolTokenContracts.protocolToken;
      communityIssuance = protocolTokenContracts.communityIssuance;
      lockupContractFactory = protocolTokenContracts.lockupContractFactory;

      //ProtocolToken Staking and CommunityIssuance have not yet had their setters called, so are not yet
      // connected to the rest of the system
    });

    describe("CommunityIssuance deployment", async () => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(deployer.address, storedDeployerAddress);
      });
    });

    describe("ProtocolTokenStaking deployment", async () => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await protocolTokenStaking.owner();

        assert.equal(deployer.address, storedDeployerAddress);
      });
    });

    describe("ProtocolToken deployment", async () => {
      it("Mints the correct ProtocolToken amount to the multisig's address: 67 million", async () => {
        const multisigProtocolTokenEntitlement = await protocolToken.balanceOf(multisig.address);
        assert.equal(multisigProtocolTokenEntitlement, dec(67000000, 18));
      });

      it("Mints the correct ProtocolToken amount to the CommunityIssuance contract address: 32 million", async () => {
        const communityProtocolTokenEntitlement = await protocolToken.balanceOf(
          communityIssuance.address,
        );
        assert.equal(communityProtocolTokenEntitlement, dec(32000000, 18));
      });

      it("Mints the correct ProtocolToken amount to the lpRewardsAddress EOA: 1 million", async () => {
        const lpRewardsAddressBal = await protocolToken.balanceOf(lpRewardsAddress.address);
        assert.equal(lpRewardsAddressBal, dec(1000000, 18));
      });
    });

    describe("Community Issuance deployment", async () => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(storedDeployerAddress, deployer.address);
      });

      it("Has a supply cap of 32 million", async () => {
        const supplyCap = await communityIssuance.protocolTokenSupplyCap();

        assert.isTrue(expectedCISupplyCap.eq(supplyCap));
      });
    });

    describe("Connecting ProtocolToken to LCF, CI and ProtocolTokenStaking", async () => {
      it("sets the correct ProtocolToken address in ProtocolTokenStaking", async () => {
        const protocolTokenAddress = protocolToken.address;

        const recordedProtocolTokenAddress = await protocolTokenStaking.protocolToken();
        assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
      });

      it("sets the correct ProtocolToken address in LockupContractFactory", async () => {
        const protocolTokenAddress = protocolToken.address;

        const recordedProtocolTokenAddress = await lockupContractFactory.protocolTokenAddress();
        assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
      });

      it("sets the correct ProtocolToken address in CommunityIssuance", async () => {
        const protocolTokenAddress = protocolToken.address;

        const recordedProtocolTokenAddress = await communityIssuance.protocolToken();
        assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
      });
    });
  },
);
