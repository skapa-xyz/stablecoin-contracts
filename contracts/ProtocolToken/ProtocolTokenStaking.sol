// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IProtocolToken.sol";
import "../Interfaces/IProtocolTokenStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IDebtToken.sol";

contract ProtocolTokenStaking is IProtocolTokenStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "ProtocolTokenStaking";

    mapping(address => uint) public stakes;
    uint public totalProtocolTokenStaked;

    uint public F_FIL; // Running sum of FIL fees per-ProtocolToken-staked
    uint public F_DebtToken; // Running sum of ProtocolToken fees per-ProtocolToken-staked

    // User snapshots of F_FIL and F_DebtToken, taken at the point at which their latest deposit was made
    mapping(address => Snapshot) public snapshots;

    struct Snapshot {
        uint F_FIL_Snapshot;
        uint F_DebtToken_Snapshot;
    }

    IProtocolToken public protocolToken;
    IDebtToken public debtToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Functions ---

    function setAddresses(
        address _protocolTokenAddress,
        address _debtTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external override onlyOwner {
        checkContract(_protocolTokenAddress);
        checkContract(_debtTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        protocolToken = IProtocolToken(_protocolTokenAddress);
        debtToken = IDebtToken(_debtTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit ProtocolTokenAddressSet(_protocolTokenAddress);
        emit DebtTokenAddressSet(_debtTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated FIL and Debt Token gains to them.
    function stake(uint _tokenAmount) external override {
        _requireNonZeroAmount(_tokenAmount);

        uint currentStake = stakes[msg.sender];

        uint FILGain;
        uint debtTokenGain;
        // Grab any accumulated FIL and Debt Token gains from the current stake
        if (currentStake != 0) {
            FILGain = _getPendingFILGain(msg.sender);
            debtTokenGain = _getPendingDebtTokenGain(msg.sender);
        }

        _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_tokenAmount);

        // Increase user’s stake and total ProtocolToken staked
        stakes[msg.sender] = newStake;
        totalProtocolTokenStaked = totalProtocolTokenStaked.add(_tokenAmount);
        emit TotalProtocolTokenStakedUpdated(totalProtocolTokenStaked);

        // Transfer ProtocolToken from caller to this contract
        protocolToken.sendToProtocolTokenStaking(msg.sender, _tokenAmount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, debtTokenGain, FILGain);

        // Send accumulated Debt Token and FIL gains to the caller
        if (currentStake != 0) {
            debtToken.transfer(msg.sender, debtTokenGain);
            _sendFILGainToUser(FILGain);
        }
    }

    // Unstake the ProtocolToken and send the it back to the caller, along with their accumulated Debt Token & FIL gains.
    // If requested amount > stake, send their entire stake.
    function unstake(uint _tokenAmount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated FIL and Debt Token gains from the current stake
        uint FILGain = _getPendingFILGain(msg.sender);
        uint debtTokenGain = _getPendingDebtTokenGain(msg.sender);

        _updateUserSnapshots(msg.sender);

        if (_tokenAmount > 0) {
            uint protocolTokenToWithdraw = LiquityMath._min(_tokenAmount, currentStake);

            uint newStake = currentStake.sub(protocolTokenToWithdraw);

            // Decrease user's stake and total ProtocolToken staked
            stakes[msg.sender] = newStake;
            totalProtocolTokenStaked = totalProtocolTokenStaked.sub(protocolTokenToWithdraw);
            emit TotalProtocolTokenStakedUpdated(totalProtocolTokenStaked);

            // Transfer unstaked ProtocolToken to user
            protocolToken.transfer(msg.sender, protocolTokenToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, debtTokenGain, FILGain);

        // Send accumulated Debt Token and FIL gains to the caller
        debtToken.transfer(msg.sender, debtTokenGain);
        _sendFILGainToUser(FILGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_FIL(uint _FILFee) external override {
        _requireCallerIsTroveManager();
        uint FILFeePerProtocolTokenStaked;

        if (totalProtocolTokenStaked > 0) {
            FILFeePerProtocolTokenStaked = _FILFee.mul(DECIMAL_PRECISION).div(
                totalProtocolTokenStaked
            );
        }

        F_FIL = F_FIL.add(FILFeePerProtocolTokenStaked);
        emit F_FILUpdated(F_FIL);
    }

    function increaseF_DebtToken(uint _debtTokenFee) external override {
        _requireCallerIsBorrowerOperations();
        uint debtTokenFeePerProtocolTokenStaked;

        if (totalProtocolTokenStaked > 0) {
            debtTokenFeePerProtocolTokenStaked = _debtTokenFee.mul(DECIMAL_PRECISION).div(
                totalProtocolTokenStaked
            );
        }

        F_DebtToken = F_DebtToken.add(debtTokenFeePerProtocolTokenStaked);
        emit F_DebtTokenUpdated(F_DebtToken);
    }

    // --- Pending reward functions ---

    function getPendingFILGain(address _user) external view override returns (uint) {
        return _getPendingFILGain(_user);
    }

    function _getPendingFILGain(address _user) internal view returns (uint) {
        uint F_FIL_Snapshot = snapshots[_user].F_FIL_Snapshot;
        uint FILGain = stakes[_user].mul(F_FIL.sub(F_FIL_Snapshot)).div(DECIMAL_PRECISION);
        return FILGain;
    }

    function getPendingDebtTokenGain(address _user) external view override returns (uint) {
        return _getPendingDebtTokenGain(_user);
    }

    function _getPendingDebtTokenGain(address _user) internal view returns (uint) {
        uint F_DebtToken_Snapshot = snapshots[_user].F_DebtToken_Snapshot;
        uint debtTokenGain = stakes[_user].mul(F_DebtToken.sub(F_DebtToken_Snapshot)).div(
            DECIMAL_PRECISION
        );
        return debtTokenGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_FIL_Snapshot = F_FIL;
        snapshots[_user].F_DebtToken_Snapshot = F_DebtToken;
        emit StakerSnapshotsUpdated(_user, F_FIL, F_DebtToken);
    }

    function _sendFILGainToUser(uint FILGain) internal {
        emit EtherSent(msg.sender, FILGain);
        (bool success, ) = msg.sender.call{value: FILGain}("");
        require(success, "ProtocolTokenStaking: Failed to send accumulated FILGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "ProtocolTokenStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(
            msg.sender == borrowerOperationsAddress,
            "ProtocolTokenStaking: caller is not BorrowerOps"
        );
    }

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "ProtocolTokenStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {
        require(currentStake > 0, "ProtocolTokenStaking: User must have a non-zero stake");
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, "ProtocolTokenStaking: Amount must be non-zero");
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
