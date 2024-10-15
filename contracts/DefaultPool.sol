// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./Interfaces/IDefaultPool.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";

/*
 * The Default Pool holds the FIL and debt (but not debt tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending FIL and debt, its pending FIL and debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IDefaultPool {
    using SafeMath for uint256;

    string public constant NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal FIL; // deposited FIL tracker
    uint256 internal debt; // debt

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
     * Returns the FIL state variable.
     *
     * Not necessarily equal to the the contract's raw FIL balance - filecoin can be forcibly sent to contracts.
     */
    function getFIL() external view override returns (uint) {
        return FIL;
    }

    function getDebt() external view override returns (uint) {
        return debt;
    }

    // --- Pool functionality ---

    function sendFILToActivePool(uint _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        FIL = FIL.sub(_amount);
        emit DefaultPoolFILBalanceUpdated(FIL);
        emit EtherSent(activePool, _amount);

        (bool success, ) = activePool.call{value: _amount}("");
        require(success, "DefaultPool: sending FIL failed");
    }

    function increaseDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        debt = debt.add(_amount);
        emit DefaultPoolDebtUpdated(debt);
    }

    function decreaseDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        debt = debt.sub(_amount);
        emit DefaultPoolDebtUpdated(debt);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "DefaultPool: Caller is not the ActivePool");
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "DefaultPool: Caller is not the TroveManager");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        FIL = FIL.add(msg.value);
        emit DefaultPoolFILBalanceUpdated(FIL);
    }
}
