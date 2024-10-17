// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface IProtocolTokenStaking {
    // --- Events --

    event ProtocolTokenAddressSet(address _protocolTokenAddress);
    event DebtTokenAddressSet(address _debtTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint debtTokenGain, uint FILGain);
    event F_FILUpdated(uint _F_FIL);
    event F_DebtTokenUpdated(uint _F_DebtToken);
    event TotalProtocolTokenStakedUpdated(uint _totalProtocolTokenStaked);
    event EtherSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_FIL, uint _F_DebtToken);

    // --- Functions ---

    function setAddresses(
        address _protocolTokenAddress,
        address _debtTokenAddress,
        address _troveManagerAddress,
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) external;

    function stake(uint _tokenAmount) external;

    function unstake(uint _tokenAmount) external;

    function increaseF_FIL(uint _FILFee) external;

    function increaseF_DebtToken(uint _debtTokenFee) external;

    function getPendingFILGain(address _user) external view returns (uint);

    function getPendingDebtTokenGain(address _user) external view returns (uint);
}
