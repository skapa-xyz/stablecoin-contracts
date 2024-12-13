// original file: https://github.com/Synthetixio/Unipool/blob/master/test/Unipool.js
const { time } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { TestHelper } = require("../utils/testHelpers.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");

const { assertRevert } = TestHelper;
const dec = TestHelper.dec;
const toBN = TestHelper.toBN;

const _1e18 = toBN("10").pow(toBN("18"));

const almostEqualDiv1e18 = function (expectedOrig, actualOrig) {
  const expected = expectedOrig.div(_1e18);
  const actual = actualOrig.div(_1e18);
  this.assert(
    expected.eq(actual) ||
      expected.addn(1).eq(actual) ||
      expected.addn(2).eq(actual) ||
      actual.addn(1).eq(expected) ||
      actual.addn(2).eq(expected),
    "expected #{act} to be almost equal #{exp}",
    "expected #{act} to be different from #{exp}",
    expectedOrig.toString(),
    actualOrig.toString(),
  );
};

require("chai").use(function (chai, utils) {
  chai.Assertion.overwriteMethod("almostEqualDiv1e18", function (original) {
    return function (value) {
      var expected = toBN(value.toString());
      var actual = toBN(this._obj);

      almostEqualDiv1e18.apply(this, [expected, actual]);
    };
  });
});

