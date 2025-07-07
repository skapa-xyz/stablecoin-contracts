const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Function to calculate keccak256 hash (using SHA256 as placeholder)
function keccak256(content) {
  return "0x" + crypto.createHash("sha256").update(content).digest("hex");
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
  return "UNLICENSED";
}

// Function to get all source files for a contract
function getSourceFiles(mainSourceName) {
  const sources = {};
  const sourcePath = path.join(__dirname, "..", mainSourceName);

  if (fs.existsSync(sourcePath)) {
    const content = fs.readFileSync(sourcePath, "utf8");
    sources[mainSourceName] = {
      keccak256: keccak256(content),
      license: extractLicense(mainSourceName),
      urls: [], // Could add IPFS/Swarm hashes here
    };
  }

  return sources;
}

// Function to extract compiler info and settings from artifact
function extractCompilerInfo(artifact) {
  let version = "0.7.6";
  let settings = {
    optimizer: {
      enabled: true,
      runs: 100,
    },
    evmVersion: "istanbul",
  };

  if (artifact.metadata) {
    try {
      const metadata = JSON.parse(artifact.metadata);
      version = metadata.compiler.version;
      settings = metadata.settings || settings;
    } catch (e) {
      console.error("Error parsing metadata:", e.message);
    }
  }

  return { version, settings };
}

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

// Main function to generate metadata.json
function generateMetadata() {
  const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
  const outputPath = path.join(__dirname, "..", "metadata.json");

  // Find all contract artifacts
  const artifactFiles = findContractArtifacts(artifactsDir);

  // Collect all sources and contracts
  const allSources = {};
  const contracts = {};
  let mainCompilerVersion = "0.7.6";
  let mainSettings = {};

  artifactFiles.forEach((artifactPath) => {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

      // Skip interfaces and abstract contracts (they don't have bytecode)
      if (!artifact.bytecode || artifact.bytecode === "0x") {
        return;
      }

      const contractName = artifact.contractName;
      const { version, settings } = extractCompilerInfo(artifact);

      // Update main compiler info
      mainCompilerVersion = version;
      mainSettings = settings;

      // Add sources
      const sources = getSourceFiles(artifact.sourceName);
      Object.assign(allSources, sources);

      // Add contract info
      contracts[contractName] = {
        abi: artifact.abi,
        evm: {
          bytecode: {
            object: artifact.bytecode,
            opcodes: artifact.opcodes || "",
            sourceMap: artifact.sourceMap || "",
            linkReferences: artifact.linkReferences || {},
          },
          deployedBytecode: {
            object: artifact.deployedBytecode,
            opcodes: artifact.deployedOpcodes || "",
            sourceMap: artifact.deployedSourceMap || "",
            linkReferences: artifact.deployedLinkReferences || {},
          },
          methodIdentifiers: artifact.methodIdentifiers || {},
        },
        metadata: artifact.rawMetadata || "",
        userdoc: artifact.userdoc || {
          kind: "user",
          methods: {},
          version: 1,
        },
        devdoc: artifact.devdoc || {
          kind: "dev",
          methods: {},
          version: 1,
        },
      };
    } catch (error) {
      console.error(`Error processing ${artifactPath}:`, error.message);
    }
  });

  // Create Remix-compatible metadata object
  const metadata = {
    version: "1",
    language: "Solidity",
    compiler: {
      version: mainCompilerVersion,
    },
    sources: allSources,
    settings: mainSettings,
    output: {
      contracts: {},
    },
  };

  // Organize contracts by source file
  artifactFiles.forEach((artifactPath) => {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

      if (!artifact.bytecode || artifact.bytecode === "0x") {
        return;
      }

      const contractName = artifact.contractName;
      const sourceName = artifact.sourceName;

      if (contracts[contractName]) {
        if (!metadata.output.contracts[sourceName]) {
          metadata.output.contracts[sourceName] = {};
        }

        metadata.output.contracts[sourceName][contractName] = contracts[contractName];
      }
    } catch (error) {
      console.error(`Error organizing ${artifactPath}:`, error.message);
    }
  });

  // Write metadata to file
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

  console.log(`Metadata generated successfully!`);
  console.log(`Total contracts: ${Object.keys(contracts).length}`);
  console.log(`Output: ${outputPath}`);

  // List all contracts included
  console.log("\nIncluded contracts:");
  Object.keys(contracts).forEach((name) => {
    console.log(`  - ${name}`);
  });
}

// Run the script
generateMetadata();
