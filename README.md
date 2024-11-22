# Stablecoin Contracts

## Deployment

```sh
# localhost
$ npx hardhat node --fork <NODE_URL>
$ npx hardhat run --network localhost deployments/deploy.js

# testnet
$ npx hardhat run --network testnet deployments/deploy.js
$ npx hardhat run --network testnet deployments/deploy-mock-price-feed.js

# mainnet
$ npx hardhat run --network mainnet deployments/deploy.js
```

## Token Allocation

```sh
# localhost
$ hpx hardhat run --network localhost deployments/allocate.js

# testnet
$ npx hardhat run --network testnet deployments/allocate.js

# mainnet
$ npx hardhat run --network mainnet deployments/allocate.js
```

## Directories

- `contracts` - The core back end smart contracts written in Solidity
- `deployments` - Deployment scripts, inputs, and outputs for the smart contracts
- `test` - JS test suite for the system. Tests run in Mocha/Chai
- `tests` - Python test suite for the system. Tests run in Brownie
- `gasTest` - Non-assertive tests that return gas costs for protocol operations under various scenarios
- `fuzzTests` - Echidna tests, and naive "random operation" tests
- `utils` - external Hardhat and node scripts - deployment helpers, gas calculators, etc
