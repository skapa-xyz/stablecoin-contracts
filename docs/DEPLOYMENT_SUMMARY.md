# Deployment Summary

## Current Status

We have successfully deployed contracts to Filecoin Calibration testnet, but they are not properly initialized due to gas limit issues on the network.

### Deployed Contracts (Not Initialized)

| Contract | Address | Status |
|----------|---------|--------|
| DebtToken | `0xDD806863C002370717ee78be9C921b4b3f2588F7` | ✅ Deployed with EIP-3009 |
| TroveManager | `0xEb197638bECCdF83Ebeb48E46e6492Ed02447152` | ❌ Not initialized |
| BorrowerOperations | `0x1B92fA90d6760973A22d6FD6197b835fF9f5F638` | ❌ Not initialized |
| ActivePool | `0xb09e099a97BD7Fc50549c96B22965B45a6d458A8` | ❌ Not initialized |
| StabilityPool | `0xB079682Dc1946Ce762a9aa7dADa3ED5168D4AF1b` | ❌ Not initialized |
| PriceFeed | `0x6C246D135926BBE64d92568eC83457C8F28Cb47f` | ⚠️ Possibly initialized |
| PythCaller | `0x43d3A420DEE180C6826d5cfBa9b4956D6e4B4386` | ✅ Deployed |
| TellorCaller | `0x80a3Ef81AA6A8C677fCf7B6c472D3A944140b2e4` | ✅ Deployed |

## Key Achievement
✅ **DebtToken with EIP-3009 support is successfully deployed!**

The DebtToken at `0xDD806863C002370717ee78be9C921b4b3f2588F7` has full EIP-3009 support including:
- `transferWithAuthorization`
- `receiveWithAuthorization`
- `cancelAuthorization`
- Public type hashes for verification

## The Issue

The contracts cannot be initialized because:
1. Filecoin testnet has gas limit constraints that cause initialization transactions to fail
2. Once a proxy contract is deployed without initialization, it cannot be initialized if it hits certain conditions
3. The contracts have circular dependencies that require all addresses to be known before initialization

## Solutions

### Option 1: Use Existing DebtToken (Recommended for EIP-3009 Testing)
The DebtToken is functional for EIP-3009 operations even without the full protocol. You can:
- Test gasless transfers using `transferWithAuthorization`
- Verify signature-based operations
- Demonstrate EIP-3009 functionality

### Option 2: Deploy to Different Network
Deploy to a network with more flexible gas limits:
- Ethereum Sepolia testnet
- Polygon Mumbai
- Local Hardhat network

### Option 3: Modified Deployment Strategy
1. Deploy contracts in smaller batches
2. Use manual gas management
3. Deploy with pre-initialized state

## Contract Addresses for UI Configuration

```json
{
  "pythCaller": "0x43d3A420DEE180C6826d5cfBa9b4956D6e4B4386",
  "tellorCaller": "0x80a3Ef81AA6A8C677fCf7B6c472D3A944140b2e4",
  "priceFeed": "0x6C246D135926BBE64d92568eC83457C8F28Cb47f",
  "sortedTroves": "0x0561d6445839c94034502aDbbEf9691281DF12a6",
  "troveManager": "0xEb197638bECCdF83Ebeb48E46e6492Ed02447152",
  "activePool": "0xb09e099a97BD7Fc50549c96B22965B45a6d458A8",
  "stabilityPool": "0xB079682Dc1946Ce762a9aa7dADa3ED5168D4AF1b",
  "gasPool": "0xd41E6c02f5908b16EB86E739Fe7A60FAa5b1FB4f",
  "defaultPool": "0x3415365AFcB539d903D1BD94eB11c54a814C67E7",
  "collSurplusPool": "0x588917De4e059f648a1cF16167042a07DE341264",
  "borrowerOperations": "0x1B92fA90d6760973A22d6FD6197b835fF9f5F638",
  "hintHelpers": "0x8f944A13E7Af70a9259aFD691dc438b96EB6e493",
  "debtToken": "0xDD806863C002370717ee78be9C921b4b3f2588F7"
}
```

## EIP-3009 Testing

You can test EIP-3009 functionality directly with the DebtToken:

```javascript
// Example: Check EIP-3009 support
const debtToken = await ethers.getContractAt("DebtToken", "0xDD806863C002370717ee78be9C921b4b3f2588F7");

// Get type hashes
const transferTypeHash = await debtToken.TRANSFER_WITH_AUTHORIZATION_TYPEHASH();
// Returns: 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267

// Check authorization state
const authState = await debtToken.authorizationState(userAddress, nonce);
```

## Next Steps

1. **For EIP-3009 Demo**: Use the deployed DebtToken to demonstrate gasless transfers
2. **For Full Protocol**: Consider deploying to a different network or working with Filecoin team to resolve gas limits
3. **For UI**: Update configuration to handle uninitialized contract state gracefully