# Stablecoin Contracts - USDFC

USDFC is a USD-pegged stablecoin minted using Filecoin as collateral on the Filecoin Virtual Machine (FVM).

## Quick Start

1. Use established node version by running `nvm use`
2. Refer to `.env.sample` and create `.env`.
3. Install repository dependencies by running `npm install`
4. Execute `npm run test` to run the tests.

## Deployment

```sh
$ npx hardhat run --network mainnet deployments/deploy.js
```

## Scripts

```sh
# Set a mock contract as PriceFeed
$ npx hardhat run --network testnet deployments/deploy-mock-price-feed.js

# Allocate tokens
$ npx hardhat run --network mainnet deployments/allocate.js

# Change contract owners
$ npx hardhat run --network mainnet deployments/change-owners.js

# Upgrade contracts
$ UPGRADE_CONTRACTS=SortedTroves,TroveManager npx hardhat run --network mainnet deployments/upgrade-contracts.js
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
- `gasTest` - Non-assertive tests that return gas costs for protocol operations under various scenarios
- `fuzzTests` - Echidna tests, and naive "random operation" tests
- `utils` - external Hardhat and node scripts - deployment helpers, gas calculators, etc
