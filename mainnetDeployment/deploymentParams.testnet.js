const externalAddrs = {
  // https://docs.tellor.io/tellor/the-basics/contracts-reference#calibration
  TELLOR_MASTER: "0xb2CB696fE5244fB9004877e58dcB680cB86Ba444",
  // Pyth
  PYTH_PRICE_FEED: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  PYTH_PRICE_ID: "0x150ac9b959aee0051e4091f0ef5216d941f590e1c5e7f91cf7635b5c11628c0e",
  // https://uniswap.org/docs/v2/smart-contracts/factory/
  UNISWAP_V2_FACTORY: undefined,
  UNISWAP_V2_ROUTER02: undefined,
  // https://calibration.filfox.info/en/address/0xaC26a4Ab9cF2A8c5DBaB6fb4351ec0F4b07356c4
  WRAPPED_NATIVE_TOKEN: "0xaC26a4Ab9cF2A8c5DBaB6fb4351ec0F4b07356c4",
}

const liquityAddrs = {
  GENERAL_SAFE:"0x001D0E50D2ca06647446cED79392d4F3Bce17009", // TODO
  LQTY_SAFE:"0xe96D28Fe3E959FE7721624B56e2A4d40C3213D3d", // TODO
  DEPLOYER: "0xDBA767F3DFF3835BEf5dE1eDEe91A9901402AB21",
}

const beneficiaries = {
  TEST_INVESTOR_A: "0xdad05aa3bd5a4904eb2a9482757be5da8d554b3d",
  TEST_INVESTOR_B: "0x625b473f33b37058bf8b9d4c3d3f9ab5b896996a",
  TEST_INVESTOR_C: "0x9ea530178b9660d0fae34a41a02ec949e209142e",
  TEST_INVESTOR_D: "0xffbb4f4b113b05597298b9d8a7d79e6629e726e8",
  TEST_INVESTOR_E: "0x89ff871dbcd0a456fe92db98d190c38bc10d1cc1"
}

const OUTPUT_FILE = './mainnetDeployment/testnetDeploymentOutput.json'

const delay = ms => new Promise(res => setTimeout(res, ms));
const waitFunction = async () => {
  return delay(90000) // wait 90s
}

const ETHERSCAN_BASE_URL = undefined

module.exports = {
  externalAddrs,
  liquityAddrs,
  beneficiaries,
  OUTPUT_FILE,
  waitFunction,
  ETHERSCAN_BASE_URL,
};
