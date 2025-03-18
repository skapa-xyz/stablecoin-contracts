const { TestHelper: th, TimeValues: timeVals } = require("../utils/testHelpers.js");
const { dec, toBN } = th;
const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");
const hre = require("hardhat");

async function main(configParams) {
  const date = new Date();
  console.log(date.toUTCString());
  const deployerWallet = (await ethers.getSigners())[0];
  const mdh = new HardhatDeploymentHelper(configParams, deployerWallet);
  const deploymentState = mdh.loadPreviousDeployment();

  const [protocolToken, communityIssuance, lockupContractFactory, unipool] = await Promise.all(
    ["ProtocolToken", "CommunityIssuance", "LockupContractFactory", "Unipool"].map(async (name) => {
      const factory = await ethers.getContractFactory(name, deployerWallet);
      const deploymentKey = name.charAt(0).toLocaleLowerCase() + name.slice(1);
      return new ethers.Contract(
        deploymentState[deploymentKey].address,
        factory.interface,
        deployerWallet,
      );
    }),
  );

  // Allocate tokens to the admin, community issuance, and unipool
  const accounts = [
    configParams.walletAddrs.FOUNDATION,
    unipool.address,
    communityIssuance.address,
  ];
  const amounts = [
    configParams.allocationAmounts.FOUNDATION,
    configParams.allocationAmounts.UNIPOOL,
    configParams.allocationAmounts.COMMUNITY_ISSUANCE,
  ];

  const convertFromFullAmount = (amount) =>
    toBN(amount).div(dec(1, 18)).toNumber().toLocaleString();

  console.log("Token allocation:");
  console.table({
    admin: { address: accounts[0], amount: convertFromFullAmount(amounts[0]) },
    unipool: { address: accounts[1], amount: convertFromFullAmount(amounts[1]) },
    communityIssuance: { address: accounts[2], amount: convertFromFullAmount(amounts[2]) },
  });

  await mdh.sendAndWaitForTransaction(protocolToken.triggerInitialAllocation(accounts, amounts));
  await mdh.sendAndWaitForTransaction(communityIssuance.updateProtocolTokenSupplyCap());

  let supplyStartTime = await communityIssuance.supplyStartTime();
  console.log(`supply start time: ${supplyStartTime}`);

  const oneYearFromDeployment = (Number(supplyStartTime) + timeVals.SECONDS_IN_ONE_YEAR).toString();
  console.log(`time oneYearFromDeployment: ${oneYearFromDeployment}`);

  // Deploy LockupContracts - one for each beneficiary
  const lockupContracts = {};

  for (const [investor, investorAddr] of Object.entries(configParams.beneficiaries)) {
    const lockupContractEthersFactory = await ethers.getContractFactory(
      "LockupContract",
      deployerWallet,
    );
    if (deploymentState[investor] && deploymentState[investor].address) {
      console.log(
        `Using previously deployed ${investor} lockup contract at address ${deploymentState[investor].address}`,
      );
      lockupContracts[investor] = new ethers.Contract(
        deploymentState[investor].address,
        lockupContractEthersFactory.interface,
        deployerWallet,
      );
    } else {
      const txReceipt = await mdh.sendAndWaitForTransaction(
        lockupContractFactory.deployLockupContract(investorAddr, oneYearFromDeployment),
      );

      const address = txReceipt.events.find(
        (e) => e.event === "LockupContractDeployedThroughFactory",
      ).args._lockupContractAddress;

      lockupContracts[investor] = new ethers.Contract(
        address,
        lockupContractEthersFactory.interface,
        deployerWallet,
      );

      deploymentState[investor] = {
        address: address,
        txHash: txReceipt.transactionHash,
      };

      mdh.saveDeployment(deploymentState);
    }

    // verify
    if (configParams.ETHERSCAN_BASE_URL) {
      await mdh.verifyContract(investor, deploymentState, [
        protocolToken.address,
        investorAddr,
        oneYearFromDeployment,
      ]);
    }
  }

  // --- Lockup Contracts ---
  console.log("LOCKUP CONTRACT CHECKS");
  // Check lockup contracts exist for each beneficiary with correct unlock time
  for (investor of Object.keys(lockupContracts)) {
    const lockupContract = lockupContracts[investor];
    // check LC references correct ProtocolToken
    const storedProtocolTokenAddr = await lockupContract.protocolToken();
    assert.equal(protocolToken.address, storedProtocolTokenAddr);
    // Check contract has stored correct beneficary
    const onChainBeneficiary = await lockupContract.beneficiary();
    assert.equal(
      configParams.beneficiaries[investor].toLowerCase(),
      onChainBeneficiary.toLowerCase(),
    );
    // Check correct unlock time (1 yr from deployment)
    const unlockTime = await lockupContract.unlockTime();
    assert.equal(oneYearFromDeployment, unlockTime);

    console.table({
      beneficiary: investor,
      "lockupContract addr": lockupContract.address,
      "stored ProtocolToken addr": storedProtocolTokenAddr,
      "beneficiary addr": configParams.beneficiaries[investor],
      "on-chain beneficiary addr": onChainBeneficiary,
      unlockTime: unlockTime.toNumber(),
    });
  }
}

const inputFile = require(
  `./inputs/${hre.network.name === "localhost" ? "testnet" : hre.network.name}.js`,
);

main(inputFile)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
