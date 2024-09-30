# Stablecoin Contracts

## Deployment

```sh
# localhost
$ npx hardhat node --network hardhat
$ npx hardhat run --network localhost mainnetDeployment/testnetDeployment.js

# testnet
$ npx hardhat run --network testnet mainnetDeployment/testnetDeployment.js

# mainnet
$ npx hardhat run --network mainnet mainnetDeployment/mainnetDeployment.js
```

## Directories

- `contracts` - The core back end smart contracts written in Solidity
- `test` - JS test suite for the system. Tests run in Mocha/Chai
- `tests` - Python test suite for the system. Tests run in Brownie
- `gasTest` - Non-assertive tests that return gas costs for Liquity operations under various scenarios
- `fuzzTests` - Echidna tests, and naive "random operation" tests
- `migrations` - contains Hardhat script for deploying the smart contracts to the blockchain
- `utils` - external Hardhat and node scripts - deployment helpers, gas calculators, etc