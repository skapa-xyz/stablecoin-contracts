const fs = require("fs");
const path = require("path");

// Function to recursively find all .json files in artifacts/contracts
function findContractArtifacts(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip test contracts and dependencies
      if (!file.includes("TestContracts") && !file.includes("Dependencies")) {
        findContractArtifacts(filePath, fileList);
      }
    } else if (file.endsWith(".json") && !file.endsWith(".dbg.json")) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Function to extract license from source file
function extractLicense(sourceName) {
  try {
    const sourcePath = path.join(__dirname, "..", sourceName);
    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath, "utf8");
      const licenseMatch = content.match(/SPDX-License-Identifier:\s*(.+)/);
      if (licenseMatch) {
        return licenseMatch[1].trim();
      }
    }
  } catch (error) {
    console.error(`Error reading source file ${sourceName}:`, error.message);
  }
  return "Unknown";
}

// Function to extract relevant metadata from contract artifact
function extractContractMetadata(artifactPath) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  return {
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    license: extractLicense(artifact.sourceName),
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
    linkReferences: artifact.linkReferences || {},
    deployedLinkReferences: artifact.deployedLinkReferences || {},
    compiler: extractCompilerInfo(artifact),
  };
}

// Function to extract compiler information from artifact
function extractCompilerInfo(artifact) {
  if (artifact.metadata) {
    try {
      const metadata = JSON.parse(artifact.metadata);
      return {
        version: metadata.compiler.version,
        settings: metadata.settings,
      };
    } catch (e) {
      // Fallback if metadata parsing fails
    }
  }

  return null;
}

// Function to load deployment information
function loadDeploymentInfo() {
  const deploymentInfo = {};

  // Load mainnet deployments
  const mainnetDeployPath = path.join(__dirname, "..", "deployments", "outputs", "mainnet.json");
  if (fs.existsSync(mainnetDeployPath)) {
    const mainnetData = JSON.parse(fs.readFileSync(mainnetDeployPath, "utf8"));
    deploymentInfo.mainnet = mainnetData;
  }

  // Load testnet deployments
  const testnetDeployPath = path.join(__dirname, "..", "deployments", "outputs", "testnet.json");
  if (fs.existsSync(testnetDeployPath)) {
    const testnetData = JSON.parse(fs.readFileSync(testnetDeployPath, "utf8"));
    deploymentInfo.testnet = testnetData;
  }

  return deploymentInfo;
}

// Main function to generate comprehensive metadata
function generateFullMetadata() {
  const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
  const outputPath = path.join(__dirname, "..", "metadata-full.json");

  // Find all contract artifacts
  const artifactFiles = findContractArtifacts(artifactsDir);

  // Extract metadata for each contract
  const contracts = {};
  let compilerVersion = "0.7.6"; // default

  artifactFiles.forEach((artifactPath) => {
    try {
      const metadata = extractContractMetadata(artifactPath);

      // Skip interfaces and abstract contracts (they don't have bytecode)
      if (metadata.bytecode && metadata.bytecode !== "0x") {
        contracts[metadata.contractName] = metadata;

        // Try to get compiler version from contract metadata
        if (metadata.compiler && metadata.compiler.version) {
          compilerVersion = metadata.compiler.version;
        }
      }
    } catch (error) {
      console.error(`Error processing ${artifactPath}:`, error.message);
    }
  });

  // Load deployment information
  const deployments = loadDeploymentInfo();

  // Create comprehensive metadata object
  const fullMetadata = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    compiler: {
      version: compilerVersion,
      settings: {
        optimizer: {
          enabled: true,
          runs: 100,
        },
      },
    },
    contracts: contracts,
    deployments: deployments,
    networks: {
      mainnet: {
        chainId: 314,
        name: "Filecoin Mainnet",
      },
      testnet: {
        chainId: 314159,
        name: "Filecoin Calibration Testnet",
      },
    },
  };

  // Write metadata to file
  fs.writeFileSync(outputPath, JSON.stringify(fullMetadata, null, 2));

  console.log(`Full metadata generated successfully!`);
  console.log(`Total contracts: ${Object.keys(contracts).length}`);
  console.log(`Output: ${outputPath}`);

  // List all contracts included
  console.log("\nIncluded contracts:");
  Object.keys(contracts).forEach((name) => {
    console.log(`  - ${name}`);
  });

  // Show deployment status
  console.log("\nDeployment status:");
  if (deployments.mainnet) {
    console.log("  - Mainnet: ✓");
  } else {
    console.log("  - Mainnet: ✗");
  }
  if (deployments.testnet) {
    console.log("  - Testnet: ✓");
  } else {
    console.log("  - Testnet: ✗");
  }
}

// Run the script
generateFullMetadata();
