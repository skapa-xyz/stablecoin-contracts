// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

// Common interface for the Pools.
interface IPool {
    // --- Events ---

    event FILBalanceUpdated(uint _newBalance);
    event DebtTokenBalanceUpdated(uint _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event FILSent(address _to, uint _amount);

    // --- Functions ---

    function getFIL() external view returns (uint);

    function getDebt() external view returns (uint);

    function increaseDebt(uint _amount) external;

    function decreaseDebt(uint _amount) external;
}
