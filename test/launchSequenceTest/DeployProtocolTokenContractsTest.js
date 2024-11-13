const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const toBN = th.toBN;
const dec = th.dec;

contract(
  "Deploying the ProtocolToken contracts: LCF, CI, ProtocolTokenStaking, and ProtocolToken ",
  async () => {
    let deployer, A, B;
    let bountyAddress, lpRewardsAddress, multisig;

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

      [deployer, A, B] = signers;
      [bountyAddress, lpRewardsAddress, multisig] = signers.slice(997, 1000);
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
        bountyAddress.address,
        lpRewardsAddress.address,
        multisig.address,
        cpContracts,
      );

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
      it("Stores the multisig's address", async () => {
        const storedMultisigAddress = await protocolToken.multisigAddress();

        assert.equal(multisig.address, storedMultisigAddress);
      });

      it("Stores the CommunityIssuance address", async () => {
        const storedCIAddress = await protocolToken.communityIssuanceAddress();

        assert.equal(communityIssuance.address, storedCIAddress);
      });

      it("Stores the LockupContractFactory address", async () => {
        const storedLCFAddress = await protocolToken.lockupContractFactory();

        assert.equal(lockupContractFactory.address, storedLCFAddress);
      });

      it("Mints the correct ProtocolToken amount to the multisig's address: (64.66 million)", async () => {
        const multisigProtocolTokenEntitlement = await protocolToken.balanceOf(multisig.address);

        const twentyThreeSixes = "6".repeat(23);
        const expectedMultisigEntitlement = "64".concat(twentyThreeSixes).concat("7");
        assert.equal(multisigProtocolTokenEntitlement, expectedMultisigEntitlement);
      });

      it("Mints the correct ProtocolToken amount to the CommunityIssuance contract address: 32 million", async () => {
        const communityProtocolTokenEntitlement = await protocolToken.balanceOf(
          communityIssuance.address,
        );
        // 32 million as 18-digit decimal
        const _32Million = dec(32, 24);

        assert.equal(communityProtocolTokenEntitlement, _32Million);
      });

      it("Mints the correct ProtocolToken amount to the bountyAddress EOA: 2 million", async () => {
        const bountyAddressBal = await protocolToken.balanceOf(bountyAddress.address);
        // 2 million as 18-digit decimal
        const _2Million = dec(2, 24);

        assert.equal(bountyAddressBal, _2Million);
      });

      it("Mints the correct ProtocolToken amount to the lpRewardsAddress EOA: 1.33 million", async () => {
        const lpRewardsAddressBal = await protocolToken.balanceOf(lpRewardsAddress.address);
        // 1.3 million as 18-digit decimal
        const _1pt33Million = "1".concat("3".repeat(24));

        assert.equal(lpRewardsAddressBal, _1pt33Million);
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
