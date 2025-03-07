// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./ProtocolBase.sol";
import "../Interfaces/IActivePool.sol";
import "../Interfaces/IDefaultPool.sol";
import "../Interfaces/ITroveBase.sol";
import "../Dependencies/CheckContract.sol";

/*
 * Base contract for Trove-related contracts (TroveManager, BorrowerOperations).
 */
contract TroveBase is ProtocolBase, CheckContract, ITroveBase {
    using SafeMath for uint;

    IActivePool public activePool;
    IDefaultPool public defaultPool;

    constructor(
        uint _gasCompensation,
        uint _minNetDebt
    ) ProtocolBase(_gasCompensation, _minNetDebt) {}

    function __TroveBase_setAddresses(
        address _activePoolAddress,
        address _defaultPoolAddress
    ) internal {
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);

        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
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
    uint256[48] private __gap;
}
