// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../DefaultPool.sol";

contract DefaultPoolTester is DefaultPool {
    using SafeMath for uint;

    function unprotectedIncreaseDebt(uint _amount) external {
        debt = debt.add(_amount);
    }

    function unprotectedPayable() external payable {
        FIL = FIL.add(msg.value);
    }
}
