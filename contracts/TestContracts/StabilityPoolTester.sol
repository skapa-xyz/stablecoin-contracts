// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../StabilityPool.sol";

contract StabilityPoolTester is StabilityPool {
    using SafeMath for uint;

    constructor(
        uint _gasCompensation,
        uint _minNetDebt
    ) StabilityPool(_gasCompensation, _minNetDebt) {}

    function unprotectedPayable() external payable {
        FIL = FIL.add(msg.value);
    }

    function setCurrentScale(uint128 _currentScale) external {
        currentScale = _currentScale;
    }

    function setTotalDeposits(uint _totalDebtTokenDeposits) external {
        totalDebtTokenDeposits = _totalDebtTokenDeposits;
    }
}
