const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");
const hre = require("hardhat");

async function main(configParams) {
  const date = new Date();
  console.log(date.toUTCString());
  const deployerWallet = (await ethers.getSigners())[0];
  const mdh = new HardhatDeploymentHelper(configParams, deployerWallet);
  const deploymentState = mdh.loadPreviousDeployment();
  const contractNames = process.env.UPGRADE_CONTRACTS?.split(",") ?? [];
  const constructorBaseArgs = [configParams.GAS_COMPENSATION, configParams.MIN_NET_DEBT];

  const constructorArgsObj = {
    PriceFeed: [configParams.PRICE_FEED_TIMEOUT],
    TroveManager: [...constructorBaseArgs, configParams.BOOTSTRAP_PERIOD],
    StabilityPool: constructorBaseArgs,
    BorrowerOperations: constructorBaseArgs,
    HintHelpers: constructorBaseArgs,
  };

  for (const name of contractNames) {
    const factory = await mdh.getFactory(name);
    const deploymentKey = name.charAt(0).toLocaleLowerCase() + name.slice(1);

    await mdh.upgradeProxy(factory, deploymentKey, deploymentState, constructorArgsObj[name]);
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
