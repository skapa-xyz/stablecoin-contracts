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

## Tests

```sh
# unit test
$ npm run test

# coverage test
$ npm run coverage

# gas cost test
$ npm run test ./gasTest/*.js

# fuzzing test: Hardhat
$ npm run test ./fuzzTests/PoolManager_AllDepositorsCanWithdrawTest.js

# fuzzing test: Echidna
$ rm -f fuzzTests/corpus/* # (optional)
$ docker pull ghcr.io/crytic/echidna/echidna:v2.2.5 --platform linux/amd64
$ docker run --rm --platform linux/amd64 -it -v `pwd`:/src ghcr.io/crytic/echidna/echidna bash -c "solc-select install 0.7.6 && solc-select use 0.7.6 && echidna /src/contracts/TestContracts/EchidnaTester.sol --config /src/fuzzTests/echidna_config.yaml --corpus-dir 'src/fuzzTests/corpus'"

# fuzzing test: Echidna(debug)
$ npm run test ./fuzzTests/echidna_debug.js -- --config hardhat.config.echidna.js

# Slither
$ docker run --rm --platform linux/amd64 -it -w /src -v `pwd`:/src "trailofbits/eth-security-toolbox":nightly-20241209 bash -c "solc-select install 0.7.6 && solc-select use 0.7.6 && slither . --config-file slither.config.json --exclude-informational > slither.log 2>&1"

# Mythril
$ docker run --rm --platform linux/amd64  -it -w /src -v `pwd`:/src mythril/myth:0.24.8 scripts/mythril.sh
```

## Directories

- `contracts` - The core back end smart contracts written in Solidity
- `deployments` - Deployment scripts, inputs, and outputs for the smart contracts
- `test` - JS test suite for the system. Tests run in Mocha/Chai
- `tests` - Python test suite for the system. Tests run in Brownie
- `gasTest` - Non-assertive tests that return gas costs for protocol operations under various scenarios
- `fuzzTests` - Echidna tests, and naive "random operation" tests
- `utils` - external Hardhat and node scripts - deployment helpers, gas calculators, etc
