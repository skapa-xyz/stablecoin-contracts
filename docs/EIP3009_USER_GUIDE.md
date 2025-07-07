# EIP-3009 User Guide for USDFC

## Overview

EIP-3009 (Transfer With Authorization) enables gasless token transfers for USDFC. This allows users to transfer tokens without holding ETH/FIL for gas fees, improving accessibility and user experience.

## Key Benefits

1. **Gasless Transfers**: Recipients don't need ETH/FIL to receive tokens
2. **Batched Operations**: Multiple transfers can be executed in one transaction
3. **Time-Bounded**: Authorizations can have expiration dates
4. **Cancellable**: Unused authorizations can be cancelled
5. **Front-running Protected**: `receiveWithAuthorization` prevents interception

## How It Works

1. **Alice** (token holder) signs an off-chain authorization message
2. **Bob** (recipient) or a **Relayer** submits the authorization on-chain
3. The contract verifies the signature and executes the transfer
4. Alice pays no gas; the submitter pays the gas

## Functions Overview

### transferWithAuthorization
Anyone can submit a signed authorization to transfer tokens.

```solidity
function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
)
```

### receiveWithAuthorization
Only the recipient can submit the authorization (prevents front-running).

```solidity
function receiveWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
)
```

### cancelAuthorization
Cancel an unused authorization.

```solidity
function cancelAuthorization(
    address authorizer,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
)
```

## Usage Examples

### Example 1: Basic Gasless Transfer

```javascript
const { ethers } = require('ethers');

// Connect to USDFC contract
const usdfc = new ethers.Contract(USDFC_ADDRESS, USDFC_ABI, provider);

// Parameters
const from = "0xAlice...";
const to = "0xBob...";
const value = ethers.utils.parseUnits("100", 18); // 100 USDFC
const validAfter = 0; // Valid immediately
const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
const nonce = ethers.utils.randomBytes(32); // Random nonce

// Create authorization message
const domain = {
  name: "USD for Filecoin Community",
  version: "1",
  chainId: await provider.getNetwork().chainId,
  verifyingContract: USDFC_ADDRESS
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

const message = {
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce
};

// Alice signs the message
const aliceSigner = new ethers.Wallet(ALICE_PRIVATE_KEY);
const signature = await aliceSigner._signTypedData(domain, types, message);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Anyone can submit the transaction
const tx = await usdfc.transferWithAuthorization(
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
  v,
  r,
  s
);

await tx.wait();
console.log("Transfer completed!");
```

### Example 2: Recipient-Only Transfer

```javascript
// Same setup as above, but use different type hash
const types = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

// Alice signs
const signature = await aliceSigner._signTypedData(domain, types, message);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Only Bob can submit this
const bobSigner = new ethers.Wallet(BOB_PRIVATE_KEY, provider);
const usdfcAsBob = usdfc.connect(bobSigner);

const tx = await usdfcAsBob.receiveWithAuthorization(
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
  v,
  r,
  s
);
```

### Example 3: Cancelling an Authorization

```javascript
// Parameters for cancellation
const authorizer = "0xAlice...";
const nonceToCancel = "0x..."; // The nonce to cancel

const cancelTypes = {
  CancelAuthorization: [
    { name: "authorizer", type: "address" },
    { name: "nonce", type: "bytes32" }
  ]
};

const cancelMessage = {
  authorizer,
  nonce: nonceToCancel
};

// Alice signs the cancellation
const cancelSignature = await aliceSigner._signTypedData(domain, cancelTypes, cancelMessage);
const { v, r, s } = ethers.utils.splitSignature(cancelSignature);

// Submit cancellation
const tx = await usdfc.cancelAuthorization(
  authorizer,
  nonceToCancel,
  v,
  r,
  s
);
```

## Integration Guide for Relayers

### Setting Up a Relayer Service

