const ProtocolMathTester = artifacts.require("./ProtocolMathTester.sol");

contract("ProtocolMathTester", async (accounts) => {
  let protocolMathTester;
  beforeEach("deploy tester", async () => {
    protocolMathTester = await ProtocolMathTester.new();
  });

  const checkFunction = async (func, cond, params) => {
    assert.equal(await protocolMathTester[func](...params), cond(...params));
  };

  it("max works if a > b", async () => {
    await checkFunction("callMax", (a, b) => Math.max(a, b), [2, 1]);
  });

  it("max works if a = b", async () => {
    await checkFunction("callMax", (a, b) => Math.max(a, b), [2, 2]);
  });

  it("max works if a < b", async () => {
    await checkFunction("callMax", (a, b) => Math.max(a, b), [1, 2]);
  });
});
