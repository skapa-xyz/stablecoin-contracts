const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Function to calculate keccak256 hash
function keccak256(content) {
  // For simplicity, using SHA256 as a placeholder
  // In production, use a proper keccak256 implementation
  return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

// Function to extract license from source file
function extractLicense(sourcePath) {
  try {
    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath, "utf8");
      const licenseMatch = content.match(/SPDX-License-Identifier:\s*(.+)/);
      if (licenseMatch) {
        return licenseMatch[1].trim();
      }
    }
  } catch (error) {
    console.error(`Error reading source file ${sourcePath}:`, error.message);
  }
  return "UNLICENSED";
}

// Function to extract compiler settings from artifact
function extractCompilerSettings(artifact) {
  if (artifact.metadata) {
    try {
      const metadata = JSON.parse(artifact.metadata);
      return metadata.settings || {};
    } catch (e) {
      console.error("Error parsing metadata:", e.message);
    }
  }

  // Default settings
  return {
    optimizer: {
      enabled: true,
      runs: 100,
      details: {
        peephole: true,
        jumpdestRemover: true,
        orderLiterals: false,
        deduplicate: false,
        cse: false,
        constantOptimizer: false,
        yul: true,
      },
    },
    evmVersion: "istanbul",
    metadata: {
      useLiteralContent: true,
      bytecodeHash: "ipfs",
    },
  };
}

// Function to generate Remix-compatible metadata for a contract
function generateContractMetadata(contractName, artifactPath) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Skip if no bytecode (interface or abstract contract)
  if (!artifact.bytecode || artifact.bytecode === "0x") {
    return null;
  }

  const sourcePath = path.join(__dirname, "..", artifact.sourceName);
  const sourceContent = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
  const license = extractLicense(sourcePath);

  // Extract compiler version
  let compilerVersion = "0.7.6";
  if (artifact.metadata) {
    try {
      const metadata = JSON.parse(artifact.metadata);
      compilerVersion = metadata.compiler.version;
    } catch (e) {}
  }

  // Build sources object
  const sources = {};
  sources[artifact.sourceName] = {
    keccak256: keccak256(sourceContent),
    license: license,
    urls: [], // Could add IPFS/Swarm hashes here
  };

  // Extract compiler settings
  const settings = extractCompilerSettings(artifact);

  // Add compilation target
  settings.compilationTarget = {};
  settings.compilationTarget[artifact.sourceName] = contractName;

  // Extract library references if any
  if (artifact.linkReferences && Object.keys(artifact.linkReferences).length > 0) {
    settings.libraries = {};
    // Note: Actual library addresses would need to be provided
  }

  // Build the metadata object
  const metadata = {
    version: "1",
    language: "Solidity",
    compiler: {
      version: compilerVersion,
    },
    sources: sources,
    settings: settings,
    output: {
      abi: artifact.abi,
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
    },
  };

  return metadata;
}

// Main function to generate Remix-compatible metadata
function generateRemixMetadata() {
  const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
  const outputDir = path.join(__dirname, "..", "remix-metadata");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Function to recursively find all contract artifacts
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
        fileList.push({ path: filePath, name: path.basename(file, ".json") });
      }
    });

    return fileList;
  }

  // Find all contract artifacts
  const artifactFiles = findContractArtifacts(artifactsDir);

  console.log("Generating Remix-compatible metadata...\n");

  let generatedCount = 0;
  const contractsList = [];

  artifactFiles.forEach(({ path: artifactPath, name: contractName }) => {
    try {
      const metadata = generateContractMetadata(contractName, artifactPath);

      if (metadata) {
        // Write individual metadata file for each contract
        const outputPath = path.join(outputDir, `${contractName}_metadata.json`);
        fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

        generatedCount++;
        contractsList.push(contractName);
        console.log(`✓ Generated metadata for ${contractName}`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${contractName}:`, error.message);
    }
  });

  // Also create a combined metadata file
  const combinedMetadata = {};
  contractsList.forEach((contractName) => {
    const metadataPath = path.join(outputDir, `${contractName}_metadata.json`);
    combinedMetadata[contractName] = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  });

  const combinedPath = path.join(outputDir, "combined_metadata.json");
  fs.writeFileSync(combinedPath, JSON.stringify(combinedMetadata, null, 2));

  console.log(`\nMetadata generation complete!`);
  console.log(`Total contracts processed: ${generatedCount}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Combined metadata: ${combinedPath}`);
}

// Run the script
generateRemixMetadata();
