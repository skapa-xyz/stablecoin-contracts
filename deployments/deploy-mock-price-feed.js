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

  const [priceFeed] = await Promise.all(
    ["PriceFeed"].map(async (name) => {
      const factory = await ethers.getContractFactory(name, deployerWallet);
      const deploymentKey = name.charAt(0).toLocaleLowerCase() + name.slice(1);
      return new ethers.Contract(
        deploymentState[deploymentKey].address,
        factory.interface,
        deployerWallet,
      );
    }),
  );

  const price = await priceFeed.lastGoodPrice();

  const mockAggregator = await mdh.loadOrDeploy(
    await mdh.getFactory("MockAggregator"),
    "mockAggregator",
    deploymentState,
  );
  const mockPriceFeed = await mdh.upgradeProxy(
    await mdh.getFactory("MockPriceFeed"),
    "priceFeed",
    deploymentState,
    [configParams.PRICE_FEED_TIMEOUT],
  );

  await mdh.sendAndWaitForTransaction(
    mockPriceFeed.setPriceAggregator(mockAggregator.address, price),
  );
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
