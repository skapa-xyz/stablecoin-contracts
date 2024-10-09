// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/ILQTYToken.sol";
import "../Interfaces/ILQTYStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IDebtToken.sol";

contract LQTYStaking is ILQTYStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string constant public NAME = "LQTYStaking";

    mapping( address => uint) public stakes;
    uint public totalLQTYStaked;

    uint public F_FIL;  // Running sum of FIL fees per-LQTY-staked
    uint public F_DebtToken; // Running sum of LQTY fees per-LQTY-staked

    // User snapshots of F_FIL and F_DebtToken, taken at the point at which their latest deposit was made
    mapping (address => Snapshot) public snapshots; 

    struct Snapshot {
        uint F_FIL_Snapshot;
        uint F_DebtToken_Snapshot;
    }
    
    ILQTYToken public lqtyToken;
    IDebtToken public debtToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event DebtTokenAddressSet(address _debtTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint debtTokenGain, uint FILGain);
    event F_FILUpdated(uint _F_FIL);
    event F_DebtTokenUpdated(uint _F_DebtToken);
    event TotalLQTYStakedUpdated(uint _totalLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_FIL, uint _F_DebtToken);

    // --- Functions ---

    function setAddresses
    (
        address _lqtyTokenAddress,
        address _debtTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) 
        external 
        onlyOwner 
        override 
    {
        checkContract(_lqtyTokenAddress);
        checkContract(_debtTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        lqtyToken = ILQTYToken(_lqtyTokenAddress);
        debtToken = IDebtToken(_debtTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit LQTYTokenAddressSet(_lqtyTokenAddress);
        emit DebtTokenAddressSet(_debtTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated FIL and Debt Token gains to them. 
    function stake(uint _LQTYamount) external override {
        _requireNonZeroAmount(_LQTYamount);

        uint currentStake = stakes[msg.sender];

        uint FILGain;
        uint debtTokenGain;
        // Grab any accumulated FIL and Debt Token gains from the current stake
        if (currentStake != 0) {
            FILGain = _getPendingFILGain(msg.sender);
            debtTokenGain = _getPendingDebtTokenGain(msg.sender);
        }
    
       _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_LQTYamount);

        // Increase user’s stake and total LQTY staked
        stakes[msg.sender] = newStake;
        totalLQTYStaked = totalLQTYStaked.add(_LQTYamount);
        emit TotalLQTYStakedUpdated(totalLQTYStaked);

        // Transfer LQTY from caller to this contract
        lqtyToken.sendToLQTYStaking(msg.sender, _LQTYamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, debtTokenGain, FILGain);

         // Send accumulated Debt Token and FIL gains to the caller
        if (currentStake != 0) {
            debtToken.transfer(msg.sender, debtTokenGain);
            _sendFILGainToUser(FILGain);
        }
    }

    // Unstake the LQTY and send the it back to the caller, along with their accumulated Debt Token & FIL gains. 
    // If requested amount > stake, send their entire stake.
    function unstake(uint _LQTYamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated FIL and Debt Token gains from the current stake
        uint FILGain = _getPendingFILGain(msg.sender);
        uint debtTokenGain = _getPendingDebtTokenGain(msg.sender);
        
        _updateUserSnapshots(msg.sender);

        if (_LQTYamount > 0) {
            uint LQTYToWithdraw = LiquityMath._min(_LQTYamount, currentStake);

            uint newStake = currentStake.sub(LQTYToWithdraw);

            // Decrease user's stake and total LQTY staked
            stakes[msg.sender] = newStake;
            totalLQTYStaked = totalLQTYStaked.sub(LQTYToWithdraw);
            emit TotalLQTYStakedUpdated(totalLQTYStaked);

            // Transfer unstaked LQTY to user
            lqtyToken.transfer(msg.sender, LQTYToWithdraw);

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
        uint FILFeePerLQTYStaked;
     
        if (totalLQTYStaked > 0) {FILFeePerLQTYStaked = _FILFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);}

        F_FIL = F_FIL.add(FILFeePerLQTYStaked); 
        emit F_FILUpdated(F_FIL);
    }

    function increaseF_DebtToken(uint _debtTokenFee) external override {
        _requireCallerIsBorrowerOperations();
        uint debtTokenFeePerLQTYStaked;
        
        if (totalLQTYStaked > 0) {debtTokenFeePerLQTYStaked = _debtTokenFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);}
        
        F_DebtToken = F_DebtToken.add(debtTokenFeePerLQTYStaked);
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
        uint debtTokenGain = stakes[_user].mul(F_DebtToken.sub(F_DebtToken_Snapshot)).div(DECIMAL_PRECISION);
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
        require(success, "LQTYStaking: Failed to send accumulated FILGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "LQTYStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "LQTYStaking: caller is not BorrowerOps");
    }

     function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "LQTYStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {  
        require(currentStake > 0, 'LQTYStaking: User must have a non-zero stake');  
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, 'LQTYStaking: Amount must be non-zero');
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
