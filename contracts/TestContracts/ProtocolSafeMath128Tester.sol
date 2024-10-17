// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/ProtocolSafeMath128.sol";

/* Tester contract for math functions in ProtocolSafeMath128.sol library. */

contract ProtocolSafeMath128Tester {
    using ProtocolSafeMath128 for uint128;

    function add(uint128 a, uint128 b) external pure returns (uint128) {
        return a.add(b);
    }

    function sub(uint128 a, uint128 b) external pure returns (uint128) {
        return a.sub(b);
    }
}
