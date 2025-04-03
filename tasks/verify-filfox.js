const axios = require("axios");
const { readFileSync } = require("fs");
const { task } = require("hardhat/config");

const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");

const API_URLS = {
  mainnet: "https://filfox.info/api/v1/tools/verifyContract",
  testnet: "https://calibration.filfox.info/api/v1/tools/verifyContract",
};

const verifyContract = async (
  network,
  name,
  contractAddress,
  optimizeRuns,
  compiler,
  sourceFiles,
) => {
  const opts = {
    headers: { "Content-Type": "application/json" },
  };

  const body = {
    address: contractAddress,
    language: "Solidity",
    compiler,
    optimize: true,
    optimizeRuns,
    optimizerDetails: "",
    sourceFiles,
    evmVersion: "default",
    viaIR: false,
    libraries: "",
  };

  const res = await axios.post(API_URLS[network], body, opts);

  if (res.data.success) {
    console.log("Verified:", name);
  } else {
    if (res.data.errorCode === 6) {
      console.log("Contract already verified:", name);
    } else {
      console.log("res:", res);
      throw new Error("Contract verification failed");
    }
  }
};

task("verify-filfox", "Verify and register contracts on Filfox").setAction(
  async (_, { run, ethers, network, upgrades }) => {
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
      let contractAddress = deploymentState[deploymentKey].address;

      const content = await run("flatten:get-flattened-sources", {
        files: [`./contracts/${filePath}`],
      });
      const isUpgradeable = content.includes("Upgradeable");

      if (isUpgradeable) {
        const proxyContractAddress = contractAddress;
        contractAddress = await upgrades.erc1967.getImplementationAddress(proxyContractAddress);
        const content = readFileSync(
          `./tasks/utils/flattened/TransparentUpgradeableProxy.sol`,
          "utf8",
        );

        await verifyContract(
          networkName,
          `${fileName} (Proxy)`,
          proxyContractAddress,
          undefined,
          "v0.8.9+commit.e5eed63a",
          {
            ["TransparentUpgradeableProxy.sol"]: { content },
          },
        );
      }

      await verifyContract(
        networkName,
        isUpgradeable ? `${fileName} (Implementation)` : fileName,
        contractAddress,
        100,
        "v0.7.6+commit.7338295f",
        {
          [`${fileName}.sol`]: { content },
        },
      );
    }
  },
);
