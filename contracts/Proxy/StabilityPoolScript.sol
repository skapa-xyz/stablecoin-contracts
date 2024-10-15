// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IStabilityPool.sol";

contract StabilityPoolScript is CheckContract {
    string public constant NAME = "StabilityPoolScript";

    IStabilityPool immutable stabilityPool;

    constructor(IStabilityPool _stabilityPool) {
        checkContract(address(_stabilityPool));
        stabilityPool = _stabilityPool;
    }

    function provideToSP(uint _amount, address _frontEndTag) external {
        stabilityPool.provideToSP(_amount, _frontEndTag);
    }

    function withdrawFromSP(uint _amount) external {
        stabilityPool.withdrawFromSP(_amount);
    }

    function withdrawFILGainToTrove(address _upperHint, address _lowerHint) external {
        stabilityPool.withdrawFILGainToTrove(_upperHint, _lowerHint);
    }
}
