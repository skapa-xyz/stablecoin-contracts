// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/OpenZeppelin/math/SafeMath.sol";
import "../Dependencies/OpenZeppelin/token/ERC20/IERC20.sol";
import "../Dependencies/ProtocolMath.sol";
import "../Interfaces/IBorrowerOperations.sol";
import "../Interfaces/ITroveManager.sol";
import "../Interfaces/IStabilityPool.sol";
import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/IProtocolTokenStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./FILTransferScript.sol";
import "./ProtocolStakingScript.sol";
import "../Dependencies/console.sol";

contract BorrowerWrappersScript is
    BorrowerOperationsScript,
    FILTransferScript,
    ProtocolStakingScript
{
    using SafeMath for uint;

    string public constant NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable debtToken;
    IERC20 immutable protocolToken;
    IProtocolTokenStaking immutable protocolTokenStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _protocolTokenStakingAddress
    )
        BorrowerOperationsScript(IBorrowerOperations(_borrowerOperationsAddress))
        ProtocolStakingScript(_protocolTokenStakingAddress)
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        IPriceFeed priceFeedCached = troveManagerCached.priceFeed();
        checkContract(address(priceFeedCached));
        priceFeed = priceFeedCached;

        address debtTokenCached = address(troveManagerCached.debtToken());
        checkContract(debtTokenCached);
        debtToken = IERC20(debtTokenCached);

        IProtocolTokenStaking protocolTokenStakingCached = troveManagerCached
            .protocolTokenStaking();
        require(
            _protocolTokenStakingAddress == address(protocolTokenStakingCached),
            "BorrowerWrappersScript: Wrong ProtocolTokenStaking address"
        );
        protocolTokenStaking = protocolTokenStakingCached;

        address protocolTokenCached = address(protocolTokenStakingCached.protocolToken());
        checkContract(protocolTokenCached);
        protocolToken = IERC20(protocolTokenCached);
    }

    function claimCollateralAndOpenTrove(
        uint _maxFee,
        uint _debtTokenAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{value: totalCollateral}(
            _maxFee,
            _debtTokenAmount,
            _upperHint,
            _lowerHint
        );
    }

    function claimSPRewardsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint protocolTokenBalanceBefore = protocolToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint protocolTokenBalanceAfter = protocolToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed FIL to trove, get more debt tokens and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint debtAmount = _getNetDebtAmount(claimedCollateral);
            borrowerOperations.adjustTrove{value: claimedCollateral}(
                _maxFee,
                0,
                debtAmount,
                true,
                _upperHint,
                _lowerHint
            );
            // Provide withdrawn debt token to Stability Pool
            if (debtAmount > 0) {
                stabilityPool.provideToSP(debtAmount, address(0));
            }
        }

        // Stake claimed ProtocolToken
        uint claimedProtocolToken = protocolTokenBalanceAfter.sub(protocolTokenBalanceBefore);
        if (claimedProtocolToken > 0) {
            protocolTokenStaking.stake(claimedProtocolToken);
        }
    }

    function claimStakingGainsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint debtTokenBalanceBefore = debtToken.balanceOf(address(this));
        uint protocolTokenBalanceBefore = protocolToken.balanceOf(address(this));

        // Claim gains
        protocolTokenStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedDebt = debtToken.balanceOf(address(this)).sub(debtTokenBalanceBefore);

        uint netDebtAmount;
        // Top up trove and get more debt tokens, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netDebtAmount = _getNetDebtAmount(gainedCollateral);
            borrowerOperations.adjustTrove{value: gainedCollateral}(
                _maxFee,
                0,
                netDebtAmount,
                true,
                _upperHint,
                _lowerHint
            );
        }

        uint totalDebt = gainedDebt.add(netDebtAmount);
        if (totalDebt > 0) {
            stabilityPool.provideToSP(totalDebt, address(0));

            // Providing to Stability Pool also triggers ProtocolToken claim, so stake it if any
            uint protocolTokenBalanceAfter = protocolToken.balanceOf(address(this));
            uint claimedProtocolToken = protocolTokenBalanceAfter.sub(protocolTokenBalanceBefore);
            if (claimedProtocolToken > 0) {
                protocolTokenStaking.stake(claimedProtocolToken);
            }
        }
    }

    function _getNetDebtAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint debtAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = debtAmount.mul(ProtocolMath.DECIMAL_PRECISION).div(
            ProtocolMath.DECIMAL_PRECISION.add(borrowingRate)
        );

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "BorrowerWrappersScript: caller must have an active trove"
        );
    }
}
