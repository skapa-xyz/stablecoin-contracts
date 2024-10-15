// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolDebtUpdated(uint _debt);
    event ActivePoolFILBalanceUpdated(uint _FIL);

    // --- Functions ---
    function sendFIL(address _account, uint _amount) external;
}
