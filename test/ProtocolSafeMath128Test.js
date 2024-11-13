const testHelpers = require("../utils/testHelpers.js");
const th = testHelpers.TestHelper;

contract("ProtocolSafeMath128Tester", async () => {
  let mathTester;

  beforeEach(async () => {
    const mathTesterFactory = await ethers.getContractFactory("ProtocolSafeMath128Tester");
    mathTester = await mathTesterFactory.deploy();
  });

  it("add(): reverts if overflows", async () => {
    const MAX_UINT_128 = th.toBN(2).pow(th.toBN(128)).sub(th.toBN(1));
    await th.assertRevert(
      mathTester.add(MAX_UINT_128, 1),
      "ProtocolSafeMath128: addition overflow",
    );
  });

  it("sub(): reverts if underflows", async () => {
    await th.assertRevert(mathTester.sub(1, 2), "ProtocolSafeMath128: subtraction overflow");
  });
});
