// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ILQTYStaking {

    // --- Events --
    
    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event DebtTokenAddressSet(address _debtTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint debtTokenGain, uint ETHGain);
    event F_ETHUpdated(uint _F_ETH);
    event F_DebtTokenUpdated(uint _F_DebtToken);
    event TotalLQTYStakedUpdated(uint _totalLQTYStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_ETH, uint _F_DebtToken);

    // --- Functions ---

    function setAddresses
    (
        address _lqtyTokenAddress,
        address _debtTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress
    )  external;

    function stake(uint _LQTYamount) external;

    function unstake(uint _LQTYamount) external;

    function increaseF_ETH(uint _ETHFee) external; 

    function increaseF_DebtToken(uint _debtTokenFee) external;  

    function getPendingETHGain(address _user) external view returns (uint);

    function getPendingDebtTokenGain(address _user) external view returns (uint);
}
