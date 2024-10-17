// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./BaseMath.sol";
import "./ProtocolMath.sol";
import "../Interfaces/IActivePool.sol";
import "../Interfaces/IDefaultPool.sol";
import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/IProtocolBase.sol";

/*
 * Base contract for TroveManager, BorrowerOperations and StabilityPool. Contains global system constants and
 * common functions.
 */
contract ProtocolBase is BaseMath, IProtocolBase {
    using SafeMath for uint;

    uint public constant _100pct = 1000000000000000000; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint public constant MCR = 1100000000000000000; // 110%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint public constant CCR = 1500000000000000000; // 150%

    uint public constant PERCENT_DIVISOR = 200; // dividing by 200 yields 0.5%

    uint public constant BORROWING_FEE_FLOOR = (DECIMAL_PRECISION / 1000) * 5; // 0.5%

    // Amount of debt tokens to be locked in gas pool on opening troves
    uint public immutable GAS_COMPENSATION;

    // Minimum amount of net debt a trove must have
    uint public immutable MIN_NET_DEBT;

    IActivePool public activePool;

    IDefaultPool public defaultPool;

    IPriceFeed public override priceFeed;

    constructor(uint _gasCompensation, uint _minNetDebt) {
        GAS_COMPENSATION = _gasCompensation;
        MIN_NET_DEBT = _minNetDebt;
    }

    // --- Gas compensation functions ---

    // Returns the composite debt (drawn debt + gas compensation) of a trove, for the purpose of ICR calculation
    function _getCompositeDebt(uint _debt) internal view returns (uint) {
        return _debt.add(GAS_COMPENSATION);
    }

    function _getNetDebt(uint _debt) internal view returns (uint) {
        return _debt.sub(GAS_COMPENSATION);
    }

    // Return the amount of FIL to be drawn from a trove's collateral and sent as gas compensation.
    function _getCollGasCompensation(uint _entireColl) internal pure returns (uint) {
        return _entireColl / PERCENT_DIVISOR;
    }

    function getEntireSystemColl() public view returns (uint entireSystemColl) {
        uint activeColl = activePool.getFIL();
        uint liquidatedColl = defaultPool.getFIL();

        return activeColl.add(liquidatedColl);
    }

    function getEntireSystemDebt() public view returns (uint entireSystemDebt) {
        uint activeDebt = activePool.getDebt();
        uint closedDebt = defaultPool.getDebt();

        return activeDebt.add(closedDebt);
    }

    function _getTCR(uint _price) internal view returns (uint TCR) {
        uint entireSystemColl = getEntireSystemColl();
        uint entireSystemDebt = getEntireSystemDebt();

        TCR = ProtocolMath._computeCR(entireSystemColl, entireSystemDebt, _price);

        return TCR;
    }

    function _checkRecoveryMode(uint _price) internal view returns (bool) {
        uint TCR = _getTCR(_price);

        return TCR < CCR;
    }

    function _requireUserAcceptsFee(uint _fee, uint _amount, uint _maxFeePercentage) internal pure {
        uint feePercentage = _fee.mul(DECIMAL_PRECISION).div(_amount);
        require(feePercentage <= _maxFeePercentage, "Fee exceeded provided maximum");
    }

    function _requireSameInitialParameters(address contractAddress) internal view {
        require(
            ProtocolBase(contractAddress).GAS_COMPENSATION() == GAS_COMPENSATION,
            "GAS_COMPENSATION mismatch"
        );
        require(
            ProtocolBase(contractAddress).MIN_NET_DEBT() == MIN_NET_DEBT,
            "MIN_NET_DEBT mismatch"
        );
    }
}
