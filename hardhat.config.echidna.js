require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("solidity-coverage");
require("hardhat-gas-reporter");

const accountsList = [
  {
    privateKey: "0x60ddFE7f579aB6867cbE7A2Dc03853dC141d7A4aB6DBEFc0Dae2d2B1Bd4e487F",
    balance: "1000000000000000000000000000000000000",
  },
];

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.4.23",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: accountsList,
      gas: 1000000000, // tx gas limit
      blockGasLimit: 1000000000,
      gasPrice: 20000000000,
      allowUnlimitedContractSize: true,
    },
  },
  mocha: { timeout: 12000000 },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
};
