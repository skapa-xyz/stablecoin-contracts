const deploymentHelper = require("../utils/testDeploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const { dec, toBN } = th;

let latestRandomSeed = 31337;

contract("HintHelpers", async () => {
  let signers;
  let owner;

  let sortedTroves;
  let troveManager;
  let borrowerOperations;
  let hintHelpers;
  let priceFeed;

  let contracts;

  let numAccounts;

  /* Open a Trove for each account. The debt is 200 tokens each, with collateral beginning at
  1.5 ether, and rising by 0.01 ether per Trove.  Hence, the ICR of account (i + 1) is always 1% greater than the ICR of account i. 
 */

  // Open Troves in parallel, then withdraw debt tokens in parallel
  const makeTrovesInParallel = async (accounts, n) => {
    activeAccounts = accounts.slice(0, n);
    // console.log(`number of accounts used is: ${activeAccounts.length}`)
    // console.time("makeTrovesInParallel")
    const openTrovepromises = activeAccounts.map((account, index) => openTrove(account, index));
    await Promise.all(openTrovepromises);
    const withdrawDebtTokenPromises = activeAccounts.map((account) =>
      withdrawDebtTokenFromTrove(account),
    );
    await Promise.all(withdrawDebtTokenPromises);
    // console.timeEnd("makeTrovesInParallel")
  };

  const openTrove = async (account, index) => {
    const amountFinney = 2000 + index * 10;
    const coll = web3.utils.toWei(amountFinney.toString(), "finney");
    await borrowerOperations.openTrove(th._100pct, 0, account, account, {
      from: account,
      value: coll,
    });
  };

  const withdrawDebtTokenFromTrove = async (account) => {
    await borrowerOperations.withdrawDebtToken(
      th._100pct,
      "100000000000000000000",
      account,
      account,
      {
        from: account,
      },
    );
  };

  // Sequentially add coll and withdraw debt tokens, 1 account at a time
  const makeTrovesInSequence = async (accounts, n) => {
    activeAccounts = accounts.slice(0, n);
    // console.log(`number of accounts used is: ${activeAccounts.length}`)

    let ICR = 200;

    // console.time('makeTrovesInSequence')
    for (const account of activeAccounts) {
      const ICR_BN = toBN(ICR.toString().concat("0".repeat(16)));
      await th.openTrove(contracts, {
        extraDebtTokenAmount: toBN(dec(10000, 18)),
        ICR: ICR_BN,
        extraParams: { from: account },
      });

      ICR += 1;
    }
    // console.timeEnd('makeTrovesInSequence')
  };

  before(async () => {
    await hre.network.provider.send("hardhat_reset");

    signers = await ethers.getSigners();
    [owner] = signers;

    const transactionCount = await owner.getTransactionCount();
    const cpTesterContracts = await deploymentHelper.computeContractAddresses(
      owner.address,
      transactionCount,
      5,
    );
    const cpContracts = await deploymentHelper.computeCoreProtocolContracts(
      owner.address,
      transactionCount + 5,
    );

    // Overwrite contracts with computed tester addresses
    cpContracts.troveManager = cpTesterContracts[2];
    cpContracts.debtToken = cpTesterContracts[4];

    const troveManagerTester = await deploymentHelper.deployTroveManagerTester(
      th.GAS_COMPENSATION,
      th.MIN_NET_DEBT,
      cpContracts,
    );
    const debtTokenTester = await deploymentHelper.deployDebtTokenTester(cpContracts);

    contracts = await deploymentHelper.deployProtocolCore(
      th.GAS_COMPENSATION,
      th.MIN_NET_DEBT,
      cpContracts,
    );

    contracts.troveManager = troveManagerTester;
    contracts.debtToken = debtTokenTester;

    await deploymentHelper.deployProtocolTokenContracts(owner.address, cpContracts);

    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;
    priceFeed = contracts.priceFeedTestnet;

    numAccounts = 10;

    await priceFeed.setPrice(dec(100, 18));
    await makeTrovesInSequence(signers, numAccounts);
    // await makeTrovesInParallel(accounts, numAccounts)
  });

  it("setup: makes accounts with nominal ICRs increasing by 1% consecutively", async () => {
    // check first 10 accounts
    const ICR_0 = await troveManager.getNominalICR(signers[0].address);
    const ICR_1 = await troveManager.getNominalICR(signers[1].address);
    const ICR_2 = await troveManager.getNominalICR(signers[2].address);
    const ICR_3 = await troveManager.getNominalICR(signers[3].address);
    const ICR_4 = await troveManager.getNominalICR(signers[4].address);
    const ICR_5 = await troveManager.getNominalICR(signers[5].address);
    const ICR_6 = await troveManager.getNominalICR(signers[6].address);
    const ICR_7 = await troveManager.getNominalICR(signers[7].address);
    const ICR_8 = await troveManager.getNominalICR(signers[8].address);
    const ICR_9 = await troveManager.getNominalICR(signers[9].address);

    assert.isTrue(ICR_0.eq(toBN(dec(200, 16))));
    assert.isTrue(ICR_1.eq(toBN(dec(201, 16))));
    assert.isTrue(ICR_2.eq(toBN(dec(202, 16))));
    assert.isTrue(ICR_3.eq(toBN(dec(203, 16))));
    assert.isTrue(ICR_4.eq(toBN(dec(204, 16))));
    assert.isTrue(ICR_5.eq(toBN(dec(205, 16))));
    assert.isTrue(ICR_6.eq(toBN(dec(206, 16))));
    assert.isTrue(ICR_7.eq(toBN(dec(207, 16))));
    assert.isTrue(ICR_8.eq(toBN(dec(208, 16))));
    assert.isTrue(ICR_9.eq(toBN(dec(209, 16))));
  });

  it("getApproxHint(): returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    /* As per the setup, the ICRs of Troves are monotonic and seperated by 1% intervals. Therefore, the difference in ICR between 
    the given CR and the ICR of the hint address equals the number of positions between the hint address and the correct insert position 
    for a Trove with the given CR. */

    // CR = 250%
    const CR_250 = "2500000000000000000";
    const CRPercent_250 = Number(ethers.utils.formatEther(CR_250, "ether")) * 100;

    let hintAddress;

    // const hintAddress_250 = await functionCaller.troveManager_getApproxHint(CR_250, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_250,
      sqrtLength * 10,
      latestRandomSeed,
    ));
    const ICR_hintAddress_250 = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_250 =
      Number(ethers.utils.formatEther(ICR_hintAddress_250, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    ICR_Difference_250 = ICRPercent_hintAddress_250 - CRPercent_250;
    assert.isBelow(ICR_Difference_250, sqrtLength);

    // CR = 287%
    const CR_287 = "2870000000000000000";
    const CRPercent_287 = Number(ethers.utils.formatEther(CR_287, "ether")) * 100;

    // const hintAddress_287 = await functionCaller.troveManager_getApproxHint(CR_287, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_287,
      sqrtLength * 10,
      latestRandomSeed,
    ));
    const ICR_hintAddress_287 = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_287 =
      Number(ethers.utils.formatEther(ICR_hintAddress_287, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    ICR_Difference_287 = ICRPercent_hintAddress_287 - CRPercent_287;
    assert.isBelow(ICR_Difference_287, sqrtLength);

    // CR = 213%
    const CR_213 = "2130000000000000000";
    const CRPercent_213 = Number(ethers.utils.formatEther(CR_213, "ether")) * 100;

    // const hintAddress_213 = await functionCaller.troveManager_getApproxHint(CR_213, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_213,
      sqrtLength * 10,
      latestRandomSeed,
    ));
    const ICR_hintAddress_213 = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_213 =
      Number(ethers.utils.formatEther(ICR_hintAddress_213, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    ICR_Difference_213 = ICRPercent_hintAddress_213 - CRPercent_213;
    assert.isBelow(ICR_Difference_213, sqrtLength);

    // CR = 201%
    const CR_201 = "2010000000000000000";
    const CRPercent_201 = Number(ethers.utils.formatEther(CR_201, "ether")) * 100;

    //  const hintAddress_201 = await functionCaller.troveManager_getApproxHint(CR_201, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_201,
      sqrtLength * 10,
      latestRandomSeed,
    ));
    const ICR_hintAddress_201 = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_201 =
      Number(ethers.utils.formatEther(ICR_hintAddress_201, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    ICR_Difference_201 = ICRPercent_hintAddress_201 - CRPercent_201;
    assert.isBelow(ICR_Difference_201, sqrtLength);
  });

  /* Pass 100 random collateral ratios to getApproxHint(). For each, check whether the returned hint address is within 
  sqrt(length) positions of where a Trove with that CR should be inserted. */
  // it("getApproxHint(): for 100 random CRs, returns the address of a Trove within sqrt(length) positions of the correct insert position", async () => {
  //   const sqrtLength = Math.ceil(Math.sqrt(numAccounts))

  //   for (i = 0; i < 100; i++) {
  //     // get random ICR between 200% and (200 + numAccounts)%
  //     const min = 200
  //     const max = 200 + numAccounts
  //     const ICR_Percent = (Math.floor(Math.random() * (max - min) + min))

  //     // Convert ICR to a duint
  //     const ICR = web3.utils.toWei((ICR_Percent * 10).toString(), 'finney')

  //     const hintAddress = await hintHelpers.getApproxHint(ICR, sqrtLength * 10)
  //     const ICR_hintAddress = await troveManager.getNominalICR(hintAddress)
  //     const ICRPercent_hintAddress = Number(ethers.utils.formatEther(ICR_hintAddress, 'ether')) * 100

  //     // check the hint position is at most sqrtLength positions away from the correct position
  //     ICR_Difference = (ICRPercent_hintAddress - ICR_Percent)
  //     assert.isBelow(ICR_Difference, sqrtLength)
  //   }
  // })

  it("getApproxHint(): returns the head of the list if the CR is the max uint256 value", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    // CR = Maximum value, i.e. 2**256 -1
    const CR_Max = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    let hintAddress;

    // const hintAddress_Max = await functionCaller.troveManager_getApproxHint(CR_Max, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_Max,
      sqrtLength * 10,
      latestRandomSeed,
    ));

    const ICR_hintAddress_Max = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_Max =
      Number(ethers.utils.formatEther(ICR_hintAddress_Max, "ether")) * 100;

    const firstTrove = await sortedTroves.getFirst();
    const ICR_FirstTrove = await troveManager.getNominalICR(firstTrove);
    const ICRPercent_FirstTrove = Number(ethers.utils.formatEther(ICR_FirstTrove, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    ICR_Difference_Max = ICRPercent_hintAddress_Max - ICRPercent_FirstTrove;
    assert.isBelow(ICR_Difference_Max, sqrtLength);
  });

  it("getApproxHint(): returns the tail of the list if the CR is lower than ICR of any Trove", async () => {
    const sqrtLength = Math.ceil(Math.sqrt(numAccounts));

    // CR = MCR
    const CR_Min = "1100000000000000000";

    let hintAddress;

    //  const hintAddress_Min = await functionCaller.troveManager_getApproxHint(CR_Min, sqrtLength * 10)
    ({ hintAddress, latestRandomSeed } = await hintHelpers.getApproxHint(
      CR_Min,
      sqrtLength * 10,
      latestRandomSeed,
    ));
    const ICR_hintAddress_Min = await troveManager.getNominalICR(hintAddress);
    const ICRPercent_hintAddress_Min =
      Number(ethers.utils.formatEther(ICR_hintAddress_Min, "ether")) * 100;

    const lastTrove = await sortedTroves.getLast();
    const ICR_LastTrove = await troveManager.getNominalICR(lastTrove);
    const ICRPercent_LastTrove = Number(ethers.utils.formatEther(ICR_LastTrove, "ether")) * 100;

    // check the hint position is at most sqrtLength positions away from the correct position
    const ICR_Difference_Min = ICRPercent_hintAddress_Min - ICRPercent_LastTrove;
    assert.isBelow(ICR_Difference_Min, sqrtLength);
  });

  it("computeNominalCR()", async () => {
    const NICR = await hintHelpers.computeNominalCR(dec(3, 18), dec(200, 18));
    assert.equal(NICR.toString(), dec(150, 16));
  });
});

// Gas usage:  See gas costs spreadsheet. Cost per trial = 10k-ish.
