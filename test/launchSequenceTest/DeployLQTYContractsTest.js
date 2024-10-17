const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const assertRevert = th.assertRevert;
const toBN = th.toBN;
const dec = th.dec;

contract(
  "Deploying the ProtocolToken contracts: LCF, CI, ProtocolTokenStaking, and ProtocolToken ",
  async (accounts) => {
    const [deployer, A, B] = accounts;
    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

    let protocolTokenContracts;

    const oneMillion = toBN(1000000);
    const digits = toBN(1e18);
    const thirtyTwo = toBN(32);
    const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits);

    beforeEach(async () => {
      // Deploy all contracts from the first account
      protocolTokenContracts = await deploymentHelper.deployProtocolTokenContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig,
      );
      await deploymentHelper.connectProtocolTokenContracts(protocolTokenContracts);

      protocolTokenStaking = protocolTokenContracts.protocolTokenStaking;
      protocolToken = protocolTokenContracts.protocolToken;
      communityIssuance = protocolTokenContracts.communityIssuance;
      lockupContractFactory = protocolTokenContracts.lockupContractFactory;

      //ProtocolToken Staking and CommunityIssuance have not yet had their setters called, so are not yet
      // connected to the rest of the system
    });

    describe("CommunityIssuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(deployer, storedDeployerAddress);
      });
    });

    describe("ProtocolTokenStaking deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await protocolTokenStaking.owner();

        assert.equal(deployer, storedDeployerAddress);
      });
    });

    describe("ProtocolToken deployment", async (accounts) => {
      it("Stores the multisig's address", async () => {
        const storedMultisigAddress = await protocolToken.multisigAddress();

        assert.equal(multisig, storedMultisigAddress);
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
        const multisigProtocolTokenEntitlement = await protocolToken.balanceOf(multisig);

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
        const bountyAddressBal = await protocolToken.balanceOf(bountyAddress);
        // 2 million as 18-digit decimal
        const _2Million = dec(2, 24);

        assert.equal(bountyAddressBal, _2Million);
      });

      it("Mints the correct ProtocolToken amount to the lpRewardsAddress EOA: 1.33 million", async () => {
        const lpRewardsAddressBal = await protocolToken.balanceOf(lpRewardsAddress);
        // 1.3 million as 18-digit decimal
        const _1pt33Million = "1".concat("3".repeat(24));

        assert.equal(lpRewardsAddressBal, _1pt33Million);
      });
    });

    describe("Community Issuance deployment", async (accounts) => {
      it("Stores the deployer's address", async () => {
        const storedDeployerAddress = await communityIssuance.owner();

        assert.equal(storedDeployerAddress, deployer);
      });

      it("Has a supply cap of 32 million", async () => {
        const supplyCap = await communityIssuance.protocolTokenSupplyCap();

        assert.isTrue(expectedCISupplyCap.eq(supplyCap));
      });

      it("Deployer can set addresses if CI's ProtocolToken balance is equal or greater than 32 million ", async () => {
        const protocolTokenBalance = await protocolToken.balanceOf(communityIssuance.address);
        assert.isTrue(protocolTokenBalance.eq(expectedCISupplyCap));

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployProtocolCore(
          th.GAS_COMPENSATION,
          th.MIN_NET_DEBT,
        );

        const tx = await communityIssuance.setAddresses(
          protocolToken.address,
          coreContracts.stabilityPool.address,
          {
            from: deployer,
          },
        );
        assert.isTrue(tx.receipt.status);
      });

      it("Deployer can't set addresses if CI's ProtocolToken balance is < 32 million ", async () => {
        const newCI = await CommunityIssuance.new();

        const protocolTokenBalance = await protocolToken.balanceOf(newCI.address);
        assert.equal(protocolTokenBalance, "0");

        // Deploy core contracts, just to get the Stability Pool address
        const coreContracts = await deploymentHelper.deployProtocolCore(
          th.GAS_COMPENSATION,
          th.MIN_NET_DEBT,
        );

        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider);
        await protocolToken.transfer(newCI.address, "31999999999999999999999999", {
          from: multisig,
        }); // 1e-18 less than CI expects (32 million)

        try {
          const tx = await newCI.setAddresses(
            protocolToken.address,
            coreContracts.stabilityPool.address,
            {
              from: deployer,
            },
          );

          // Check it gives the expected error message for a failed Solidity 'assert'
        } catch (err) {
          assert.include(err.message, "invalid opcode");
        }
      });
    });

    describe("Connecting ProtocolToken to LCF, CI and ProtocolTokenStaking", async (accounts) => {
      it("sets the correct ProtocolToken address in ProtocolTokenStaking", async () => {
        // Deploy core contracts and set the ProtocolToken address in the CI and ProtocolTokenStaking
        const coreContracts = await deploymentHelper.deployProtocolCore(
          th.GAS_COMPENSATION,
          th.MIN_NET_DEBT,
        );
        await deploymentHelper.connectProtocolTokenContractsToCore(
          protocolTokenContracts,
          coreContracts,
        );

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
        // Deploy core contracts and set the ProtocolToken address in the CI and ProtocolTokenStaking
        const coreContracts = await deploymentHelper.deployProtocolCore(
          th.GAS_COMPENSATION,
          th.MIN_NET_DEBT,
        );
        await deploymentHelper.connectProtocolTokenContractsToCore(
          protocolTokenContracts,
          coreContracts,
        );

        const protocolTokenAddress = protocolToken.address;

        const recordedProtocolTokenAddress = await communityIssuance.protocolToken();
        assert.equal(protocolTokenAddress, recordedProtocolTokenAddress);
      });
    });
  },
);
