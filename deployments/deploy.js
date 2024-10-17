const { UniswapV2Factory } = require("./ABIs/UniswapV2Factory.js");
const { UniswapV2Pair } = require("./ABIs/UniswapV2Pair.js");
const { UniswapV2Router02 } = require("./ABIs/UniswapV2Router02.js");
const { ChainlinkAggregatorV3Interface } = require("./ABIs/ChainlinkAggregatorV3Interface.js");
const { TestHelper: th, TimeValues: timeVals } = require("../utils/testHelpers.js");
const { dec } = th;
const HardhatDeploymentHelper = require("../utils/hardhatDeploymentHelpers.js");
const hre = require("hardhat");
const toBigNum = ethers.BigNumber.from;

async function deploy(configParams) {
  const date = new Date();
  console.log(date.toUTCString());
  const deployerWallet = (await ethers.getSigners())[0];
  // const account2Wallet = (await ethers.getSigners())[1]
  const mdh = new HardhatDeploymentHelper(configParams, deployerWallet);

  const deploymentState = mdh.loadPreviousDeployment();

  console.log(`deployer address: ${deployerWallet.address}`);
  assert.equal(deployerWallet.address, configParams.walletAddrs.DEPLOYER);
  // assert.equal(account2Wallet.address, configParams.beneficiaries.ACCOUNT_2)
  let deployerFILBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployerFILBalance before: ${deployerFILBalance}`);

  // Get UniswapV2Factory instance at its deployed address
  const uniswapExits = !!configParams.externalAddrs.UNISWAP_V2_FACTORY;
  const uniswapV2Factory = uniswapExits
    ? new ethers.Contract(
        configParams.externalAddrs.UNISWAP_V2_FACTORY,
        UniswapV2Factory.abi,
        deployerWallet,
      )
    : undefined;

  if (uniswapExits) {
    console.log(`Uniswp addr: ${uniswapV2Factory.address}`);
    const uniAllPairsLength = await uniswapV2Factory.allPairsLength();
    console.log(`Uniswap Factory number of pairs: ${uniAllPairsLength}`);
  }

  deployerFILBalance = await ethers.provider.getBalance(deployerWallet.address);
  console.log(`deployer's FIL balance before deployments: ${deployerFILBalance}`);

  // Deploy core logic contracts
  const coreContracts = await mdh.deployProtocolCoreMainnet(deploymentState);
  await mdh.logContractObjects(coreContracts);

  // // Check Uniswap Pair DebtToken-FIL pair before pair creation
  // let DebtTokenWFILPairAddr = await uniswapV2Factory.getPair(coreContracts.debtToken.address, configParams.externalAddrs.WRAPPED_NATIVE_TOKEN)
  // let WFILDebtTokenPairAddr = await uniswapV2Factory.getPair(configParams.externalAddrs.WRAPPED_NATIVE_TOKEN, coreContracts.debtToken.address)
  // assert.equal(DebtTokenWFILPairAddr, WFILDebtTokenPairAddr)
  let [DebtTokenWFILPairAddr, WFILDebtTokenPairAddr] = uniswapExits
    ? await Promise.all([
        uniswapV2Factory.getPair(
          coreContracts.debtToken.address,
          configParams.externalAddrs.WRAPPED_NATIVE_TOKEN,
        ),
        uniswapV2Factory.getPair(
          configParams.externalAddrs.WRAPPED_NATIVE_TOKEN,
          coreContracts.debtToken.address,
        ),
      ])
    : [undefined, undefined];
  assert.equal(DebtTokenWFILPairAddr, WFILDebtTokenPairAddr);

  if (DebtTokenWFILPairAddr === th.ZERO_ADDRESS) {
    // Deploy Unipool for DebtToken-WFIL
    await mdh.sendAndWaitForTransaction(
      uniswapV2Factory.createPair(
        configParams.externalAddrs.WRAPPED_NATIVE_TOKEN,
        coreContracts.debtToken.address,
      ),
    );

    // Check Uniswap Pair DebtToken-WFIL pair after pair creation (forwards and backwards should have same address)
    DebtTokenWFILPairAddr = await uniswapV2Factory.getPair(
      coreContracts.debtToken.address,
      configParams.externalAddrs.WRAPPED_NATIVE_TOKEN,
    );
    assert.notEqual(DebtTokenWFILPairAddr, th.ZERO_ADDRESS);
    WFILDebtTokenPairAddr = await uniswapV2Factory.getPair(
      configParams.externalAddrs.WRAPPED_NATIVE_TOKEN,
      coreContracts.debtToken.address,
    );
    console.log(
      `DebtToken-WFIL pair contract address after Uniswap pair creation: ${DebtTokenWFILPairAddr}`,
    );
    assert.equal(WFILDebtTokenPairAddr, DebtTokenWFILPairAddr);
  }

  // Deploy Unipool
  const unipool = await mdh.deployUnipoolMainnet(deploymentState);

  // Deploy ProtocolToken Contracts
  const protocolTokenContracts = await mdh.deployProtocolTokenContractsMainnet(
    configParams.walletAddrs.GENERAL_SAFE, // bounty address
    unipool.address, // lp rewards address
    configParams.walletAddrs.PROTOCOL_TOKEN_SAFE, // multisig endowment address
    deploymentState,
  );

  // Connect all core contracts up
  await mdh.connectCoreContractsMainnet(coreContracts, protocolTokenContracts);
  await mdh.connectProtocolTokenContractsMainnet(protocolTokenContracts);
  await mdh.connectProtocolTokenContractsToCoreMainnet(protocolTokenContracts, coreContracts);

  // Deploy a read-only multi-trove getter
  const multiTroveGetter = await mdh.deployMultiTroveGetterMainnet(coreContracts, deploymentState);

  // Connect Unipool to ProtocolToken and the DebtToken-WFIL pair address, with a 6 week duration
  if (uniswapExits) {
    const LPRewardsDuration = timeVals.SECONDS_IN_SIX_WEEKS;
    await mdh.connectUnipoolMainnet(
      unipool,
      protocolTokenContracts,
      DebtTokenWFILPairAddr,
      LPRewardsDuration,
    );
  }

  // Log ProtocolToken and Unipool addresses
  await mdh.logContractObjects(protocolTokenContracts);
  console.log(`Unipool address: ${unipool.address}`);

  // let latestBlock = await ethers.provider.getBlockNumber()
  let deploymentStartTime = await protocolTokenContracts.protocolToken.getDeploymentStartTime();

  console.log(`deployment start time: ${deploymentStartTime}`);
  const oneYearFromDeployment = (
    Number(deploymentStartTime) + timeVals.SECONDS_IN_ONE_YEAR
  ).toString();
  console.log(`time oneYearFromDeployment: ${oneYearFromDeployment}`);

  // Deploy LockupContracts - one for each beneficiary
  const lockupContracts = {};

  for (const [investor, investorAddr] of Object.entries(configParams.beneficiaries)) {
    const lockupContractEthersFactory = await ethers.getContractFactory(
      "LockupContract",
      deployerWallet,
    );
    if (deploymentState[investor] && deploymentState[investor].address) {
      console.log(
        `Using previously deployed ${investor} lockup contract at address ${deploymentState[investor].address}`,
      );
      lockupContracts[investor] = new ethers.Contract(
        deploymentState[investor].address,
        lockupContractEthersFactory.interface,
        deployerWallet,
      );
    } else {
      const txReceipt = await mdh.sendAndWaitForTransaction(
        protocolTokenContracts.lockupContractFactory.deployLockupContract(
          investorAddr,
          oneYearFromDeployment,
        ),
      );

      const address =
        await protocolTokenContracts.lockupContractFactory.beneficiaryToLockupContract(
          investorAddr,
        );
      lockupContracts[investor] = new ethers.Contract(
        address,
        lockupContractEthersFactory.interface,
        deployerWallet,
      );

      deploymentState[investor] = {
        address: address,
        txHash: txReceipt.transactionHash,
      };

      mdh.saveDeployment(deploymentState);
    }

    const protocolTokenAddr = protocolTokenContracts.protocolToken.address;
    // verify
    if (configParams.FILERSCAN_BASE_URL) {
      await mdh.verifyContract(investor, deploymentState, [
        protocolTokenAddr,
        investorAddr,
        oneYearFromDeployment,
      ]);
    }
  }

  // // --- TESTS AND CHECKS  ---

  // Deployer repay DebtToken
  // console.log(`deployer trove debt before repaying: ${await coreContracts.troveManager.getTroveDebt(deployerWallet.address)}`)
  // await mdh.sendAndWaitForTransaction(coreContracts.borrowerOperations.repayDebtToken(dec(800, 18), th.ZERO_ADDRESS, th.ZERO_ADDRESS, {gasPrice, gasLimit: 1000000}))
  // console.log(`deployer trove debt after repaying: ${await coreContracts.troveManager.getTroveDebt(deployerWallet.address)}`)

  // Deployer add coll
  // console.log(`deployer trove coll before adding coll: ${await coreContracts.troveManager.getTroveColl(deployerWallet.address)}`)
  // await mdh.sendAndWaitForTransaction(coreContracts.borrowerOperations.addColl(th.ZERO_ADDRESS, th.ZERO_ADDRESS, {value: dec(2, 'ether'), gasPrice, gasLimit: 1000000}))
  // console.log(`deployer trove coll after addingColl: ${await coreContracts.troveManager.getTroveColl(deployerWallet.address)}`)

  // Check oracle proxy prices ---

  // Get latest price
  let pythPriceResponse = await coreContracts.pythCaller.latestRoundData();
  console.log(`current Pyth price: ${pythPriceResponse[1]}`);
  console.log(`current Pyth timestamp: ${pythPriceResponse[3]}`);

  // Check Tellor price directly (through our TellorCaller)
  let tellorPriceResponse = await coreContracts.tellorCaller.getTellorCurrentValue(); // id == 1: the FIL-USD request ID
  console.log(`current Tellor price: ${tellorPriceResponse[1]}`);
  console.log(`current Tellor timestamp: ${tellorPriceResponse[2]}`);

  // // --- Lockup Contracts ---
  console.log("LOCKUP CONTRACT CHECKS");
  // Check lockup contracts exist for each beneficiary with correct unlock time
  for (investor of Object.keys(lockupContracts)) {
    const lockupContract = lockupContracts[investor];
    // check LC references correct ProtocolToken
    const storedProtocolTokenAddr = await lockupContract.protocolToken();
    assert.equal(protocolTokenContracts.protocolToken.address, storedProtocolTokenAddr);
    // Check contract has stored correct beneficary
    const onChainBeneficiary = await lockupContract.beneficiary();
    assert.equal(
      configParams.beneficiaries[investor].toLowerCase(),
      onChainBeneficiary.toLowerCase(),
    );
    // Check correct unlock time (1 yr from deployment)
    const unlockTime = await lockupContract.unlockTime();
    assert.equal(oneYearFromDeployment, unlockTime);

    console.log(
      `lockupContract addr: ${lockupContract.address},
            stored ProtocolToken addr: ${storedProtocolTokenAddr}
            beneficiary: ${investor},
            beneficiary addr: ${configParams.beneficiaries[investor]},
            on-chain beneficiary addr: ${onChainBeneficiary},
            unlockTime: ${unlockTime}
            `,
    );
  }

  // // --- Check correct addresses set in ProtocolToken
  // console.log("STORED ADDRESSES IN ProtocolToken TOKEN")
  // const storedMultisigAddress = await protocolTokenContracts.protocolToken.multisigAddress()
  // assert.equal(configParams.walletAddrs.PROTOCOL_TOKEN_SAFE.toLowerCase(), storedMultisigAddress.toLowerCase())
  // console.log(`multi-sig address stored in ProtocolToken : ${th.squeezeAddr(storedMultisigAddress)}`)
  // console.log(`ProtocolToken Safe address: ${th.squeezeAddr(configParams.walletAddrs.PROTOCOL_TOKEN_SAFE)}`)

  // // --- ProtocolToken allowances of different addresses ---
  // console.log("INITIAL ProtocolToken BALANCES")
  // // Unipool
  // const unipoolProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(unipool.address)
  // // assert.equal(unipoolProtocolTokenBal.toString(), '1333333333333333333333333')
  // th.logBN('Unipool ProtocolToken balance       ', unipoolProtocolTokenBal)

  // // ProtocolToken Safe
  // const protocolTokenSafeBal = await protocolTokenContracts.protocolToken.balanceOf(configParams.walletAddrs.PROTOCOL_TOKEN_SAFE)
  // assert.equal(protocolTokenSafeBal.toString(), '64666666666666666666666667')
  // th.logBN('ProtocolToken Safe balance     ', protocolTokenSafeBal)

  // // Bounties/hackathons (General Safe)
  // const generalSafeBal = await protocolTokenContracts.protocolToken.balanceOf(configParams.walletAddrs.GENERAL_SAFE)
  // assert.equal(generalSafeBal.toString(), '2000000000000000000000000')
  // th.logBN('General Safe balance       ', generalSafeBal)

  // // CommunityIssuance contract
  // const communityIssuanceBal = await protocolTokenContracts.protocolToken.balanceOf(protocolTokenContracts.communityIssuance.address)
  // // assert.equal(communityIssuanceBal.toString(), '32000000000000000000000000')
  // th.logBN('Community Issuance balance', communityIssuanceBal)

  // // --- PriceFeed ---
  // console.log("PRICEFEED CHECKS")
  // // Check Pricefeed's status and last good price
  // const lastGoodPrice = await coreContracts.priceFeed.lastGoodPrice()
  // const priceFeedInitialStatus = await coreContracts.priceFeed.status()
  // th.logBN('PriceFeed first stored price', lastGoodPrice)
  // console.log(`PriceFeed initial status: ${priceFeedInitialStatus}`)

  // // Check PriceFeed's & TellorCaller's stored addresses
  // const priceFeedCLAddress = await coreContracts.priceFeed.priceAggregator()
  // const priceFeedTellorCallerAddress = await coreContracts.priceFeed.tellorCaller()
  // assert.equal(priceFeedCLAddress, configParams.externalAddrs.CHAINLINK_FILUSD_PROXY)
  // assert.equal(priceFeedTellorCallerAddress, coreContracts.tellorCaller.address)

  // // Check Tellor address
  // const tellorCallerTellorMasterAddress = await coreContracts.tellorCaller.tellor()
  // assert.equal(tellorCallerTellorMasterAddress, configParams.externalAddrs.TELLOR_MASTER)

  // // --- Unipool ---

  // // Check Unipool's DebtToken-FIL Uniswap Pair address
  // const unipoolUniswapPairAddr = await unipool.uniToken()
  // console.log(`Unipool's stored DebtToken-FIL Uniswap Pair address: ${unipoolUniswapPairAddr}`)

  // console.log("SYSTEM GLOBAL VARS CHECKS")
  // // --- Sorted Troves ---

  // // Check max size
  // const sortedTrovesMaxSize = (await coreContracts.sortedTroves.data())[2]
  // assert.equal(sortedTrovesMaxSize, '115792089237316195423570985008687907853269984665640564039457584007913129639935')

  // // --- TroveManager ---

  // const liqReserve = await coreContracts.troveManager.GAS_COMPENSATION()
  // const minNetDebt = await coreContracts.troveManager.MIN_NET_DEBT()

  // th.logBN('system liquidation reserve', liqReserve)
  // th.logBN('system min net debt      ', minNetDebt)

  // // --- Make first DebtToken-FIL liquidity provision ---

  // // Open trove if not yet opened
  // const troveStatus = await coreContracts.troveManager.getTroveStatus(deployerWallet.address)
  // if (troveStatus.toString() != '1') {
  //   let _3kDebtTokenWithdrawal = th.dec(3000, 18) // 3000 tokens
  //   let _3FILcoll = th.dec(3, 'ether') // 3 FIL
  //   console.log('Opening trove...')
  //   await mdh.sendAndWaitForTransaction(
  //     coreContracts.borrowerOperations.openTrove(
  //       th._100pct,
  //       _3kDebtTokenWithdrawal,
  //       th.ZERO_ADDRESS,
  //       th.ZERO_ADDRESS,
  //       { value: _3FILcoll, gasPrice }
  //     )
  //   )
  // } else {
  //   console.log('Deployer already has an active trove')
  // }

  // // Check deployer now has an open trove
  // console.log(`deployer is in sorted list after making trove: ${await coreContracts.sortedTroves.contains(deployerWallet.address)}`)

  // const deployerTrove = await coreContracts.troveManager.Troves(deployerWallet.address)
  // th.logBN('deployer debt', deployerTrove[0])
  // th.logBN('deployer coll', deployerTrove[1])
  // th.logBN('deployer stake', deployerTrove[2])
  // console.log(`deployer's trove status: ${deployerTrove[3]}`)

  // // Check deployer has DebtToken
  // let deployerDebtTokenBal = await coreContracts.debtToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer's debt token balance", deployerDebtTokenBal)

  // // Check Uniswap pool has the debt token and WFIL tokens
  const DebtTokenFILPair = uniswapExits
    ? await new ethers.Contract(DebtTokenWFILPairAddr, UniswapV2Pair.abi, deployerWallet)
    : undefined;

  // const token0Addr = await DebtTokenFILPair.token0()
  // const token1Addr = await DebtTokenFILPair.token1()
  // console.log(`DebtToken-FIL Pair token 0: ${th.squeezeAddr(token0Addr)},
  //       DebtToken contract addr: ${th.squeezeAddr(coreContracts.debtToken.address)}`)
  // console.log(`DebtToken-FIL Pair token 1: ${th.squeezeAddr(token1Addr)},
  //       WFIL ERC20 contract addr: ${th.squeezeAddr(configParams.externalAddrs.WRAPPED_NATIVE_TOKEN)}`)

  // // Check initial DebtToken-FIL pair reserves before provision
  // let reserves = await DebtTokenFILPair.getReserves()
  // th.logBN("DebtToken-FIL Pair's DebtToken reserves before provision", reserves[0])
  // th.logBN("DebtToken-FIL Pair's FIL reserves before provision", reserves[1])

  // // Get the UniswapV2Router contract
  // const uniswapV2Router02 = new ethers.Contract(
  //   configParams.externalAddrs.UNISWAP_V2_ROUTER02,
  //   UniswapV2Router02.abi,
  //   deployerWallet
  // )

  // // --- Provide liquidity to DebtToken-FIL pair if not yet done so ---
  // let deployerLPTokenBal = await DebtTokenFILPair.balanceOf(deployerWallet.address)
  // if (deployerLPTokenBal.toString() == '0') {
  //   console.log('Providing liquidity to Uniswap...')
  //   // Give router an allowance for DebtToken
  //   await coreContracts.debtToken.increaseAllowance(uniswapV2Router02.address, dec(10000, 18))

  //   // Check Router's spending allowance
  //   const routerDebtTokenAllowanceFromDeployer = await coreContracts.debtToken.allowance(deployerWallet.address, uniswapV2Router02.address)
  //   th.logBN("router's spending allowance for deployer's debt token", routerDebtTokenAllowanceFromDeployer)

  //   // Get amounts for liquidity provision
  //   const LP_FIL = dec(1, 'ether')

  //   // Convert 8-digit CL price to 18 and multiply by FIL amount
  //   const debtTokenAmount = toBigNum(chainlinkPrice)
  //     .mul(toBigNum(dec(1, 10)))
  //     .mul(toBigNum(LP_FIL))
  //     .div(toBigNum(dec(1, 18)))

  //   const minDebtTokenAmount = debtTokenAmount.sub(toBigNum(dec(100, 18)))

  //   latestBlock = await ethers.provider.getBlockNumber()
  //   now = (await ethers.provider.getBlock(latestBlock)).timestamp
  //   let tenMinsFromNow = now + (60 * 60 * 10)

  //   // Provide liquidity to DebtToken-FIL pair
  //   await mdh.sendAndWaitForTransaction(
  //     uniswapV2Router02.addLiquidityFIL(
  //       coreContracts.debtToken.address, // address of debt token
  //       debtTokenAmount, // debt token provision
  //       minDebtTokenAmount, // minimum debt token provision
  //       LP_FIL, // minimum FIL provision
  //       deployerWallet.address, // address to send LP tokens to
  //       tenMinsFromNow, // deadline for this tx
  //       {
  //         value: dec(1, 'ether'),
  //         gasPrice,
  //         gasLimit: 5000000 // For some reason, ethers can't estimate gas for this tx
  //       }
  //     )
  //   )
  // } else {
  //   console.log('Liquidity already provided to Uniswap')
  // }
  // // Check DebtToken-FIL reserves after liquidity provision:
  // reserves = await DebtTokenFILPair.getReserves()
  // th.logBN("DebtToken-FIL Pair's DebtToken reserves after provision", reserves[0])
  // th.logBN("DebtToken-FIL Pair's FIL reserves after provision", reserves[1])

  // // ---  Check LP staking  ---
  // console.log("CHECK LP STAKING EARNS ProtocolToken")

  // // Check deployer's LP tokens
  // deployerLPTokenBal = await DebtTokenFILPair.balanceOf(deployerWallet.address)
  // th.logBN("deployer's LP token balance", deployerLPTokenBal)

  // // Stake LP tokens in Unipool
  // console.log(`DebtTokenFILPair addr: ${DebtTokenFILPair.address}`)
  // console.log(`Pair addr stored in Unipool: ${await unipool.uniToken()}`)

  // earnedProtocolToken = await unipool.earned(deployerWallet.address)
  // th.logBN("deployer's farmed ProtocolToken before staking LP tokens", earnedProtocolToken)

  // const deployerUnipoolStake = await unipool.balanceOf(deployerWallet.address)
  // if (deployerUnipoolStake.toString() == '0') {
  //   console.log('Staking to Unipool...')
  //   // Deployer approves Unipool
  //   await mdh.sendAndWaitForTransaction(
  //     DebtTokenFILPair.approve(unipool.address, deployerLPTokenBal, { gasPrice })
  //   )

  //   await mdh.sendAndWaitForTransaction(unipool.stake(1, { gasPrice }))
  // } else {
  //   console.log('Already staked in Unipool')
  // }

  // console.log("wait 90 seconds before checking earnings... ")
  // await configParams.waitFunction()

  // earnedProtocolToken = await unipool.earned(deployerWallet.address)
  // th.logBN("deployer's farmed ProtocolToken from Unipool after waiting ~1.5mins", earnedProtocolToken)

  // let deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer ProtocolToken Balance Before SP deposit", deployerProtocolTokenBal)

  // // --- Make SP deposit and earn ProtocolToken ---
  // console.log("CHECK DEPLOYER MAKING DEPOSIT AND EARNING ProtocolToken")

  // let SPDeposit = await coreContracts.stabilityPool.getCompoundedDebtTokenDeposit(deployerWallet.address)
  // th.logBN("deployer SP deposit before making deposit", SPDeposit)

  // // Provide to SP
  // await mdh.sendAndWaitForTransaction(coreContracts.stabilityPool.provideToSP(dec(15, 18), th.ZERO_ADDRESS, { gasPrice, gasLimit: 400000 }))

  // // Get SP deposit
  // SPDeposit = await coreContracts.stabilityPool.getCompoundedDebtTokenDeposit(deployerWallet.address)
  // th.logBN("deployer SP deposit after depositing 15 tokens", SPDeposit)

  // console.log("wait 90 seconds before withdrawing...")
  // // wait 90 seconds
  // await configParams.waitFunction()

  // // Withdraw from SP
  // // await mdh.sendAndWaitForTransaction(coreContracts.stabilityPool.withdrawFromSP(dec(1000, 18), { gasPrice, gasLimit: 400000 }))

  // // SPDeposit = await coreContracts.stabilityPool.getCompoundedDebtTokenDeposit(deployerWallet.address)
  // // th.logBN("deployer SP deposit after full withdrawal", SPDeposit)

  // // deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  // // th.logBN("deployer ProtocolToken Balance after SP deposit withdrawal", deployerProtocolTokenBal)

  // // ---  Attempt withdrawal from LC  ---
  // console.log("CHECK BENEFICIARY ATTEMPTING WITHDRAWAL FROM LC")

  // // connect Acct2 wallet to the LC they are beneficiary of
  // let account2LockupContract = await lockupContracts["ACCOUNT_2"].connect(account2Wallet)

  // // Deployer funds LC with 10 ProtocolToken
  // // await mdh.sendAndWaitForTransaction(protocolTokenContracts.protocolToken.transfer(account2LockupContract.address, dec(10, 18), { gasPrice }))

  // // account2 ProtocolToken bal
  // let account2bal = await protocolTokenContracts.protocolToken.balanceOf(account2Wallet.address)
  // th.logBN("account2 ProtocolToken bal before withdrawal attempt", account2bal)

  // // Check LC ProtocolToken bal
  // let account2LockupContractBal = await protocolTokenContracts.protocolToken.balanceOf(account2LockupContract.address)
  // th.logBN("account2's LC ProtocolToken bal before withdrawal attempt", account2LockupContractBal)

  // // Acct2 attempts withdrawal from  LC
  // await mdh.sendAndWaitForTransaction(account2LockupContract.withdrawProtocolToken({ gasPrice, gasLimit: 1000000 }))

  // // Acct ProtocolToken bal
  // account2bal = await protocolTokenContracts.protocolToken.balanceOf(account2Wallet.address)
  // th.logBN("account2's ProtocolToken bal after LC withdrawal attempt", account2bal)

  // // Check LC bal
  // account2LockupContractBal = await protocolTokenContracts.protocolToken.balanceOf(account2LockupContract.address)
  // th.logBN("account2's LC ProtocolToken bal LC withdrawal attempt", account2LockupContractBal)

  // // --- Stake ProtocolToken ---
  // console.log("CHECK DEPLOYER STAKING ProtocolToken")

  // // Log deployer ProtocolToken bal and stake before staking
  // deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer ProtocolToken bal before staking", deployerProtocolTokenBal)
  // let deployerProtocolTokenStake = await protocolTokenContracts.protocolTokenStaking.stakes(deployerWallet.address)
  // th.logBN("deployer stake before staking", deployerProtocolTokenStake)

  // // stake 13 ProtocolToken
  // await mdh.sendAndWaitForTransaction(protocolTokenContracts.protocolTokenStaking.stake(dec(13, 18), { gasPrice, gasLimit: 1000000 }))

  // // Log deployer ProtocolToken bal and stake after staking
  // deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  // th.logBN("deployer ProtocolToken bal after staking", deployerProtocolTokenBal)
  // deployerProtocolTokenStake = await protocolTokenContracts.protocolTokenStaking.stakes(deployerWallet.address)
  // th.logBN("deployer stake after staking", deployerProtocolTokenStake)

  // // Log deployer rev share immediately after staking
  // let deployerDebtTokenRevShare = await protocolTokenContracts.protocolTokenStaking.getPendingDebtTokenGain(deployerWallet.address)
  // th.logBN("deployer pending debt token revenue share", deployerDebtTokenRevShare)

  // // --- 2nd Account opens trove ---
  // const trove2Status = await coreContracts.troveManager.getTroveStatus(account2Wallet.address)
  // if (trove2Status.toString() != '1') {
  //   console.log("Acct 2 opens a trove ...")
  //   let _2kDebtTokenWithdrawal = th.dec(2000, 18) // 2000 tokens
  //   let _1pt5_FILcoll = th.dec(15, 17) // 1.5 FIL
  //   const borrowerOpsEthersFactory = await ethers.getContractFactory("BorrowerOperations", account2Wallet)
  //   const borrowerOpsAcct2 = await new ethers.Contract(coreContracts.borrowerOperations.address, borrowerOpsEthersFactory.interface, account2Wallet)

  //   await mdh.sendAndWaitForTransaction(borrowerOpsAcct2.openTrove(th._100pct, _2kDebtTokenWithdrawal, th.ZERO_ADDRESS, th.ZERO_ADDRESS, { value: _1pt5_FILcoll, gasPrice, gasLimit: 1000000 }))
  // } else {
  //   console.log('Acct 2 already has an active trove')
  // }

  // const acct2Trove = await coreContracts.troveManager.Troves(account2Wallet.address)
  // th.logBN('acct2 debt', acct2Trove[0])
  // th.logBN('acct2 coll', acct2Trove[1])
  // th.logBN('acct2 stake', acct2Trove[2])
  // console.log(`acct2 trove status: ${acct2Trove[3]}`)

  // // Log deployer's pending debt token gain - check fees went to staker (deloyer)
  // deployerDebtTokenRevShare = await protocolTokenContracts.protocolTokenStaking.getPendingDebtTokenGain(deployerWallet.address)
  // th.logBN("deployer pending debt token revenue share from staking, after acct 2 opened trove", deployerDebtTokenRevShare)

  // //  --- deployer withdraws staking gains ---
  // console.log("CHECK DEPLOYER WITHDRAWING STAKING GAINS")

  // // check deployer's debt token balance before withdrawing staking gains
  // deployerDebtTokenBal = await coreContracts.debtToken.balanceOf(deployerWallet.address)
  // th.logBN('deployer debt token bal before withdrawing staking gains', deployerDebtTokenBal)

  // // Deployer withdraws staking gains
  // await mdh.sendAndWaitForTransaction(protocolTokenContracts.protocolTokenStaking.unstake(0, { gasPrice, gasLimit: 1000000 }))

  // // check deployer's debt token balance after withdrawing staking gains
  // deployerDebtTokenBal = await coreContracts.debtToken.balanceOf(deployerWallet.address)
  // th.logBN('deployer debt token bal after withdrawing staking gains', deployerDebtTokenBal)

  // // --- System stats  ---

  // Uniswap DebtToken-FIL pool size
  if (uniswapExits) {
    let reserves = await DebtTokenFILPair.getReserves();
    th.logBN("DebtToken-FIL Pair's current debt token reserves", reserves[0]);
    th.logBN("DebtToken-FIL Pair's current FIL reserves", reserves[1]);
  }

  // Number of troves
  const numTroves = await coreContracts.troveManager.getTroveOwnersCount();
  console.log(`number of troves: ${numTroves} `);

  // Sorted list size
  const listSize = await coreContracts.sortedTroves.getSize();
  console.log(`Trove list size: ${listSize} `);

  // Total system debt and coll
  const entireSystemDebt = await coreContracts.troveManager.getEntireSystemDebt();
  const entireSystemColl = await coreContracts.troveManager.getEntireSystemColl();
  th.logBN("Entire system debt", entireSystemDebt);
  th.logBN("Entire system coll", entireSystemColl);

  // TCR
  const TCR = await coreContracts.troveManager.getTCR(pythPriceResponse[1]);
  console.log(`TCR: ${TCR}`);

  // current borrowing rate
  const baseRate = await coreContracts.troveManager.baseRate();
  const currentBorrowingRate = await coreContracts.troveManager.getBorrowingRateWithDecay();
  th.logBN("Base rate", baseRate);
  th.logBN("Current borrowing rate", currentBorrowingRate);

  // total SP deposits
  const totalSPDeposits = await coreContracts.stabilityPool.getTotalDebtTokenDeposits();
  th.logBN("Total debt token SP deposits", totalSPDeposits);

  // total ProtocolToken Staked in ProtocolTokenStaking
  const totalProtocolTokenStaked =
    await protocolTokenContracts.protocolTokenStaking.totalProtocolTokenStaked();
  th.logBN("Total ProtocolToken staked", totalProtocolTokenStaked);

  // total LP tokens staked in Unipool
  const totalLPTokensStaked = await unipool.totalSupply();
  th.logBN("Total LP (DebtToken-FIL) tokens staked in unipool", totalLPTokensStaked);

  // --- State variables ---

  // TroveManager
  console.log("TroveManager state variables:");
  const totalStakes = await coreContracts.troveManager.totalStakes();
  const totalStakesSnapshot = await coreContracts.troveManager.totalStakesSnapshot();
  const totalCollateralSnapshot = await coreContracts.troveManager.totalCollateralSnapshot();
  th.logBN("Total trove stakes", totalStakes);
  th.logBN("Snapshot of total trove stakes before last liq. ", totalStakesSnapshot);
  th.logBN("Snapshot of total trove collateral before last liq. ", totalCollateralSnapshot);

  const L_FIL = await coreContracts.troveManager.L_FIL();
  const L_Debt = await coreContracts.troveManager.L_Debt();
  th.logBN("L_FIL", L_FIL);
  th.logBN("L_Debt", L_Debt);

  // StabilityPool
  console.log("StabilityPool state variables:");
  const P = await coreContracts.stabilityPool.P();
  const currentScale = await coreContracts.stabilityPool.currentScale();
  const currentEpoch = await coreContracts.stabilityPool.currentEpoch();
  const S = await coreContracts.stabilityPool.epochToScaleToSum(currentEpoch, currentScale);
  const G = await coreContracts.stabilityPool.epochToScaleToG(currentEpoch, currentScale);
  th.logBN("Product P", P);
  th.logBN("Current epoch", currentEpoch);
  th.logBN("Current scale", currentScale);
  th.logBN("Sum S, at current epoch and scale", S);
  th.logBN("Sum G, at current epoch and scale", G);

  // ProtocolTokenStaking
  console.log("ProtocolTokenStaking state variables:");
  const F_DebtToken = await protocolTokenContracts.protocolTokenStaking.F_DebtToken();
  const F_FIL = await protocolTokenContracts.protocolTokenStaking.F_FIL();
  th.logBN("F_DebtToken", F_DebtToken);
  th.logBN("F_FIL", F_FIL);

  // CommunityIssuance
  console.log("CommunityIssuance state variables:");
  const totalProtocolTokenIssued =
    await protocolTokenContracts.communityIssuance.totalProtocolTokenIssued();
  th.logBN("Total ProtocolToken issued to depositors / front ends", totalProtocolTokenIssued);

  // TODO: Uniswap *ProtocolToken-FIL* pool size (check it's deployed?)

  // ************************
  // --- NOT FOR APRIL 5: Deploy a ProtocolToken2 with General Safe as beneficiary to test minting ProtocolToken showing up in Gnosis App  ---

  // // General Safe ProtocolToken bal before:
  // const realGeneralSafeAddr = "0xF06016D822943C42e3Cb7FC3a6A3B1889C1045f8"

  //   const ProtocolToken2EthersFactory = await ethers.getContractFactory("ProtocolToken2", deployerWallet)
  //   const protocolToken2 = await ProtocolToken2EthersFactory.deploy(
  //     "0xF41E0DD45d411102ed74c047BdA544396cB71E27",  // CI param: LC1
  //     "0x9694a04263593AC6b895Fc01Df5929E1FC7495fA", // ProtocolToken Staking param: LC2
  //     "0x98f95E112da23c7b753D8AE39515A585be6Fb5Ef", // LCF param: LC3
  //     realGeneralSafeAddr,  // bounty/hackathon param: REAL general safe addr
  //     "0x98f95E112da23c7b753D8AE39515A585be6Fb5Ef", // LP rewards param: LC3
  //     deployerWallet.address, // multisig param: deployer wallet
  //     {gasPrice, gasLimit: 10000000}
  //   )

  //   console.log(`protocolToken2 address: ${protocolToken2.address}`)

  //   let generalSafeProtocolTokenBal = await protocolToken2.balanceOf(realGeneralSafeAddr)
  //   console.log(`generalSafeProtocolTokenBal: ${generalSafeProtocolTokenBal}`)

  // ************************
  // --- NOT FOR APRIL 5: Test short-term lockup contract ProtocolToken withdrawal on mainnet ---

  // now = (await ethers.provider.getBlock(latestBlock)).timestamp

  // const LCShortTermEthersFactory = await ethers.getContractFactory("LockupContractShortTerm", deployerWallet)

  // new deployment
  // const LCshortTerm = await LCShortTermEthersFactory.deploy(
  //   protocolTokenContracts.protocolToken.address,
  //   deployerWallet.address,
  //   now,
  //   {gasPrice, gasLimit: 1000000}
  // )

  // LCshortTerm.deployTransaction.wait()

  // existing deployment
  // const deployedShortTermLC = await new ethers.Contract(
  //   "0xbA8c3C09e9f55dA98c5cF0C28d15Acb927792dC7",
  //   LCShortTermEthersFactory.interface,
  //   deployerWallet
  // )

  // new deployment
  // console.log(`Short term LC Address:  ${LCshortTerm.address}`)
  // console.log(`recorded beneficiary in short term LC:  ${await LCshortTerm.beneficiary()}`)
  // console.log(`recorded short term LC name:  ${await LCshortTerm.NAME()}`)

  // existing deployment
  //   console.log(`Short term LC Address:  ${deployedShortTermLC.address}`)
  //   console.log(`recorded beneficiary in short term LC:  ${await deployedShortTermLC.beneficiary()}`)
  //   console.log(`recorded short term LC name:  ${await deployedShortTermLC.NAME()}`)
  //   console.log(`recorded short term LC name:  ${await deployedShortTermLC.unlockTime()}`)
  //   now = (await ethers.provider.getBlock(latestBlock)).timestamp
  //   console.log(`time now: ${now}`)

  //   // check deployer ProtocolToken bal
  //   let deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  //   console.log(`deployerProtocolTokenBal before he withdraws: ${deployerProtocolTokenBal}`)

  //   // check LC ProtocolToken bal
  //   let LC_ProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployedShortTermLC.address)
  //   console.log(`LC ProtocolToken bal before withdrawal: ${LC_ProtocolTokenBal}`)

  // // withdraw from LC
  // const withdrawFromShortTermTx = await deployedShortTermLC.withdrawProtocolToken( {gasPrice, gasLimit: 1000000})
  // withdrawFromShortTermTx.wait()

  // // check deployer bal after LC withdrawal
  // deployerProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployerWallet.address)
  // console.log(`deployerProtocolTokenBal after he withdraws: ${deployerProtocolTokenBal}`)

  //   // check LC ProtocolToken bal
  //   LC_ProtocolTokenBal = await protocolTokenContracts.protocolToken.balanceOf(deployedShortTermLC.address)
  //   console.log(`LC ProtocolToken bal after withdrawal: ${LC_ProtocolTokenBal}`)
}

const inputFile = require(
  `./inputs/${hre.network.name === "localhost" ? "testnet" : hre.network.name}.js`,
);

deploy(inputFile)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
