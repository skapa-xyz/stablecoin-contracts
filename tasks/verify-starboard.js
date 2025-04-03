const { task } = require("hardhat/config");
const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");
const {
  fetchVerify,
  getBuildInfo,
  createFormData,
} = require("@starboardventures/hardhat-verify/dist/src/common");
const { readFileSync } = require("fs");
const path = require("path");

const verifyContract = async (network, name, contractAddress, logSuffix = "", buildInfo) => {
  const formData = await createFormData(
    name,
    buildInfo || (await getBuildInfo(name, hre.artifacts)),
  );

  const verifyRes = await fetchVerify({
    network: network === "mainnet" ? "Mainnet" : "Calibration",
    contractName: name,
    contractAddress,
    body: formData,
  });
  const res = await verifyRes.json();

  if (res && res.code === 0) {
    console.log("Verified:", `${name} ${logSuffix}`);
  } else {
    if (res.message === "contract has been verified") {
      console.log("Contract already verified:", `${name} ${logSuffix}`);
    } else {
      throw new Error(res?.message || "Failed to verify contract");
    }
  }
};

task("verify-starboard", "Verify and register contracts on Starboard").setAction(
  async (_, { ethers, network }) => {
    const networkName = network.name === "localhost" ? "testnet" : network.name;
    const configParams = require(`../deployments/inputs/${networkName}.js`);
    const deployer = (await ethers.getSigners())[0];
    const mdh = new HardhatDeploymentHelper(configParams, deployer);
    const deploymentState = mdh.loadPreviousDeployment();

    const filePaths = [
      "Dependencies/PythCaller.sol",
      "Dependencies/TellorCaller.sol",
      "ActivePool.sol",
      "BorrowerOperations.sol",
      "CollSurplusPool.sol",
      "DebtToken.sol",
      "DefaultPool.sol",
      "GasPool.sol",
      "HintHelpers.sol",
      "MultiTroveGetter.sol",
      "PriceFeed.sol",
      "SortedTroves.sol",
      "StabilityPool.sol",
      "TroveManager.sol",
      "LPRewards/Unipool.sol",
      "ProtocolToken/CommunityIssuance.sol",
      "ProtocolToken/LockupContractFactory.sol",
      "ProtocolToken/ProtocolToken.sol",
      "ProtocolToken/ProtocolTokenStaking.sol",
    ];

    for (const filePath of filePaths) {
      const fileName = filePath.split("/").pop().replace(".sol", "");
      const deploymentKey = fileName.charAt(0).toLocaleLowerCase() + fileName.slice(1);
      const contractAddress = deploymentState[deploymentKey].address;

      const buildInfo = await getBuildInfo(fileName, hre.artifacts);

      const isUpgradeable =
        buildInfo[fileName].abi.findIndex(
          (item) => item.type === "function" && item.name === "initialize",
        ) !== -1;

      if (isUpgradeable) {
        const implementationContractAddress =
          await hre.upgrades.erc1967.getImplementationAddress(contractAddress);

        await verifyContract(
          network.name,
          fileName,
          implementationContractAddress,
          "(Implementation)",
        );

        // const buildInfo = await getBuildInfo("TransparentUpgradeableProxy", hre.artifacts);
        // writeFileSync(path.join("tasks", "buildInfo.json"), JSON.stringify(buildInfo, null, 2));
        const buildInfo = JSON.parse(
          readFileSync(`./tasks/utils/buildInfo/TransparentUpgradeableProxy.json`),
        );

        await verifyContract(
          network.name,
          "TransparentUpgradeableProxy",
          contractAddress,
          "(Proxy)",
          buildInfo,
        );
      } else {
        await verifyContract(network.name, fileName, contractAddress);
      }
    }
  },
);
