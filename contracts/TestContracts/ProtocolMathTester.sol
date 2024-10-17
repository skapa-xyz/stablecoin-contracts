// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/ProtocolMath.sol";

/* Tester contract for math functions in Math.sol library. */

contract ProtocolMathTester {
    function callMax(uint _a, uint _b) external pure returns (uint) {
        return ProtocolMath._max(_a, _b);
    }

    // Non-view wrapper for gas test
    function callDecPowTx(uint _base, uint _n) external pure returns (uint) {
        return ProtocolMath._decPow(_base, _n);
    }

    // External wrapper
    function callDecPow(uint _base, uint _n) external pure returns (uint) {
        return ProtocolMath._decPow(_base, _n);
    }
}
