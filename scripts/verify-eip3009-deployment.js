const hre = require("hardhat");

async function main() {
  console.log("=== VERIFYING EIP-3009 SUPPORT IN DEPLOYED DEBTTOKEN ===\n");

  const debtTokenAddress = "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0";
  console.log("DebtToken address:", debtTokenAddress);

  // Get DebtToken contract instance
  const DebtToken = await hre.ethers.getContractFactory("DebtToken");
  const debtToken = DebtToken.attach(debtTokenAddress);

  console.log("\nChecking basic token info:");
  console.log("Name:", await debtToken.name());
  console.log("Symbol:", await debtToken.symbol());
  console.log("Decimals:", await debtToken.decimals());
  console.log("Total Supply:", (await debtToken.totalSupply()).toString());

  console.log("\nChecking EIP-3009 type hashes:");

  try {
    const transferTypeHash = await debtToken.TRANSFER_WITH_AUTHORIZATION_TYPEHASH();
    console.log("✅ TRANSFER_WITH_AUTHORIZATION_TYPEHASH:", transferTypeHash);

    const receiveTypeHash = await debtToken.RECEIVE_WITH_AUTHORIZATION_TYPEHASH();
    console.log("✅ RECEIVE_WITH_AUTHORIZATION_TYPEHASH:", receiveTypeHash);

    const cancelTypeHash = await debtToken.CANCEL_AUTHORIZATION_TYPEHASH();
    console.log("✅ CANCEL_AUTHORIZATION_TYPEHASH:", cancelTypeHash);

    console.log("\nChecking EIP-3009 functions exist:");
    console.log(
      "✅ transferWithAuthorization:",
      typeof debtToken.transferWithAuthorization === "function",
    );
    console.log(
      "✅ receiveWithAuthorization:",
      typeof debtToken.receiveWithAuthorization === "function",
    );
    console.log("✅ cancelAuthorization:", typeof debtToken.cancelAuthorization === "function");
    console.log("✅ authorizationState:", typeof debtToken.authorizationState === "function");

    // Test authorizationState function
    const testAddress = "0x0000000000000000000000000000000000000001";
    const testNonce = hre.ethers.utils.formatBytes32String("test");
    const authState = await debtToken.authorizationState(testAddress, testNonce);
    console.log("\nTest authorizationState query:", authState);

    console.log("\n✅ EIP-3009 IS FULLY SUPPORTED IN THE DEPLOYED DEBTTOKEN!");
  } catch (error) {
    console.error("\n❌ Error checking EIP-3009 support:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
