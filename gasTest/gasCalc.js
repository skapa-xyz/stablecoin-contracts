/* Script that logs gas costs for protocol operations under various conditions. 
  Note: uses Mocha testing structure, but simply prints gas costs of transactions. No assertions.
*/
const fs = require("fs");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const { TestHelper: th, TimeValues: timeValues } = testHelpers;
const dec = th.dec;
const toBN = th.toBN;

const ZERO_ADDRESS = th.ZERO_ADDRESS;
const _100pct = th._100pct;

contract("Gas cost tests", async () => {
  let signers;
  let owner,
    whale,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    _10_Accounts,
    _20_Accounts,
    _30_Accounts,
    _40_Accounts,
    _50_Accounts;
  let bountyAddress, lpRewardsAddress, multisig;

  const address_0 = "0x0000000000000000000000000000000000000000";

  let contracts;

  let priceFeed;
  let debtToken;
  let sortedTroves;
  let troveManager;
  let stabilityPool;
  let borrowerOperations;
  let functionCaller;

  let data = [];

  before(async () => {
    signers = await ethers.getSigners();

    [owner, whale, A, B, C, D, E, F, G, H, I, J] = signers;
    _10_Accounts = signers.slice(0, 10);
    _20_Accounts = signers.slice(0, 20);
    _30_Accounts = signers.slice(0, 30);
    _40_Accounts = signers.slice(0, 40);
    _50_Accounts = signers.slice(0, 50);
    [bountyAddress, lpRewardsAddress, multisig] = signers.slice(997, 1000);
  });

  beforeEach(async () => {
    await hre.network.provider.send("hardhat_reset");

    const transactionCount = await owner.getTransactionCount();
    const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
      owner.address,
      transactionCount + 1,
    );
    contracts = await deploymentHelper.deployProtocolCore(
      th.GAS_COMPENSATION,
      th.MIN_NET_DEBT,
      cpContracts,
    );
    await deploymentHelper.deployProtocolTokenContracts(
      bountyAddress.address,
      lpRewardsAddress.address,
      multisig.address,
      cpContracts,
    );

    priceFeed = contracts.priceFeedTestnet;
    debtToken = contracts.debtToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    stabilityPool = contracts.stabilityPool;
    borrowerOperations = contracts.borrowerOperations;

    functionCaller = contracts.functionCaller;
  });

  // ---TESTS ---

  it("runs the test helper", async () => {
    assert.equal(th.getDifference("2000", "1000"), 1000);
  });

  it("helper - getBorrowerOpsListHint(): returns the right position in the list", async () => {
    // Accounts A - J open troves at sequentially lower ICR
    await borrowerOperations
      .connect(A)
      .openTrove(_100pct, dec(100, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(B)
      .openTrove(_100pct, dec(102, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(C)
      .openTrove(_100pct, dec(104, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(D)
      .openTrove(_100pct, dec(106, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(E)
      .openTrove(_100pct, dec(108, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(F)
      .openTrove(_100pct, dec(110, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(G)
      .openTrove(_100pct, dec(112, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(H)
      .openTrove(_100pct, dec(114, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(I)
      .openTrove(_100pct, dec(116, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });
    await borrowerOperations
      .connect(J)
      .openTrove(_100pct, dec(118, 18), ZERO_ADDRESS, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });

    for (account of [A, B, C, D, E, F, G, H, I, J]) {
      console.log(th.squeezeAddr(account.address));
    }

    // Between F and G
    let amount = dec(111, 18);
    let fee = await troveManager.getBorrowingFee(amount);
    let debt = (await th.getCompositeDebt(contracts, amount)).add(fee);
    let { upperHint, lowerHint } = await th.getBorrowerOpsListHint(
      contracts,
      dec(10, "ether"),
      debt,
    );

    assert.equal(upperHint, F.address);
    assert.equal(lowerHint, G.address);

    // Bottom of the list
    amount = dec(120, 18);
    fee = await troveManager.getBorrowingFee(amount);
    debt = (await th.getCompositeDebt(contracts, amount)).add(fee);
    ({ upperHint, lowerHint } = await th.getBorrowerOpsListHint(contracts, dec(10, "ether"), debt));

    assert.equal(upperHint, J.address);
    assert.equal(lowerHint, ZERO_ADDRESS);

    // Top of the list
    amount = dec(98, 18);
    fee = await troveManager.getBorrowingFee(amount);
    debt = (await th.getCompositeDebt(contracts, amount)).add(fee);
    ({ upperHint, lowerHint } = await th.getBorrowerOpsListHint(contracts, dec(10, "ether"), debt));

    assert.equal(upperHint, ZERO_ADDRESS);
    assert.equal(lowerHint, A.address);
  });

  // --- Trove Manager function calls ---

  // --- openTrove() ---

  // it("", async () => {
  //   const message = 'openTrove(), single account, 0 existing Troves in system. Adds 10 ether and issues 100 token'
  //   const tx = await borrowerOperations.openTrove(_100pct, dec(100, 18), signers[2], ZERO_ADDRESS, { from: signers[2], value: dec(10, 'ether') })
  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'openTrove(), single account, 1 existing Trove in system. Adds 10 ether and issues 100 token'
  //   await borrowerOperations.openTrove(_100pct, dec(100, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(10, 'ether') })

  //   const tx = await borrowerOperations.openTrove(_100pct, dec(100, 18), signers[2], ZERO_ADDRESS, { from: signers[2], value: dec(10, 'ether') })
  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'openTrove(), single account, Inserts between 2 existing CDs in system. Adds 10 ether and issues 80 token. '

  //   await borrowerOperations.openTrove(_100pct, dec(100, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(10, 'ether') })
  //   await borrowerOperations.openTrove(_100pct, dec(50, 18), signers[2], ZERO_ADDRESS, { from: signers[2], value: dec(10, 'ether') })

  //   const tx = await borrowerOperations.openTrove(_100pct, dec(80, 18), signers[3], ZERO_ADDRESS, { from: signers[3], value: dec(10, 'ether') })

  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'openTrove(), 10 signers, each account adds 10 ether and issues 100 token'

  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = 0
  //   const gasResults = await th.openTrove_allAccounts(_10_Accounts, contracts, amountFIL, amountDebtToken)
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'openTrove(), 10 signers, each account adds 10 ether and issues less token than the previous one'
  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = 200
  //   const gasResults = await th.openTrove_allAccounts_decreasingDebtTokenAmounts(_10_Accounts, contracts, amountFIL, amountDebtToken)
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message = "openTrove(), 50 signers, each account adds random ether and random token";
    const amountFIL = dec(10, "ether");
    const amountDebtToken = 0;
    const gasResults = await th.openTrove_allAccounts_randomFIL_randomDebtToken(
      1,
      9,
      _50_Accounts,
      contracts,
      2,
      100,
      true,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- adjustTrove ---

  // it("", async () => {
  //   const message = 'adjustTrove(). FIL/token Increase/Increase. 10 signers, each account adjusts up -  1 ether and 100 token'
  //   await borrowerOperations.openTrove(_100pct, 0, signers[999].address , ZERO_ADDRESS, { from: signers[999], value: dec(100, 'ether') })

  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = dec(100, 18)
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, amountFIL, amountDebtToken)

  //   const amountFIL_2 = dec(1, 'ether')
  //   const amountDebtToken_2 = dec(100, 18)
  //   const gasResults = await th.adjustTrove_allAccounts(_10_Accounts, contracts, amountFIL_2, amountDebtToken_2)

  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'adjustTrove(). FIL/token Decrease/Decrease. 10 signers, each account adjusts down by 0.1 ether and 10 token'
  //   await borrowerOperations.openTrove(_100pct, 0, signers[999].address , ZERO_ADDRESS, { from: signers[999], value: dec(100, 'ether') })

  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = dec(100, 18)
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, amountFIL, amountDebtToken)

  //   const amountFIL_2 = "-100000000000000000"  // coll decrease of 0.1 FIL
  //   const amountDebtToken_2 = "-10000000000000000000" // debt decrease of 10 token
  //   const gasResults = await th.adjustTrove_allAccounts(_10_Accounts, contracts, amountFIL_2, amountDebtToken_2)

  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'adjustTrove(). FIL/token Increase/Decrease. 10 signers, each account adjusts up by 0.1 ether and down by 10 token'
  //   await borrowerOperations.openTrove(_100pct, 0, signers[999].address , ZERO_ADDRESS, { from: signers[999], value: dec(100, 'ether') })

  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = dec(100, 18)
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, amountFIL, amountDebtToken)

  //   const amountFIL_2 = "100000000000000000"  // coll increase of 0.1 FIL
  //   const amountDebtToken_2 = "-10000000000000000000" // debt decrease of 10 token
  //   const gasResults = await th.adjustTrove_allAccounts(_10_Accounts, contracts, amountFIL_2, amountDebtToken_2)

  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'adjustTrove(). 30 signers, each account adjusts up by random amounts. No size range transition'
  //   await borrowerOperations.openTrove(_100pct, 0, signers[999].address , ZERO_ADDRESS, { from: signers[999], value: dec(100, 'ether') })

  //   const amountFIL = dec(10, 'ether')
  //   const amountDebtToken = dec(100, 18)
  //   await th.openTrove_allAccounts(_30_Accounts, contracts, amountFIL, amountDebtToken)

  //   // Randomly add between 1-9 FIL, and withdraw 1-100 token
  //   const gasResults = await th.adjustTrove_allAccounts_randomAmount(_30_Accounts, contracts, 1, 9, 1, 100)

  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "adjustTrove(). 40 signers, each account adjusts up by random amounts. HAS size range transition";
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, 0, signers[999].address, ZERO_ADDRESS, {
        value: dec(100, "ether"),
      });

    const amountFIL = dec(9, "ether");
    const amountDebtToken = dec(100, 18);
    await th.openTrove_allAccounts(_40_Accounts, contracts, amountFIL, amountDebtToken);
    // Randomly add between 1-9 FIL, and withdraw 1-100 token
    const gasResults = await th.adjustTrove_allAccounts_randomAmount(
      _40_Accounts,
      contracts,
      1,
      9,
      1,
      100,
    );

    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- closeTrove() ---

  it("", async () => {
    const message = "closeTrove(), 10 signers, 1 account closes its trove";

    await th.openTrove_allAccounts_decreasingDebtTokenAmounts(
      _10_Accounts,
      contracts,
      dec(10, "ether"),
      200,
    );

    for (account of _10_Accounts) {
      await debtToken.unprotectedMint(account.address, dec(1000, 18));
    }

    const tx = await borrowerOperations.connect(signers[1]).closeTrove();
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "closeTrove(), 20 signers, each account adds 10 ether and issues less debt token than the previous one. First 10 signers close their trove. ";

    await th.openTrove_allAccounts_decreasingDebtTokenAmounts(
      _20_Accounts,
      contracts,
      dec(10, "ether"),
      200,
    );

    for (account of _20_Accounts) {
      await debtToken.unprotectedMint(account.address, dec(1000, 18));
    }

    const gasResults = await th.closeTrove_allAccounts(_20_Accounts.slice(1), contracts);

    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- addColl() ---

  // it("", async () => {
  //   const message = 'addColl(), second deposit, 0 other Troves in system. Adds 10 ether'
  //   await th.openTrove_allAccounts([signers[2]], contracts, dec(10, 'ether'), 0)

  //   const tx = await borrowerOperations.addColl(signers[2], signers[2], { from: signers[2], value: dec(10, 'ether') })
  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'addColl(), second deposit, 10 existing Troves in system. Adds 10 ether'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)

  //   await th.openTrove_allAccounts([signers[99]], contracts, dec(10, 'ether'), 0)
  //   const tx = await borrowerOperations.addColl(signers[99], signers[99], { from: signers[99], value: dec(10, 'ether') })
  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'addColl(), second deposit, 10 signers, each account adds 10 ether'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)

  //   const gasResults = await th.addColl_allAccounts(_10_Accounts, contracts, dec(10, 'ether'))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "addColl(), second deposit, 30 signers, each account adds random amount. No size range transition";
    const amount = dec(10, "ether");
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);

    const gasResults = await th.addColl_allAccounts_randomAmount(
      0.000000001,
      10000,
      _30_Accounts,
      contracts,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- withdrawColl() ---

  // it("", async () => {
  //   const message = 'withdrawColl(), first withdrawal. 10 signers in system. 1 account withdraws 5 ether'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)

  //   const tx = await borrowerOperations.withdrawColl(dec(5, 'ether'), signers[9], ZERO_ADDRESS, { from: signers[9] })
  //   const gas = await th.gasUsed(tx)
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'withdrawColl(), first withdrawal, 10 signers, each account withdraws 5 ether'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)

  //   const gasResults = await th.withdrawColl_allAccounts(_10_Accounts, contracts, dec(5, 'ether'))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'withdrawColl(), second withdrawal, 10 signers, each account withdraws 5 ether'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawColl_allAccounts(_10_Accounts, contracts, dec(1, 'ether'))

  //   const gasResults = await th.withdrawColl_allAccounts(_10_Accounts, contracts, dec(5, 'ether'))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "withdrawColl(), first withdrawal, 30 signers, each account withdraws random amount. HAS size range transition";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);

    const gasResults = await th.withdrawColl_allAccounts_randomAmount(
      1,
      8,
      _30_Accounts,
      contracts,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message =
      "withdrawColl(), second withdrawal, 10 signers, each account withdraws random amount";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawColl_allAccounts(_10_Accounts, contracts, dec(1, "ether"));

    const gasResults = await th.withdrawColl_allAccounts_randomAmount(
      1,
      8,
      _10_Accounts,
      contracts,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- withdrawDebtToken() ---

  // it("", async () => {
  //   const message = 'withdrawDebtToken(), first withdrawal, 10 signers, each account withdraws 100 token'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)

  //   const gasResults = await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'withdrawDebtToken(), second withdrawal, 10 signers, each account withdraws 100 token'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))

  //   const gasResults = await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "withdrawDebtToken(), first withdrawal, 30 signers, each account withdraws a random debt token amount";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);

    const gasResults = await th.withdrawDebtToken_allAccounts(1, 180, _30_Accounts, contracts);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message =
      "withdrawDebtToken(), second withdrawal, 30 signers, each account withdraws a random debt token amount";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18));

    const gasResults = await th.withdrawDebtToken_allAccounts(1, 70, _30_Accounts, contracts);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- repayDebtToken() ---

  // it("", async () => {
  //   const message = 'repayDebtToken(), partial repayment, 10 signers, repay 30 token (of 100 token)'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))

  //   const gasResults = await th.repayDebtToken_allAccounts(_10_Accounts, contracts, dec(30, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'repayDebtToken(), second partial repayment, 10 signers, repay 30 token (of 70 token)'
  //   await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18))
  //   await th.repayDebtToken_allAccounts(_30_Accounts, contracts, dec(30, 18))

  //   const gasResults = await th.repayDebtToken_allAccounts(_30_Accounts, contracts, dec(30, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "repayDebtToken(), partial repayment, 30 signers, repay random amount of token (of 100 token)";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18));

    const gasResults = await th.repayDebtToken_allAccounts_randomAmount(
      1,
      99,
      _30_Accounts,
      contracts,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // it("", async () => {
  //   const message = 'repayDebtToken(), first repayment, 10 signers, repay in full (100 of 100 token)'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))

  //   const gasResults = await th.repayDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message = "repayDebtToken(), first repayment, 30 signers, repay in full (50 of 50 token)";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18));
    await th.repayDebtToken_allAccounts(_30_Accounts, contracts, dec(50, 18));

    const gasResults = await th.repayDebtToken_allAccounts(_30_Accounts, contracts, dec(50, 18));
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- getCurrentICR() ---

  it("", async () => {
    const message = "single getCurrentICR() call";

    await th.openTrove_allAccounts([signers[1]], contracts, dec(10, "ether"), 0);
    const randDebtTokenAmount = th.randAmountInWei(1, 180);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, randDebtTokenAmount, signers[1].address, ZERO_ADDRESS);

    const price = await priceFeed.getPrice();
    const tx = await functionCaller.troveManager_getCurrentICR(signers[1].address, price);

    const gas = (await th.gasUsed(tx)) - 21000;
    th.logGas(gas, message);
  });

  it("", async () => {
    const message = "getCurrentICR(), new Troves with 10 ether and no withdrawals";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message = "getCurrentICR(), Troves with 10 ether and 100 token withdrawn";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message = "getCurrentICR(), Troves with 10 ether and random debt token amount withdrawn";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(1, 1300, _10_Accounts, contracts);

    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- getCurrentICR() with pending distribution rewards ---

  it("", async () => {
    const message = "single getCurrentICR() call, WITH pending rewards";

    const randDebtTokenAmount = th.randAmountInWei(1, 180);
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, randDebtTokenAmount, signers[1].address, ZERO_ADDRESS, {
        value: dec(10, "ether"),
      });

    // acct 999 adds coll, withdraws token, sits at 111% ICR
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(130, 18), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[999]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[999].address);

    const price = await priceFeed.getPrice();
    const tx = await functionCaller.troveManager_getCurrentICR(signers[1].address, price);

    const gas = (await th.gasUsed(tx)) - 21000;
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "getCurrentICR(), new Troves with 10 ether and no withdrawals,  WITH pending rewards";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), dec(100, 18));

    // acct 999 adds coll, withdraws token, sits at 111% ICR
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(130, 18), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[999]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[999].address);

    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message =
      "getCurrentICR(), Troves with 10 ether and 100 token withdrawn, WITH pending rewards";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), dec(100, 18));

    // acct 999 adds coll, withdraws token, sits at 111% ICR
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(130, 18), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[999]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[999].address);

    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message =
      "getCurrentICR(), Troves with 10 ether and random debt token amount withdrawn, WITH pending rewards";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), dec(100, 18));

    // acct 999 adds coll, withdraws token, sits at 111% ICR
    await borrowerOperations
      .connect(signers[999])
      .openTrove(_100pct, dec(130, 18), signers[999].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[999]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[999].address);

    const gasResults = await th.getCurrentICR_allAccounts(_10_Accounts, contracts, functionCaller);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- redeemCollateral() ---
  it("", async () => {
    const message =
      "redeemCollateral(), redeems 50 token, redemption hits 1 Trove. One account in system, partial redemption";
    await th.openTrove_allAccounts([signers[0]], contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts([signers[0]], contracts, dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(signers[0], contracts, dec(50, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeems 50 token, redemption hits 1 Trove. No pending rewards. 3 signers in system, partial redemption";
    // 3 signers add coll
    await th.openTrove_allAccounts(signers.slice(0, 3), contracts, dec(10, "ether"), 0);
    // 3 signers withdraw successively less token
    await borrowerOperations
      .connect(signers[0])
      .withdrawDebtToken(_100pct, dec(100, 18), signers[0].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(90, 18), signers[1].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(80, 18), signers[2].address, ZERO_ADDRESS);

    /* Account 2 redeems 50 token. It is redeemed from account 0's Trove, 
    leaving the Trove active with 30 token and ((200 *10 - 50 ) / 200 ) = 9.75 FIL. 
    
    It's ICR jumps from 2500% to 6500% and it is reinserted at the top of the list.
    */

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(signers[2], contracts, dec(50, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 101 token, redemption hits 2 Troves, last redemption is partial";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 500 token, redeems 101 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(500, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(101, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 500 token, redemption hits 5 Troves, all full redemptions";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 500 token, redeems 500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(500, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(500, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 450 token, redemption hits 5 Troves,  last redemption is partial (50 of 100 token)";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 450 token, redeems 500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(450, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(450, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message = "redeemCollateral(), redeemed 1000 token, redemption hits 10 Troves";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 1000 token, redeems 500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(1000, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(1000, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message = "redeemCollateral(), redeemed 1500 token, redemption hits 15 Troves";
    await th.openTrove_allAccounts(_20_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_20_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 1500 token, redeems 1500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(1500, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(1500, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message = "redeemCollateral(), redeemed 2000 token, redemption hits 20 Troves";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 2000 token, redeems 2000 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(2000, 18), whale.address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(2000, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // Slow test

  // it("", async () => {
  //   const message = 'redeemCollateral(),  token, each redemption only hits the first Trove, never closes it'
  //   await th.addColl_allAccounts(_20_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(_20_Accounts, troveManager, dec(100, 18))

  //   const gasResults = await th.redeemCollateral_allAccounts_randomAmount( 1, 10, _10_Accounts, troveManager)
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // --- redeemCollateral(), with pending redistribution rewards ---

  it("", async () => {
    const message =
      "redeemCollateral(), redeems 50 token, redemption hits 1 Trove, WITH pending rewards. One account in system";
    await th.openTrove_allAccounts([signers[1]], contracts, dec(10, "ether"), 0);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(100, 18), signers[1].address, ZERO_ADDRESS);

    // acct 998 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(signers[1], contracts, dec(50, 18));

    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeems 50 token, redemption hits 1 Trove. WITH pending rewards. 3 signers in system.";
    // 3 signers add coll
    await th.openTrove_allAccounts(signers.slice(0, 3), contracts, dec(10, "ether"), 0);
    // 3 signers withdraw successively less token
    await borrowerOperations
      .connect(signers[0])
      .withdrawDebtToken(_100pct, dec(100, 18), signers[0].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(90, 18), signers[1].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(80, 18), signers[2].address, ZERO_ADDRESS);

    // acct 999 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    /* Account 2 redeems 50 token. It is redeemed from account 0's Trove, 
    leaving the Trove active with 30 token and ((200 *10 - 50 ) / 200 ) = 9.75 FIL. 
    
    It's ICR jumps from 2500% to 6500% and it is reinserted at the top of the list.
    */

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(signers[2], contracts, dec(50, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 500 token, WITH pending rewards, redemption hits 5 Troves, WITH pending rewards";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 500 token, redeems 500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(500, 18), whale.address, ZERO_ADDRESS);

    // acct 998 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(500, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 1000 token, WITH pending rewards, redemption hits 10 Troves, WITH pending rewards";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 1000 token, redeems 500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(1000, 18), whale.address, ZERO_ADDRESS);

    // acct 998 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(1000, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 1500 token, WITH pending rewards, redemption hits 15 Troves, WITH pending rewards";
    await th.openTrove_allAccounts(_20_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_20_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 1500 token, redeems 1500 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(1500, 18), whale.address, ZERO_ADDRESS);

    //  // acct 998 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(1500, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "redeemCollateral(), redeemed 2000 token, WITH pending rewards, redemption hits 20 Troves, WITH pending rewards";
    await th.openTrove_allAccounts(_30_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_30_Accounts, contracts, dec(100, 18));

    // Whale adds 200 ether, withdraws 2000 token, redeems 2000 token
    await borrowerOperations.connect(whale).openTrove(_100pct, 0, whale.address, ZERO_ADDRESS, {
      value: dec(200, "ether"),
    });
    await borrowerOperations
      .connect(whale)
      .withdrawDebtToken(_100pct, dec(2000, 18), whale.address, ZERO_ADDRESS);

    // acct 998 adds coll, withdraws token, sits at 111% ICR
    await th.openTrove_allAccounts([signers[998]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[998])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[998].address, ZERO_ADDRESS);

    // Price drops, account[998]'s ICR falls below MCR, and gets liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[998].address);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_MONTH, web3.currentProvider);
    const gas = await th.redeemCollateral(whale, contracts, dec(2000, 18));
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // Slow test

  // it("", async () => {
  //   const message = 'redeemCollateral(),  token, each redemption only hits the first Trove, never closes it, WITH pending rewards'
  //   await th.addColl_allAccounts(_20_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(_20_Accounts, troveManager, dec(100, 18))

  //    // acct 999 adds coll, withdraws token, sits at 111% ICR
  //    await borrowerOperations.addColl(signers[999], {from: signers[999], value:dec(1, 'ether')})
  //    await borrowerOperations.withdrawDebtToken(_100pct, dec(130, 18), signers[999].address , ZERO_ADDRESS, { from: signers[999]})

  //     // Price drops, account[999]'s ICR falls below MCR, and gets liquidated
  //    await priceFeed.setPrice(dec(100, 18))
  //    await troveManager.liquidate(signers[999].address.address , ZERO_ADDRESS, { from: signers[0]})

  //   const gasResults = await th.redeemCollateral_allAccounts_randomAmount( 1, 10, _10_Accounts, troveManager)
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // --- getApproxHint() ---

  // it("", async () => {
  //   const message = 'getApproxHint(), numTrials = 10, 10 calls, each with random CR'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0 )
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, borrowerOperations)

  //   gasCostList = []

  //   for (i = 0; i < 10; i++) {
  //     randomCR = th.randAmountInWei(1, 5)
  //     const tx = await functionCaller.troveManager_getApproxHint(randomCR, 10)
  //     const gas = await th.gasUsed(tx) - 21000
  //     gasCostList.push(gas)
  //   }

  //   const gasResults = th.getGasMetrics(gasCostList)
  //   th.logGasMetrics(gasResults)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'getApproxHint(), numTrials = 10:  i.e. k = 1, list size = 1'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0 )
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, borrowerOperations)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 10)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'getApproxHint(), numTrials = 32:  i.e. k = 10, list size = 10'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0 )
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, borrowerOperations)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 32)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'getApproxHint(), numTrials = 100: i.e. k = 10, list size = 100'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0 )
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, borrowerOperations)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 100)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // Slow tests

  // it("", async () => { //8mil. gas
  //   const message = 'getApproxHint(), numTrials = 320: i.e. k = 10, list size = 1000'
  //   await th.addColl_allAccounts(_10_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, troveManager)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 320)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({gas: gas}, message, data)
  // })

  // it("", async () => { // 25mil. gas
  //   const message = 'getApproxHint(), numTrials = 1000:  i.e. k = 10, list size = 10000'
  //   await th.addColl_allAccounts(_10_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, troveManager)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 1000)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({gas: gas}, message, data)
  // })

  // it("", async () => { // 81mil. gas
  //   const message = 'getApproxHint(), numTrials = 3200:  i.e. k = 10, list size = 100000'
  //   await th.addColl_allAccounts(_10_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, troveManager)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 3200)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({gas: gas}, message, data)
  // })

  // Test hangs

  // it("", async () => {
  //   const message = 'getApproxHint(), numTrials = 10000:  i.e. k = 10, list size = 1000000'
  //   await th.addColl_allAccounts(_10_Accounts, troveManager, dec(10, 'ether'))
  //   await th.withdrawDebtToken_allAccounts(1, 180, _10_Accounts, troveManager)

  //   const CR = '200000000000000000000'
  //   tx = await functionCaller.troveManager_getApproxHint(CR, 10000)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({gas: gas}, message, data)
  // })

  // --- provideToSP(): No pending rewards

  // --- First deposit ---

  // it("", async () => {
  //   const message = 'provideToSP(), No pending rewards, part of issued token: all signers withdraw 180 token, all make first deposit, provide 100 token'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18))

  //   // first funds provided
  //   const gasResults = await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(100, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'provideToSP(), No pending rewards, all issued token: all signers withdraw 180 token, all make first deposit, 180 token'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18))

  //   // first funds provided
  //   const gasResults = await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(130, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "provideToSP(), No pending rewards, all signers withdraw 180 token, all make first deposit, random debt token amount";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18));

    // first funds provided
    const gasResults = await th.provideToSP_allAccounts_randomAmount(
      1,
      129,
      _10_Accounts,
      stabilityPool,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- Top-up deposit ---

  it("", async () => {
    const message =
      "provideToSP(), No pending rewards, deposit part of issued token: all signers withdraw 180 token, all make second deposit, provide 50 token";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18));
    await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(50, 18));

    // >>FF time and one account tops up, triggers ProtocolToken gains for all
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
    await stabilityPool.connect(_10_Accounts[0]).provideToSP(dec(1, 18), ZERO_ADDRESS);

    // Check the other signers have ProtocolToken gain
    for (account of _10_Accounts.slice(1)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // top-up of StabilityPool Deposit
    const gasResults = await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(50, 18));
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // it("", async () => {
  //   const message = 'provideToSP(), No pending rewards, deposit all issued token: all signers withdraw 180 token, make second deposit, provide 90 token'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18))
  //   await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(50, 18))

  //   // >> FF time and one account tops up, triggers ProtocolToken gains for all
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)
  //   await stabilityPool.provideToSP(dec(1, 18), ZERO_ADDRESS, { from: _10_Accounts[0] })

  //   // Check the other signers have ProtocolToken gain
  //   for (account of _10_Accounts.slice(1)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // top-up of StabilityPool Deposit
  //   const gasResults = await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(50, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "provideToSP(), No pending rewards, all signers withdraw 180 token, make second deposit, random debt token amount";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(_10_Accounts, contracts, dec(130, 18));
    await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(50, 18));

    // >>FF time and one account tops up, triggers ProtocolToken gains for all
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
    await stabilityPool.connect(_10_Accounts[0]).provideToSP(dec(1, 18), ZERO_ADDRESS);

    // Check the other signers have ProtocolToken gain
    for (account of _10_Accounts.slice(1)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // top-up of StabilityPool Deposit
    const gasResults = await th.provideToSP_allAccounts_randomAmount(
      1,
      50,
      _10_Accounts,
      stabilityPool,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  //   // --- provideToSP(): Pending rewards

  //   // --- Top-up deposit ---

  // it("", async () => {
  //   const message = 'provideToSP(), with pending rewards in system. deposit part of issued token: all signers make second deposit, provide 50 token'
  //   // 9 accts each open Trove with 10 ether, withdraw 180 token, and provide 50 token to Stability Pool
  //   await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(signers.slice(2, 12), contracts, dec(130, 18))
  //   await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(50, 18))

  //   //1 acct open Trove with 1 ether and withdraws 170 token
  //   await borrowerOperations.openTrove(_100pct, dec(130, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(1, 'ether') })

  //   // >>FF time and one account tops up, triggers ProtocolToken gains for all
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // Price drops, account 1 liquidated
  //   await priceFeed.setPrice(dec(100, 18))
  //   await troveManager.liquidate(signers[1].address, { from: signers[0] })
  //   assert.isFalse(await sortedTroves.contains(signers[1]))

  //   // Check signers have ProtocolToken gains from liquidations
  //   for (account of signers.slice(2, 12)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // 9 active Troves top up their Stability Pool deposits with 50 token
  //   const gasResults = await th.provideToSP_allAccounts(signers.slice(2, 11), stabilityPool, dec(50, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // it("", async () => {
  //   const message = 'provideToSP(), with pending rewards in system. deposit all issued token: all signers make second deposit, provide 90 token'
  //   // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 90 token to Stability Pool
  //   await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, 'ether'), 0)
  //   await th.withdrawDebtToken_allAccounts(signers.slice(2, 12), contracts, dec(130, 18))
  //   await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(50, 18))

  //   //1 acct open Trove with 1 ether and withdraws 180 token
  //   await borrowerOperations.openTrove(_100pct, dec(130, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(1, 'ether') })

  //   // >>FF time and one account tops up, triggers ProtocolToken gains for all
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // Price drops, account[1] is liquidated
  //   await priceFeed.setPrice(dec(100, 18))
  //   await troveManager.liquidate(signers[1].address, { from: signers[0] })
  //   assert.isFalse(await sortedTroves.contains(signers[1]))

  //   // Check signers have ProtocolToken gains from liquidations
  //   for (account of signers.slice(2, 12)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // 5 active Troves top up their Stability Pool deposits with 90 token, using up all their issued token
  //   const gasResults = await th.provideToSP_allAccounts(signers.slice(7, 12), stabilityPool, dec(50, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "provideToSP(), with pending rewards in system. deposit part of issued token: all make second deposit, provide random debt token amount";
    // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 90 token to Stability Pool
    await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, "ether"), dec(130, 18));
    await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(50, 18));

    //1 acct open Trove with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // >>FF time and one account tops up, triggers ProtocolToken gains for all
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Price drops, account[1] is liquidated
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[1].address);
    assert.isFalse(await sortedTroves.contains(signers[1]));

    // Check signers have ProtocolToken gains from liquidations
    for (account of signers.slice(2, 12)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // 5 active Troves top up their Stability Pool deposits with a random debt token amount
    const gasResults = await th.provideToSP_allAccounts_randomAmount(
      1,
      49,
      signers.slice(7, 12),
      stabilityPool,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- withdrawFromSP() ---

  // --- No pending rewards ---

  // partial
  // it("", async () => {
  //   const message = 'withdrawFromSP(), no pending rewards. Stability Pool depositors make partial withdrawal - 90 token of 180 token deposit'
  //   await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, 'ether'), dec(190, 18))
  //   await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(130, 18))

  //   // >>FF time and one account tops up, triggers ProtocolToken gains for all
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)
  //   await stabilityPool.provideToSP(dec(1, 18), ZERO_ADDRESS, { from: _10_Accounts[0] })

  //   // Check the other signers have ProtocolToken gain
  //   for (account of _10_Accounts.slice(1)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   const gasResults = await th.withdrawFromSP_allAccounts(_10_Accounts, stabilityPool, dec(90, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  // full
  it("", async () => {
    const message =
      "withdrawFromSP(), no pending rewards. Stability Pool depositors make full withdrawal - 130 token of 130 token deposit";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), dec(190, 18));
    await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(130, 18));

    // >>FF time and one account tops up, triggers ProtocolToken gains for all
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);
    await stabilityPool.connect(_10_Accounts[0]).provideToSP(dec(1, 18), ZERO_ADDRESS);

    // Check the other signers have ProtocolToken gain
    for (account of _10_Accounts.slice(1)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const gasResults = await th.withdrawFromSP_allAccounts(
      _10_Accounts,
      stabilityPool,
      dec(130, 18),
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // random amount
  it("", async () => {
    const message =
      "withdrawFromSP(), no pending rewards. Stability Pool depositors make partial withdrawal - random debt token amount, less than 180 token deposit";
    await th.openTrove_allAccounts(_10_Accounts, contracts, dec(10, "ether"), dec(130, 18));
    await th.provideToSP_allAccounts(_10_Accounts, stabilityPool, dec(130, 18));

    const gasResults = await th.withdrawFromSP_allAccounts_randomAmount(
      1,
      129,
      _10_Accounts,
      stabilityPool,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // // --- withdrawFromSP() ---

  // // --- Pending rewards in system ---

  // it("", async () => {
  //   const message = 'withdrawFromSP(), pending rewards in system. Stability Pool depositors make partial withdrawal - 90 token of 130 token deposit'
  //   // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 180 token to Stability Pool
  //   await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, 'ether'), dec(130, 18))
  //   await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(130, 18))

  //   //1 acct open Trove with 1 ether and withdraws 170 token
  //   await borrowerOperations.openTrove(_100pct, 0, signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(1, 'ether') })
  //   await borrowerOperations.withdrawDebtToken(_100pct, dec(130, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1] })

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // Price drops, account[0]'s ICR falls below MCR
  //   await priceFeed.setPrice(dec(100, 18))
  //   await troveManager.liquidate(signers[1].address, { from: signers[0] })
  //   assert.isFalse(await sortedTroves.contains(signers[1]))

  //   // Check signers have ProtocolToken gains from liquidations
  //   for (account of signers.slice(2, 12)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // 5 active Troves reduce their Stability Pool deposit by 90 token
  //   const gasResults = await th.withdrawFromSP_allAccounts(signers.slice(7, 12), stabilityPool, dec(90, 18))
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "withdrawFromSP(), pending rewards in system. Stability Pool depositors make full withdrawal - 130 token of 130 token deposit";
    // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 180 token to Stability Pool
    await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, "ether"), dec(130, 18));
    await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(130, 18));

    //1 acct open Trove with 1 ether and withdraws 170 token
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, 0, signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Price drops, account[0]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[1].address);
    assert.isFalse(await sortedTroves.contains(signers[1]));

    // Check signers have ProtocolToken gains from liquidations
    for (account of signers.slice(2, 12)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // 5 active Troves reduce their Stability Pool deposit by 130 token
    const gasResults = await th.withdrawFromSP_allAccounts(
      signers.slice(7, 12),
      stabilityPool,
      dec(130, 18),
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  it("", async () => {
    const message =
      "withdrawFromSP(), pending rewards in system. Stability Pool depositors make partial withdrawal - random amount of token";
    // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 130 token to Stability Pool
    await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, "ether"), dec(130, 18));
    await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(130, 18));

    //1 acct open Trove with 1 ether and withdraws 170 token
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, 0, signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Price drops, account[0]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[1].address);
    assert.isFalse(await sortedTroves.contains(signers[1]));

    // Check signers have ProtocolToken gains from liquidations
    for (account of signers.slice(2, 12)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // 5 active Troves reduce their Stability Pool deposit by random amount
    const gasResults = await th.withdrawFromSP_allAccounts_randomAmount(
      1,
      129,
      signers.slice(7, 12),
      stabilityPool,
    );
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- withdrawFILGainToTrove() ---

  // --- withdrawFILGainToTrove() - deposit has pending rewards ---
  // it("", async () => {
  //   const message = 'withdrawFILGainToTrove(), pending rewards in system. Accounts withdraw 180 token, provide 180 token, then withdraw all to SP after a liquidation'
  //   // 10 accts each open Trove with 10 ether, withdraw 180 token, and provide 130 token to Stability Pool
  //   await th.openTrove_allAccounts(signers.slice(2, 12), contracts, dec(10, 'ether'), dec(130, 18))
  //   await th.provideToSP_allAccounts(signers.slice(2, 12), stabilityPool, dec(130, 18))

  //   //1 acct open Trove with 1 ether and withdraws 170 token
  //   await borrowerOperations.openTrove(_100pct, 0, signers[1].address , ZERO_ADDRESS, { from: signers[1], value: dec(1, 'ether') })
  //   await borrowerOperations.withdrawDebtToken(_100pct, dec(130, 18), signers[1].address , ZERO_ADDRESS, { from: signers[1] })

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // Price drops, account[0]'s ICR falls below MCR
  //   await priceFeed.setPrice(dec(100, 18))
  //   await troveManager.liquidate(signers[1].address, { from: signers[0] })
  //   assert.isFalse(await sortedTroves.contains(signers[1]))

  //    // Check signers have ProtocolToken gains from liquidations
  //    for (account of signers.slice(2, 12)) {
  //     const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account)
  //     assert.isTrue(protocolTokenGain.gt(toBN('0')))
  //   }

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider)

  //   // 5 active Troves withdraw their FIL gain to their trove
  //   const gasResults = await th.withdrawFILGainToTrove_allAccounts(signers.slice(7, 12), contracts)
  //   th.logGasMetrics(gasResults, message)
  //   th.logAllGasCosts(gasResults)

  //   th.appendData(gasResults, message, data)
  // })

  it("", async () => {
    const message =
      "withdrawFILGainToTrove(), pending rewards in system. Accounts withdraw 180 token, provide a random amount, then withdraw all to SP after a liquidation";
    // 20 accts each open Trove with 10 ether, withdraw 180 token, and provide 180 token to Stability Pool
    await th.openTrove_allAccounts(signers.slice(2, 22), contracts, dec(10, "ether"), dec(130, 18));
    await await th.provideToSP_allAccounts_randomAmount(
      1,
      129,
      signers.slice(2, 22),
      stabilityPool,
    );

    //1 acct open Trove with 1 ether and withdraws 180 token
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, 0, signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));
    await troveManager.connect(signers[0]).liquidate(signers[1].address);
    assert.isFalse(await sortedTroves.contains(signers[1]));

    // Check signers have ProtocolToken gains from liquidations
    for (account of signers.slice(2, 22)) {
      const protocolTokenGain = await stabilityPool.getDepositorProtocolTokenGain(account);
      assert.isTrue(protocolTokenGain.gt(toBN("0")));
    }

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // 5 active Troves withdraw their FIL gain to their trove
    const gasResults = await th.withdrawFILGainToTrove_allAccounts(signers.slice(2, 22), contracts);
    th.logGasMetrics(gasResults, message);
    th.logAllGasCosts(gasResults);

    th.appendData(gasResults, message, data);
  });

  // --- liquidate() ---

  // Pure redistribution WITH pending rewards
  it("", async () => {
    const message = "Single liquidate() call. Liquidee has pending rewards. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    //6s acct open Trove with 1 ether and withdraw 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(0, 6), contracts, dec(1, "ether"), dec(130, 18));
    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Initial distribution liquidations make system reward terms and Default Pool non-zero
    const tx1 = await troveManager.connect(signers[0]).liquidate(signers[2].address);
    // const gas1 = await th.gasUsed(tx1)
    // th.logGas(gas1, message)
    const tx2 = await troveManager.connect(signers[0]).liquidate(signers[3].address);
    // const gas2 = await th.gasUsed(tx2)
    // th.logGas(gas2, message)

    assert.isTrue(await sortedTroves.contains(signers[1]));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx5 = await troveManager.connect(signers[0]).liquidate(signers[1].address);

    assert.isFalse(await sortedTroves.contains(signers[1]));
    const gas5 = await th.gasUsed(tx5);
    th.logGas(gas5, message);

    th.appendData({ gas: gas5 }, message, data);
  });

  it("", async () => {
    const message =
      "Series of liquidate() calls. Liquidee has pending rewards. Pure redistribution";
    // 100 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 200), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 200), contracts, dec(130, 18));

    const liquidationAcctRange = signers.slice(1, 10);

    // Accts open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(liquidationAcctRange, contracts, dec(1, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(liquidationAcctRange, contracts, dec(130, 18));

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // All troves are liquidated
    for (account of liquidationAcctRange) {
      const hasPendingRewards = await troveManager.hasPendingRewards(account.address);
      console.log("Liquidee has pending rewards: " + hasPendingRewards);

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      const tx = await troveManager.connect(signers[0]).liquidate(account.address);
      assert.isFalse(await sortedTroves.contains(account.address));

      const gas = await th.gasUsed(tx);
      th.logGas(gas, message);
    }

    // th.appendData({gas: gas}, message, data)
  });

  // Pure redistribution with NO pending rewards
  it("", async () => {
    const message = "Single liquidate() call. Liquidee has NO pending rewards. Pure redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    //2 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(2, 4), contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[2].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[3])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[3].address, ZERO_ADDRESS);

    // Price drops
    await priceFeed.setPrice(dec(100, 18));

    // Initial distribution liquidations make system reward terms and DefaultPool non-zero
    const tx1 = await troveManager.connect(signers[0]).liquidate(signers[2].address);
    const tx2 = await troveManager.connect(signers[0]).liquidate(signers[3].address);

    // Account 1 opens trove
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, dec(40, 18), signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(50, 18));

    assert.isTrue(await sortedTroves.contains(signers[1]));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx3 = await troveManager.connect(signers[0]).liquidate(signers[1].address);

    assert.isFalse(await sortedTroves.contains(signers[1]));
    const gas = await th.gasUsed(tx3);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  it("", async () => {
    const message =
      "Series of liquidate() calls. Liquidee has NO pending rewards. Pure redistribution";

    // 10 accts each open Trove with 10 ether, withdraw 180 token

    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    const liquidationAcctRange = signers.slice(1, 20);

    for (account of liquidationAcctRange) {
      await priceFeed.setPrice(dec(200, 18));
      await borrowerOperations
        .connect(account)
        .openTrove(_100pct, dec(130, 18), account.address, ZERO_ADDRESS, {
          value: dec(1, "ether"),
        });

      const hasPendingRewards = await troveManager.hasPendingRewards(account.address);
      console.log("Liquidee has pending rewards: " + hasPendingRewards);

      await priceFeed.setPrice(dec(100, 18));

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

      const tx = await troveManager.connect(signers[0]).liquidate(account.address);

      assert.isFalse(await sortedTroves.contains(account.address));

      const gas = await th.gasUsed(tx);
      th.logGas(gas, message);
    }

    // th.appendData({gas: gas}, message, data)
  });

  // Pure offset with NO pending rewards
  it("", async () => {
    const message = "Single liquidate() call. Liquidee has NO pending rewards. Pure offset with SP";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    //3 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(0, 4), contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[2].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[3])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[3].address, ZERO_ADDRESS);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 100 provides 600 token to pool
    await borrowerOperations
      .connect(signers[100])
      .withdrawDebtToken(_100pct, dec(600, 18), signers[100].address, ZERO_ADDRESS);
    await stabilityPool.connect(signers[100]).provideToSP(dec(600, 18), ZERO_ADDRESS);

    // Initial liquidations - full offset - makes SP reward terms and SP non-zero
    await troveManager.connect(signers[0]).liquidate(signers[2].address);
    await troveManager.connect(signers[0]).liquidate(signers[3].address);

    const hasPendingRewards = await troveManager.hasPendingRewards(signers[1].address);
    console.log("Liquidee has pending rewards: " + hasPendingRewards);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Account 1 liquidated - full offset
    const tx = await troveManager.connect(signers[0]).liquidate(signers[1].address);
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // Pure offset WITH pending rewards
  it("", async () => {
    const message = "Single liquidate() call. Liquidee has pending rewards. Pure offset with SP";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    // 5 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(0, 5), contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[2].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[3])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[3].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[4])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[4].address, ZERO_ADDRESS);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Account 100 provides 360 token to SP
    await borrowerOperations
      .connect(signers[100])
      .withdrawDebtToken(_100pct, dec(600, 18), signers[100].address, ZERO_ADDRESS);
    await stabilityPool.connect(signers[100]).provideToSP(dec(360, 18), ZERO_ADDRESS);

    // Initial liquidations - full offset - makes SP reward terms and SP non-zero
    await troveManager.connect(signers[0]).liquidate(signers[2].address);
    await troveManager.connect(signers[0]).liquidate(signers[3].address);

    // Pure redistribution - creates pending dist. rewards for account 1
    await troveManager.connect(signers[0]).liquidate(signers[4].address);

    // Account 5 provides another 200 to the SP
    await stabilityPool.connect(signers[100]).provideToSP(dec(200, 18), ZERO_ADDRESS);

    const hasPendingRewards = await troveManager.hasPendingRewards(signers[1].address);
    console.log("Liquidee has pending rewards: " + hasPendingRewards);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // Account 1 liquidated - full offset
    const tx = await troveManager.connect(signers[0]).liquidate(signers[1].address);
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // Partial offset + redistribution WITH pending rewards
  it("", async () => {
    const message =
      "Single liquidate() call. Liquidee has pending rewards. Partial offset + redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    //4 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(0, 4), contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[2].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[3])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[3].address, ZERO_ADDRESS);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Set up some "previous" liquidations triggering partial offsets, and pending rewards for all troves
    await stabilityPool.connect(signers[100]).provideToSP(dec(100, 18), ZERO_ADDRESS);
    await troveManager.connect(signers[0]).liquidate(signers[2].address);

    await stabilityPool.connect(signers[101]).provideToSP(dec(100, 18), ZERO_ADDRESS);
    await troveManager.connect(signers[0]).liquidate(signers[3].address);

    // pool refilled with 100 token
    await stabilityPool.connect(signers[102]).provideToSP(dec(100, 18), ZERO_ADDRESS);

    const hasPendingRewards = await troveManager.hasPendingRewards(signers[1].address);
    console.log("Liquidee has pending rewards: " + hasPendingRewards);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // account 1 180 token liquidated  - partial offset
    const tx = await troveManager.connect(signers[0]).liquidate(signers[1].address);
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // Partial offset + redistribution with NO pending rewards
  it("", async () => {
    const message =
      "Single liquidate() call. Liquidee has NO pending rewards. Partial offset + redistribution";
    // 10 accts each open Trove with 10 ether, withdraw 180 token
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 110), contracts, dec(130, 18));

    //2 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts(signers.slice(2, 4), contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[2])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[2].address, ZERO_ADDRESS);
    await borrowerOperations
      .connect(signers[3])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[3].address, ZERO_ADDRESS);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    // Set up some "previous" liquidations that trigger partial offsets,
    //and create pending rewards for all troves
    await stabilityPool.connect(signers[100]).provideToSP(dec(100, 18), ZERO_ADDRESS);
    await troveManager.connect(signers[0]).liquidate(signers[2].address);

    await stabilityPool.connect(signers[101]).provideToSP(dec(100, 18), ZERO_ADDRESS);
    await troveManager.connect(signers[0]).liquidate(signers[3].address);

    // Pool refilled with 50 token
    await stabilityPool.connect(signers[102]).provideToSP(dec(50, 18), ZERO_ADDRESS);

    // Account 1 opens trove
    await borrowerOperations
      .connect(signers[1])
      .openTrove(_100pct, dec(30, 18), signers[1].address, ZERO_ADDRESS, {
        value: dec(1, "ether"),
      });

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(50, 18));

    const hasPendingRewards = await troveManager.hasPendingRewards(signers[1].address);
    console.log("Liquidee has pending rewards: " + hasPendingRewards);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    // account 1 70 token liquidated  - partial offset against 50 token in SP
    const tx = await troveManager.connect(signers[0]).liquidate(signers[1].address);
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // With pending dist. rewards and SP gains (still closes) - partial offset (Highest gas cost scenario in Normal Mode)
  it("", async () => {
    const message =
      "liquidate() 1 Trove, liquidated Trove has pending SP rewards and redistribution rewards, offset + redistribution.";
    // 10 accts each open Trove with 10 ether
    await th.openTrove_allAccounts(signers.slice(100, 110), contracts, dec(10, "ether"), 0);

    //Account 99 and 98 each open Trove with 1 ether, and withdraw 180 token (inc gas comp)
    await th.openTrove_allAccounts([signers[99]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[99])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[99], ZERO_ADDRESS);
    await th.openTrove_allAccounts([signers[98]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[98])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[98], ZERO_ADDRESS);

    // Acct 99 deposits 1 token to SP
    await stabilityPool.connect(signers[99]).provideToSP(dec(1, 18), ZERO_ADDRESS);

    //Account 97 opens Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts([signers[97]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[97])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[97], ZERO_ADDRESS);

    // Acct 100 withdraws 1800 token and deposits it to the SP
    await borrowerOperations
      .connect(signers[100])
      .withdrawDebtToken(_100pct, dec(1750, 18), signers[100].address, ZERO_ADDRESS);
    await stabilityPool.connect(signers[100]).provideToSP(dec(1750, 18), ZERO_ADDRESS);

    // Price drops too $100, signers 99 and 100 ICR fall below MCR
    await priceFeed.setPrice(dec(100, 18));
    const price = await priceFeed.getPrice();

    /* Liquidate account 97. Account 97 is completely offset against SP and removed from system.
    This creates SP gains for signers 99 and 7. */
    await troveManager.connect(signers[0]).liquidate(signers[97].address);
    assert.isFalse(await sortedTroves.contains(signers[97]));

    // Price rises again to 200
    await priceFeed.setPrice(dec(200, 18));

    // Acct 100 withdraws deposit and gains from SP
    await stabilityPool.connect(signers[100]).withdrawFromSP(dec(1750, 18));

    // Price drops again to 100
    await priceFeed.setPrice(dec(100, 18));

    // Account 98 is liquidated, with nothing in SP pool.  This creates pending rewards from distribution.
    await troveManager.connect(signers[0]).liquidate(signers[98].address);

    // Account 7 deposits 1 token in the Stability Pool
    await stabilityPool.connect(signers[100]).provideToSP(dec(1, 18), ZERO_ADDRESS);

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager.connect(signers[0]).liquidate(signers[99].address);
    assert.isFalse(await sortedTroves.contains(signers[99]));

    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // pure offset
  it("", async () => {
    const message =
      "liquidate() 1 Trove Normal Mode, 30 active Troves, no FIL gain in pool, pure offset with SP";
    // 30 accts each open Trove with 10 ether, withdraw 180 token, and provide 180 token to Stability Pool
    await th.openTrove_allAccounts(signers.slice(100, 130), contracts, dec(10, "ether"), 0);
    await th.withdrawDebtToken_allAccounts(signers.slice(100, 130), contracts, dec(130, 18));

    await stabilityPool.connect(signers[100]).provideToSP(dec(130, 18), ZERO_ADDRESS);

    //1 acct open Trove with 1 ether and withdraws 180 token (inc gas comp)
    await th.openTrove_allAccounts([signers[1]], contracts, dec(1, "ether"), 0);
    await borrowerOperations
      .connect(signers[1])
      .withdrawDebtToken(_100pct, dec(130, 18), signers[1].address, ZERO_ADDRESS);

    // Price drops, account[1]'s ICR falls below MCR
    await priceFeed.setPrice(dec(100, 18));

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_HOUR, web3.currentProvider);

    const tx = await troveManager.connect(signers[0]).liquidate(signers[1].address);
    const gas = await th.gasUsed(tx);
    th.logGas(gas, message);

    th.appendData({ gas: gas }, message, data);
  });

  // --- findInsertPosition ---

  // --- Insert at head, 0 traversals ---

  // it("", async () => {
  //   const message = 'findInsertPosition(), 10 Troves with ICRs 200-209%, ICR > head ICR, no hint, 0 traversals'

  //   // makes 10 Troves with ICRs 200 to 209%
  //   await th.makeTrovesIncreasingICR(_10_Accounts, contracts)

  //   // 300% ICR, higher than Trove at head of list
  //   const CR = web3.utils.toWei('3', 'ether')
  //   const address_0 = '0x0000000000000000000000000000000000000000'

  //   const price = await priceFeed.getPrice()
  //   const tx = await functionCaller.sortedTroves_findInsertPosition(CR, address_0, address_0)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'findInsertPosition(), 50 Troves with ICRs 200-209%, ICR > head ICR, no hint, 0 traversals'

  //   // makes 10 Troves with ICRs 200 to 209%
  //   await th.makeTrovesIncreasingICR(_50_Accounts, contracts)

  //   // 300% ICR, higher than Trove at head of list
  //   const CR = web3.utils.toWei('3', 'ether')
  //   const address_0 = '0x0000000000000000000000000000000000000000'

  //   const price = await priceFeed.getPrice()
  //   const tx = await functionCaller.sortedTroves_findInsertPosition(CR, price, address_0, address_0)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // // --- Insert at tail, so num. traversals = listSize ---

  // it("", async () => {
  //   const message = 'findInsertPosition(), 10 Troves with ICRs 200-209%, ICR < tail ICR, no hint, 10 traversals'

  //   // makes 10 Troves with ICRs 200 to 209%
  //   await th.makeTrovesIncreasingICR(_10_Accounts, contracts)

  //   // 200% ICR, lower than Trove at tail of list
  //   const CR = web3.utils.toWei('2', 'ether')
  //   const address_0 = '0x0000000000000000000000000000000000000000'

  //   const price = await priceFeed.getPrice()
  //   const tx = await functionCaller.sortedTroves_findInsertPosition(CR, price, address_0, address_0)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'findInsertPosition(), 20 Troves with ICRs 200-219%, ICR <  tail ICR, no hint, 20 traversals'

  //   // makes 20 Troves with ICRs 200 to 219%
  //   await th.makeTrovesIncreasingICR(_20_Accounts, contracts)

  //   // 200% ICR, lower than Trove at tail of list
  //   const CR = web3.utils.toWei('2', 'ether')

  //   const price = await priceFeed.getPrice()
  //   const tx = await functionCaller.sortedTroves_findInsertPosition(CR, price, address_0, address_0)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // it("", async () => {
  //   const message = 'findInsertPosition(), 50 Troves with ICRs 200-249%, ICR <  tail ICR, no hint, 50 traversals'

  //   // makes 50 Troves with ICRs 200 to 249%
  //   await th.makeTrovesIncreasingICR(_50_Accounts, contracts)

  //   // 200% ICR, lower than Trove at tail of list
  //   const CR = web3.utils.toWei('2', 'ether')

  //   const price = await priceFeed.getPrice()
  //   const tx = await functionCaller.sortedTroves_findInsertPosition(CR, price, address_0, address_0)
  //   const gas = await th.gasUsed(tx) - 21000
  //   th.logGas(gas, message)

  //   th.appendData({ gas: gas }, message, data)
  // })

  // --- Write test output data to CSV file

  it("Export test data", async () => {
    fs.writeFile("gasTest/outputs/gasTestData.csv", data, (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log("Gas test data written to gasTest/outputs/gasTestData.csv");
      }
    });
  });
});

/* TODO:
-Liquidations in Recovery Mode
---
Parameters to vary for gas tests:
- Number of signers
- Function call parameters - low, high, random, average of many random
  -Pre-existing state:
  --- Rewards accumulated (or not)
  --- Debt token in StabilityPool (or not)
  --- State variables non-zero e.g. Trove already opened, stake already made, etc
  - Steps in the the operation:
  --- number of liquidations to perform
  --- number of troves to redeem from
  --- number of trials to run
  Extremes/edges:
  - Lowest or highest ICR
  - empty list, max size list
  - the only Trove, the newest Trove
  etc.
*/
