const { TestHelper: th, TimeValues: timeVals } = require("../utils/testHelpers.js");
const { dec, toBN } = th;
const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");
const hre = require("hardhat");

async function main(configParams) {
  const date = new Date();
  console.log(date.toUTCString());
  const deployer = (await ethers.getSigners())[0];
  const mdh = new HardhatDeploymentHelper(configParams, deployer);
  const deploymentState = mdh.loadPreviousDeployment();
  const multisig = configParams.walletAddrs.MULTISIG;

  if (!multisig) {
    throw new Error("Multisig address is not set");
  }

  const contractNames = [
    "ActivePool",
    "BorrowerOperations",
    "CollSurplusPool",
    "DebtToken",
    "DefaultPool",
    "GasPool",
    "HintHelpers",
    "PriceFeed",
    "SortedTroves",
    "StabilityPool",
    "TroveManager",
    "Unipool",
    "CommunityIssuance",
    "LockupContractFactory",
    "ProtocolToken",
    "ProtocolTokenStaking",
  ];

  const contracts = (
    await Promise.all(
      contractNames.map(async (name) => {
        const factory = await ethers.getContractFactory(name, deployer);
        const deploymentKey = name.charAt(0).toLocaleLowerCase() + name.slice(1);
        const contract = new ethers.Contract(
          deploymentState[deploymentKey].address,
          factory.interface,
          deployer,
        );
        return [name, contract];
      }),
    )
  ).reduce((obj, [name, contract]) => {
    obj[name] = contract;
    return obj;
  }, {});

  let nonce = await deployer.getTransactionCount();
  const txs = [];

  for (const [name, contract] of Object.entries(contracts)) {
    const owner = await contract.owner();

    if (owner === multisig) {
      console.log(`${name} is already owned by ${multisig}`);
    } else {
      console.log(`Transferring ownership of ${name} to ${multisig}`);

      const tx = await contract.transferOwnership(multisig, { nonce });
      txs.push(tx);

      nonce++;
    }
  }

  if (txs.length > 0) {
    await Promise.all(txs.map((tx) => tx.wait()));
    console.log(`Successfully executed all transactions`);
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