contract("Unipool", function () {
  let owner, wallet1, wallet2, wallet3, wallet4, bountyAddress;
  let multisig = "0x5b5e5CC89636CA2685b4e4f50E66099EBCFAb638"; // Arbitrary address for the multisig, which is not tested in this file

  const deploy = async (that) => {
    const erc20Factory = await deploymentHelper.getFactory("ERC20Mock");
    const unipoolFactory = await deploymentHelper.getFactory("Unipool");
    const nonPayableFactory = await deploymentHelper.getFactory("NonPayable");
    const communityIssuanceFactory = await deploymentHelper.getFactory("CommunityIssuance");
    const protocolTokenFactory = await deploymentHelper.getFactory("ProtocolToken");

    that.uni = await erc20Factory.deploy("Uniswap token", "LPT", owner.address, 0);
    that.pool = await deploymentHelper.deployProxy(unipoolFactory);

    const dumbContract = await nonPayableFactory.deploy();
    that.protocolToken = await deploymentHelper.deployProxy(protocolTokenFactory, [
      dumbContract.address,
      owner.address,
      "0",
    ]);
    const communityIssuance = await deploymentHelper.deployProxy(communityIssuanceFactory, [
      that.protocolToken.address,
      dumbContract.address,
    ]);

    const allocation = [
      { address: multisig, amount: toBN(dec(67000000, 18)) },
      { address: that.pool.address, amount: toBN(dec(1000000, 18)) },
      {
        address: communityIssuance.address,
        amount: toBN(dec(32000000, 18)),
      },
    ];

    await deploymentHelper.allocateProtocolToken(
      { protocolToken: that.protocolToken, communityIssuance },
      allocation,
    );

    // that.lpRewardsEntitlement = await that.protocolToken.getLpRewardsEntitlement();
    that.lpRewardsEntitlement = await that.protocolToken.balanceOf(that.pool.address);

    that.DURATION = toBN(6 * 7 * 24 * 60 * 60); // 6 weeks
    that.rewardRate = that.lpRewardsEntitlement.div(that.DURATION);

    await that.uni.mint(wallet1.address, web3.utils.toWei("1000"));
    await that.uni.mint(wallet2.address, web3.utils.toWei("1000"));
    await that.uni.mint(wallet3.address, web3.utils.toWei("1000"));
    await that.uni.mint(wallet4.address, web3.utils.toWei("1000"));

    await that.uni.connect(wallet1).approve(that.pool.address, toBN(2).pow(toBN(255)));
    await that.uni.connect(wallet2).approve(that.pool.address, toBN(2).pow(toBN(255)));
    await that.uni.connect(wallet3).approve(that.pool.address, toBN(2).pow(toBN(255)));
    await that.uni.connect(wallet4).approve(that.pool.address, toBN(2).pow(toBN(255)));
  };

  before(async () => {
    const signers = await ethers.getSigners();

    [owner, wallet1, wallet2, wallet3, wallet4, bountyAddress] = signers;
  });

  describe("Unipool", async function () {
    beforeEach(async function () {
      await deploy(this);
      await this.pool.setParams(this.protocolToken.address, this.uni.address, this.DURATION);
    });

    it("Two stakers with the same stakes wait DURATION", async function () {
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18("0");
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = await time.latest();
      // time goes by... so slowly

      const stake2 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = await time.latest();

      await time.increase(this.DURATION.toString());

      const timeDiff = stakeTime2.sub(stakeTime1).toString();
      const rewardPerToken = this.rewardRate
        .mul(timeDiff)
        .mul(_1e18)
        .div(stake1)
        .add(this.rewardRate.mul(this.DURATION.sub(timeDiff)).mul(_1e18).div(stake1.add(stake2)));
      const halfEntitlement = this.lpRewardsEntitlement.div(toBN(2));
      const earnedDiff = halfEntitlement.mul(timeDiff).div(this.DURATION);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(rewardPerToken);
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        halfEntitlement.add(earnedDiff),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        halfEntitlement.sub(earnedDiff),
      );
    });

    it("Two stakers with the different (1:3) stakes wait DURATION", async function () {
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18("0");
      expect((await this.pool.balanceOf(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.balanceOf(wallet2.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = toBN((await time.latest()).toString());

      const stake2 = toBN(web3.utils.toWei("3"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = toBN((await time.latest()).toString());

      await time.increaseTo(stakeTime1.add(this.DURATION).toString());

      const timeDiff = stakeTime2.sub(stakeTime1);
      const rewardPerToken1 = this.rewardRate.mul(timeDiff).mul(_1e18).div(stake1);
      const rewardPerToken2 = this.rewardRate
        .mul(this.DURATION.sub(timeDiff))
        .mul(_1e18)
        .div(stake1.add(stake2));
      const rewardPerToken = rewardPerToken1.add(rewardPerToken2);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(rewardPerToken);
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.mul(stake2).div(_1e18),
      );
    });

    it("Two stakers with the different (1:3) stakes wait DURATION and DURATION/2", async function () {
      //
      // 1x: +--------------+
      // 3x:      +---------+
      //

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = toBN((await time.latest()).toString());

      await time.increaseTo(stakeTime1.add(this.DURATION.div(toBN(3))).toString());

      const stake2 = toBN(web3.utils.toWei("3"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = toBN((await time.latest()).toString());

      const timeDiff = stakeTime2.sub(stakeTime1).toString();
      const rewardPerToken1 = this.rewardRate.mul(timeDiff).mul(_1e18).div(stake1);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(rewardPerToken1);
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.mul(stake1).div(_1e18),
      );
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");

      // Forward to week 3 and notifyReward weekly
      await time.increase(this.DURATION.mul(toBN(2)).div(toBN(3)).toString());

      const rewardPerToken2 = this.rewardRate
        .mul(this.DURATION.sub(timeDiff))
        .mul(_1e18)
        .div(stake1.add(stake2));
      const rewardPerToken = rewardPerToken1.add(rewardPerToken2);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(rewardPerToken);
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.mul(stake2).div(_1e18),
      );
    });

    it("Three stakers with the different (1:3:5) stakes wait different durations", async function () {
      //
      // 1x: +----------------+--------+
      // 3x:  +---------------+
      // 5x:         +-----------------+
      //

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = toBN((await time.latest()).toString());

      const stake2 = toBN(web3.utils.toWei("3"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = toBN((await time.latest()).toString());

      await time.increaseTo(stakeTime1.add(this.DURATION.div(toBN(3))).toString());

      const stake3 = toBN(web3.utils.toWei("5"));
      await this.pool.connect(wallet3).stake(stake3);
      const stakeTime3 = toBN((await time.latest()).toString());

      const timeDiff1 = stakeTime2.sub(stakeTime1);
      const timeDiff2 = stakeTime3.sub(stakeTime2);
      const rewardPerToken1 = this.rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
      const rewardPerToken2 = this.rewardRate.mul(timeDiff2).mul(_1e18).div(stake1.add(stake2));
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2),
      );
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.mul(stake2).div(_1e18),
      );

      await time.increaseTo(stakeTime1.add(this.DURATION.mul(toBN(2)).div(toBN(3))).toString());

      await this.pool.connect(wallet2).withdrawAndClaim();
      const exitTime2 = toBN((await time.latest()).toString());

      const timeDiff3 = exitTime2.sub(stakeTime3);
      const rewardPerToken3 = this.rewardRate
        .mul(timeDiff3)
        .mul(_1e18)
        .div(stake1.add(stake2).add(stake3));
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      );
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3).mul(stake1).div(_1e18),
      );
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect(await this.protocolToken.balanceOf(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );
      expect(await this.pool.earned(wallet3.address)).to.be.almostEqualDiv1e18(
        rewardPerToken3.mul(stake3).div(_1e18),
      );

      await time.increaseTo(stakeTime1.add(this.DURATION).toString());

      const timeDiff4 = this.DURATION.sub(exitTime2.sub(stakeTime1));
      const rewardPerToken4 = this.rewardRate.mul(timeDiff4).mul(_1e18).div(stake1.add(stake3));
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3).add(rewardPerToken4),
      );
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1
          .add(rewardPerToken2)
          .add(rewardPerToken3)
          .add(rewardPerToken4)
          .mul(stake1)
          .div(_1e18),
      );
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet3.address)).to.be.almostEqualDiv1e18(
        rewardPerToken3.add(rewardPerToken4).mul(stake3).div(_1e18),
      );
    });

    it("Four stakers with gaps of zero total supply", async function () {
      //
      // 1x: +-------+               |
      // 3x:  +----------+           |
      // 5x:                +------+ |
      // 1x:                         |  +------...
      //                             +-> end of initial duration

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const stake2 = toBN(web3.utils.toWei("3"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet1).withdrawAndClaim();
      const exitTime1 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const timeDiff1 = stakeTime2.sub(stakeTime1);
      const timeDiff2 = exitTime1.sub(stakeTime2);
      const rewardPerToken1 = this.rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
      const rewardPerToken2 = this.rewardRate.mul(timeDiff2).mul(_1e18).div(stake1.add(stake2));
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect(await this.protocolToken.balanceOf(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.mul(stake2).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet2).withdrawAndClaim();
      const exitTime2 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const timeDiff3 = exitTime2.sub(exitTime1);
      const rewardPerToken3 = this.rewardRate.mul(timeDiff3).mul(_1e18).div(stake2);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect(await this.protocolToken.balanceOf(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(6)).toString());

      const stake3 = toBN(web3.utils.toWei("5"));
      await this.pool.connect(wallet3).stake(stake3);
      const stakeTime3 = toBN((await time.latest()).toString());

      const emptyPeriod1 = stakeTime3.sub(exitTime2);
      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(emptyPeriod1).add(this.DURATION).toString(),
      );

      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet3.address)).toString()).to.be.equal("0");

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet3).withdrawAndClaim();
      const exitTime3 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(emptyPeriod1).add(this.DURATION).toString(),
      );

      const timeDiff4 = exitTime3.sub(stakeTime3);
      const rewardPerToken4 = this.rewardRate.mul(timeDiff4).mul(_1e18).div(stake3);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3).add(rewardPerToken4),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet3.address)).toString()).to.be.equal("0");
      expect(await this.protocolToken.balanceOf(wallet3.address)).to.be.almostEqualDiv1e18(
        rewardPerToken4.mul(stake3).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(2)).toString());

      // check that we have reached initial duration
      expect((await time.latest()).toNumber()).to.be.gte(stakeTime1.add(this.DURATION).toNumber());

      const stake4 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet4).stake(stake4);
      const stakeTime4 = toBN((await time.latest()).toString());

      const emptyPeriod2 = stakeTime1.add(emptyPeriod1).add(this.DURATION).sub(exitTime3);
      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime4.add(emptyPeriod2).toString(),
      );

      await time.increase(this.DURATION.div(toBN(2)).toString());

      const timeDiff5 = this.DURATION.sub(exitTime2.sub(stakeTime1).add(timeDiff4));
      const rewardPerToken5 = this.rewardRate.mul(timeDiff5).mul(_1e18).div(stake4);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1
          .add(rewardPerToken2)
          .add(rewardPerToken3)
          .add(rewardPerToken4)
          .add(rewardPerToken5),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet2.address)).toString()).to.be.equal("0");
      expect((await this.pool.earned(wallet3.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet4.address)).to.be.almostEqualDiv1e18(
        rewardPerToken5.mul(stake4).div(_1e18),
      );
    });

    it("Four stakers with gaps of zero total supply, with claims in between", async function () {
      //
      // 1x: +-------+               |
      // 3x:  +----------+           |
      // 5x:                +------+ |
      // 1x:                         |  +------...
      //                             +-> end of initial duration

      const stake1 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet1).stake(stake1);
      const stakeTime1 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const stake2 = toBN(web3.utils.toWei("3"));
      await this.pool.connect(wallet2).stake(stake2);
      const stakeTime2 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet1).withdraw(stake1);
      const exitTime1 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const timeDiff1 = stakeTime2.sub(stakeTime1);
      const timeDiff2 = exitTime1.sub(stakeTime2);
      const rewardPerToken1 = this.rewardRate.mul(timeDiff1).mul(_1e18).div(stake1);
      const rewardPerToken2 = this.rewardRate.mul(timeDiff2).mul(_1e18).div(stake1.add(stake2));
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2),
      );
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.mul(stake2).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet2).withdraw(stake2);
      const exitTime2 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(this.DURATION).toString(),
      );

      const timeDiff3 = exitTime2.sub(exitTime1);
      const rewardPerToken3 = this.rewardRate.mul(timeDiff3).mul(_1e18).div(stake2);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      );
      expect(await this.pool.earned(wallet1.address)).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).mul(stake1).div(_1e18),
      );
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(12)).toString());

      await this.pool.connect(wallet1).claimReward();

      await time.increase(this.DURATION.div(toBN(12)).toString());

      const stake3 = toBN(web3.utils.toWei("5"));
      await this.pool.connect(wallet3).stake(stake3);
      const stakeTime3 = toBN((await time.latest()).toString());

      const emptyPeriod1 = stakeTime3.sub(exitTime2);
      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(emptyPeriod1).add(this.DURATION).toString(),
      );

      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );
      expect((await this.pool.earned(wallet3.address)).toString()).to.be.equal("0");

      await time.increase(this.DURATION.div(toBN(6)).toString());

      await this.pool.connect(wallet3).withdraw(stake3);
      const exitTime3 = toBN((await time.latest()).toString());

      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime1.add(emptyPeriod1).add(this.DURATION).toString(),
      );

      const timeDiff4 = exitTime3.sub(stakeTime3);
      const rewardPerToken4 = this.rewardRate.mul(timeDiff4).mul(_1e18).div(stake3);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1.add(rewardPerToken2).add(rewardPerToken3).add(rewardPerToken4),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );
      expect(await this.pool.earned(wallet3.address)).to.be.almostEqualDiv1e18(
        rewardPerToken4.mul(stake3).div(_1e18),
      );

      await time.increase(this.DURATION.div(toBN(2)).toString());

      // check that we have reached initial duration
      expect((await time.latest()).toNumber()).to.be.gte(stakeTime1.add(this.DURATION).toNumber());

      await this.pool.connect(wallet3).claimReward();

      await time.increase(this.DURATION.div(toBN(12)).toString());

      const stake4 = toBN(web3.utils.toWei("1"));
      await this.pool.connect(wallet4).stake(stake4);
      const stakeTime4 = toBN((await time.latest()).toString());

      const emptyPeriod2 = stakeTime1.add(emptyPeriod1).add(this.DURATION).sub(exitTime3);
      expect((await this.pool.periodFinish()).toString()).to.be.equal(
        stakeTime4.add(emptyPeriod2).toString(),
      );

      await time.increase(this.DURATION.div(toBN(2)).toString());

      const timeDiff5 = this.DURATION.sub(exitTime2.sub(stakeTime1).add(timeDiff4));
      const rewardPerToken5 = this.rewardRate.mul(timeDiff5).mul(_1e18).div(stake4);
      expect(await this.pool.rewardPerToken()).to.be.almostEqualDiv1e18(
        rewardPerToken1
          .add(rewardPerToken2)
          .add(rewardPerToken3)
          .add(rewardPerToken4)
          .add(rewardPerToken5),
      );
      expect((await this.pool.earned(wallet1.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet2.address)).to.be.almostEqualDiv1e18(
        rewardPerToken2.add(rewardPerToken3).mul(stake2).div(_1e18),
      );
      expect((await this.pool.earned(wallet3.address)).toString()).to.be.equal("0");
      expect(await this.pool.earned(wallet4.address)).to.be.almostEqualDiv1e18(
        rewardPerToken5.mul(stake4).div(_1e18),
      );
    });
  });

  describe("Unipool, before calling setAddresses", async function () {
    beforeEach(async function () {
      await deploy(this);
    });

    it("Stake fails", async function () {
      const stake1 = toBN(web3.utils.toWei("1"));
      await assertRevert(
        this.pool.connect(wallet1).stake(stake1),
        "Liqudity Pool Token has not been set yet",
      );
    });

    it("Withdraw falis", async function () {
      const stake1 = toBN(web3.utils.toWei("1"));
      await assertRevert(
        this.pool.connect(wallet1).withdraw(stake1),
        "Liqudity Pool Token has not been set yet",
      );
    });

    it("Claim fails", async function () {
      await assertRevert(
        this.pool.connect(wallet1).claimReward(),
        "Liqudity Pool Token has not been set yet",
      );
    });

    it("Exit fails", async function () {
      await assertRevert(this.pool.connect(wallet1).withdrawAndClaim(), "Cannot withdraw 0");
    });
  });
});
