// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./Interfaces/ICollSurplusPool.sol";
import "./Dependencies/OpenZeppelin/access/OwnableUpgradeable.sol";
import "./Dependencies/OpenZeppelin/math/SafeMath.sol";
import "./Dependencies/CheckContract.sol";

contract CollSurplusPool is OwnableUpgradeable, CheckContract, ICollSurplusPool {
    using SafeMath for uint256;

    string public constant NAME = "CollSurplusPool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public activePoolAddress;

    // deposited FIL tracker
    uint256 internal FIL;
    // Collateral surplus claimable by trove owners
    mapping(address => uint) internal balances;

    // --- Contract setters ---

    function initialize(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress
    ) external initializer {
        __Ownable_init();
        _setAddresses(_borrowerOperationsAddress, _troveManagerAddress, _activePoolAddress);
    }

    function _setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress
    ) private {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
    }

    /* Returns the FIL state variable at ActivePool address.
       Not necessarily equal to the raw filecoin balance - filecoin can be forcibly sent to contracts. */
    function getFIL() external view override returns (uint) {
        return FIL;
    }

    function getCollateral(address _account) external view override returns (uint) {
        return balances[_account];
    }

    // --- Pool functionality ---

    function accountSurplus(address _account, uint _amount) external override {
        _requireCallerIsTroveManager();

        uint newAmount = balances[_account].add(_amount);
        balances[_account] = newAmount;

        emit CollBalanceUpdated(_account, newAmount);
    }

    function claimColl(address _account) external override {
        _requireCallerIsBorrowerOperations();
        uint claimableColl = balances[_account];
        require(claimableColl > 0, "CollSurplusPool: No collateral available to claim");

        balances[_account] = 0;
        emit CollBalanceUpdated(_account, 0);

        FIL = FIL.sub(claimableColl);
        emit FILSent(_account, claimableColl);

        (bool success, ) = _account.call{value: claimableColl}("");
        require(success, "CollSurplusPool: sending FIL failed");
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "CollSurplusPool: Caller is not Borrower Operations"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "CollSurplusPool: Caller is not TroveManager");
    }

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "CollSurplusPool: Caller is not Active Pool");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        FIL = FIL.add(msg.value);
        emit CollSurplusPoolFILBalanceUpdated(FIL);
    }
}
