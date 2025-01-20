const { TestHelper: th } = require("../../utils/testHelpers.js");
const dec = th.dec;

const externalAddrs = {
  // https://docs.tellor.io/tellor/the-basics/contracts-reference#calibration
  TELLOR_MASTER: "0xb2CB696fE5244fB9004877e58dcB680cB86Ba444",
  // https://docs.pyth.network/price-feeds/contract-addresses/evm
  PYTH_PRICE_FEED: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  PYTH_PRICE_ID: "0x150ac9b959aee0051e4091f0ef5216d941f590e1c5e7f91cf7635b5c11628c0e",
  // https://github.com/sushiswap/v2-core/tree/master/deployments/filecoin
  UNISWAP_V2_FACTORY: undefined,
  UNISWAP_V2_ROUTER02: undefined,
  // https://calibration.filfox.info/en/address/0xaC26a4Ab9cF2A8c5DBaB6fb4351ec0F4b07356c4
  WRAPPED_NATIVE_TOKEN: "0xaC26a4Ab9cF2A8c5DBaB6fb4351ec0F4b07356c4",
};

const walletAddrs = {
  ADMIN: "0xe96D28Fe3E959FE7721624B56e2A4d40C3213D3d",
  DEPLOYER: "0xDBA767F3DFF3835BEf5dE1eDEe91A9901402AB21",
  MULTISIG: "0xff0000000000000000000000000000000001AEBc",
};

const walletF1Addrs = {
  DEPLOYER: "t1meo2ogyes4cy26dfvp7pjotmozapliirat3jvvy",
};

const walletF2Addrs = {
  MULTISIG: "t2b3v3bp55krpaqz24fxmlgggbz3gaik6fv5f7ryy",
};

const allocationAmounts = {
  ADMIN: dec(6_700_000, 18),
  UNIPOOL: dec(100_000, 18),
  COMMUNITY_ISSUANCE: dec(3_200_000, 18),
};

const annualAllocationSettings = {
  RATE: dec(4, 16), // 4%
  RECIPIENT: walletAddrs.ADMIN,
};

const beneficiaries = {
  TEST_INVESTOR_A: "0xdad05aa3bd5a4904eb2a9482757be5da8d554b3d",
  TEST_INVESTOR_B: "0x625b473f33b37058bf8b9d4c3d3f9ab5b896996a",
  TEST_INVESTOR_C: "0x9ea530178b9660d0fae34a41a02ec949e209142e",
  TEST_INVESTOR_D: "0xffbb4f4b113b05597298b9d8a7d79e6629e726e8",
  TEST_INVESTOR_E: "0x89ff871dbcd0a456fe92db98d190c38bc10d1cc1",
};

const GAS_COMPENSATION = dec(20, 18); // 20 USDFC
const MIN_NET_DEBT = dec(180, 18); // 180 USDFC
const BOOTSTRAP_PERIOD = 1 * 24 * 60 * 60; // 1 day
const PRICE_FEED_TIMEOUT = 24 * 60 * 60; // 1 day
const ETHERSCAN_BASE_URL = undefined;

module.exports = {
  externalAddrs,
  walletAddrs,
  walletF1Addrs,
  walletF2Addrs,
  allocationAmounts,
  annualAllocationSettings,
  beneficiaries,
  ETHERSCAN_BASE_URL,
  GAS_COMPENSATION,
  MIN_NET_DEBT,
  BOOTSTRAP_PERIOD,
  PRICE_FEED_TIMEOUT,
};
