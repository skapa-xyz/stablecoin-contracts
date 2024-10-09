// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../ActivePool.sol";

contract ActivePoolTester is ActivePool {
    
    function unprotectedIncreaseDebt(uint _amount) external {
        debt  = debt.add(_amount);
    }

    function unprotectedPayable() external payable {
        FIL = FIL.add(msg.value);
    }
}