```javascript
class USDFCRelayer {
  constructor(provider, relayerPrivateKey, usdfcAddress) {
    this.provider = provider;
    this.relayerWallet = new ethers.Wallet(relayerPrivateKey, provider);
    this.usdfc = new ethers.Contract(usdfcAddress, USDFC_ABI, this.relayerWallet);
  }

  async relayTransfer(authorizationData) {
    const {
      from, to, value, validAfter, validBefore, nonce, v, r, s
    } = authorizationData;

    // Check if authorization was already used
    const isUsed = await this.usdfc.authorizationState(from, nonce);
    if (isUsed) {
      throw new Error("Authorization already used");
    }

    // Check time bounds
    const now = Math.floor(Date.now() / 1000);
    if (now < validAfter) {
      throw new Error("Authorization not yet valid");
    }
    if (now > validBefore) {
      throw new Error("Authorization expired");
    }

    // Estimate gas
    const gasEstimate = await this.usdfc.estimateGas.transferWithAuthorization(
      from, to, value, validAfter, validBefore, nonce, v, r, s
    );

    // Add 10% buffer
    const gasLimit = gasEstimate.mul(110).div(100);

    // Submit transaction
    const tx = await this.usdfc.transferWithAuthorization(
      from, to, value, validAfter, validBefore, nonce, v, r, s,
      { gasLimit }
    );

    return tx;
  }
}
```

## Best Practices

### For Users

1. **Nonce Management**: Use random 32-byte values for nonces
2. **Time Bounds**: Set reasonable expiration times (e.g., 1-24 hours)
3. **Verify Recipients**: Double-check recipient addresses before signing
4. **Track Authorizations**: Keep records of signed authorizations
5. **Cancel Unused**: Cancel authorizations you no longer need

### For Developers

1. **Signature Validation**: Always verify signatures before submission
2. **Error Handling**: Handle all revert reasons gracefully
3. **Gas Estimation**: Always estimate gas before submission
4. **Nonce Generation**: Use cryptographically secure random nonces
5. **State Checking**: Check authorization state before submission

### Security Considerations

1. **Phishing**: Only sign authorizations on trusted websites
2. **Amount Verification**: Always verify transfer amounts before signing
3. **Time Bounds**: Use appropriate validity periods
4. **Cancellation**: Have a process to quickly cancel if needed
5. **Private Keys**: Never share private keys with relayer services

## Common Use Cases

### 1. Onboarding New Users
New users can receive USDFC without having FIL for gas:
- Existing user creates authorization
- New user provides their address
- Onboarding service submits the transfer

### 2. Batch Payments
Companies can pay multiple recipients efficiently:
- Company signs multiple authorizations
- Payment processor submits all transfers in batch
- Gas costs consolidated to single payer

### 3. Scheduled Transfers
Time-locked transfers for vesting or payments:
- Set `validAfter` to future timestamp
- Recipient or service submits when valid
- Automatic execution at specified time

### 4. Emergency Recovery
Users can pre-sign emergency transfers:
- Sign authorization with long validity
- Store securely offline
- Use if primary wallet is compromised

## Troubleshooting

### "Authorization already used"
- Each nonce can only be used once
- Generate a new random nonce and create new authorization

### "Authorization not yet valid"
- Current time is before `validAfter`
- Wait until the valid time or create new authorization

### "Authorization expired"
- Current time is after `validBefore`
- Create new authorization with updated time bounds

### "Invalid signature"
- Ensure correct domain separator parameters
- Verify signer address matches `from` parameter
- Check signature encoding (v, r, s)

### "Cannot transfer to protocol contracts"
- USDFC prevents transfers to system contracts
- Use protocol-specific functions instead

## Resources

- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
- [Example Implementation](https://github.com/skapa-xyz/stablecoin-contracts)
- [Type Hash Constants](#type-hashes)

## Type Hashes

```solidity
// TransferWithAuthorization
0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267

// ReceiveWithAuthorization  
0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8

// CancelAuthorization
0x158b0a9edf7a828aad02f63cd515c68ef2f50ba807396f6d12842833a1597429
```