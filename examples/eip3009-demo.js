#!/usr/bin/env node

const { ethers } = require("ethers");

// Configuration
const USDFC_ADDRESS = process.env.USDFC_ADDRESS || "0x..."; // Update with actual address
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

// USDFC ABI (only EIP-3009 functions)
const USDFC_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  "event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

class EIP3009Demo {
  constructor(provider, usdfcAddress) {
    this.provider = provider;
    this.usdfc = new ethers.Contract(usdfcAddress, USDFC_ABI, provider);
  }

  async createTransferAuthorization(signer, to, amount, validityHours = 24) {
    const from = await signer.getAddress();
    const value = ethers.utils.parseUnits(amount.toString(), 18);
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + validityHours * 3600;
    const nonce = ethers.utils.randomBytes(32);

    // Get contract details for domain
    const name = await this.usdfc.name();
    const version = await this.usdfc.version();
    const chainId = await signer.getChainId();

    const domain = {
      name,
      version,
      chainId,
      verifyingContract: this.usdfc.address,
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const message = {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await signer._signTypedData(domain, types, message);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    return {
      from,
      to,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce,
      v,
      r,
      s,
      signature,
      message,
    };
  }

  async submitTransferAuthorization(submitter, authorization) {
    const usdfcWithSigner = this.usdfc.connect(submitter);

    const tx = await usdfcWithSigner.transferWithAuthorization(
      authorization.from,
      authorization.to,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      authorization.nonce,
      authorization.v,
      authorization.r,
      authorization.s,
    );

    return tx;
  }

  async checkAuthorizationState(authorizer, nonce) {
    return await this.usdfc.authorizationState(authorizer, nonce);
  }

  async getBalance(address) {
    const balance = await this.usdfc.balanceOf(address);
    return ethers.utils.formatUnits(balance, 18);
  }
}

// Demo script
async function main() {
  console.log("EIP-3009 Demo for USDFC\n");

  // Setup provider
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const demo = new EIP3009Demo(provider, USDFC_ADDRESS);

  // For demo purposes, we'll use two test accounts
  // In production, these would be separate users
  const alice = new ethers.Wallet(
    process.env.ALICE_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey,
    provider,
  );
  const bob = new ethers.Wallet(
    process.env.BOB_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey,
    provider,
  );

  console.log("Alice address:", alice.address);
  console.log("Bob address:", bob.address);
  console.log();

  // Check initial balances
  const aliceBalance = await demo.getBalance(alice.address);
  const bobBalance = await demo.getBalance(bob.address);

  console.log("Initial balances:");
  console.log(`Alice: ${aliceBalance} USDFC`);
  console.log(`Bob: ${bobBalance} USDFC`);
  console.log();

  // Example 1: Create and submit a transfer authorization
  console.log("Example 1: Gasless Transfer");
  console.log("Alice authorizes transfer of 100 USDFC to Bob");

  try {
    // Alice creates authorization
    const authorization = await demo.createTransferAuthorization(
      alice,
      bob.address,
      100, // 100 USDFC
      1, // Valid for 1 hour
    );

    console.log("Authorization created:");
    console.log(`- From: ${authorization.from}`);
    console.log(`- To: ${authorization.to}`);
    console.log(`- Amount: ${ethers.utils.formatUnits(authorization.value, 18)} USDFC`);
    console.log(`- Valid until: ${new Date(authorization.validBefore * 1000).toLocaleString()}`);
    console.log(`- Nonce: ${authorization.nonce}`);
    console.log();

    // Bob (or anyone) can submit the transfer
    console.log("Bob submits the authorization...");
    const tx = await demo.submitTransferAuthorization(bob, authorization);
    console.log(`Transaction submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log();

    // Check final balances
    const aliceBalanceAfter = await demo.getBalance(alice.address);
    const bobBalanceAfter = await demo.getBalance(bob.address);

    console.log("Final balances:");
    console.log(`Alice: ${aliceBalanceAfter} USDFC`);
    console.log(`Bob: ${bobBalanceAfter} USDFC`);
    console.log();

    // Check authorization state
    const isUsed = await demo.checkAuthorizationState(alice.address, authorization.nonce);
    console.log(`Authorization used: ${isUsed}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run demo if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { EIP3009Demo };
