// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./IProtocolToken.sol";
import "./IDebtToken.sol";

interface IProtocolTokenStaking {
    // --- Events --

    event ProtocolTokenAddressChanged(address _protocolTokenAddress);
    event DebtTokenAddressChanged(address _debtTokenAddress);
    event TroveManagerAddressChanged(address _troveManager);
    event BorrowerOperationsAddressChanged(address _borrowerOperationsAddress);
    event ActivePoolAddressChanged(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint debtTokenGain, uint FILGain);
    event F_FILUpdated(uint _F_FIL);
    event F_DebtTokenUpdated(uint _F_DebtToken);
    event TotalProtocolTokenStakedUpdated(uint _totalProtocolTokenStaked);
    event FILSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_FIL, uint _F_DebtToken);

    event UnallocatedFILUpdated(uint _unallocatedFIL);
    event UnallocatedDebtTokenUpdated(uint _unallocatedDebtToken);

    // --- Functions ---

    function protocolToken() external view returns (IProtocolToken);
    function debtToken() external view returns (IDebtToken);

    function stake(uint _tokenAmount) external;

    function unstake(uint _tokenAmount) external;

    function increaseF_FIL(uint _FILFee) external;

    function increaseF_DebtToken(uint _debtTokenFee) external;

    function getPendingFILGain(address _user) external view returns (uint);

    function getPendingDebtTokenGain(address _user) external view returns (uint);
}
