// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./IPriceFeed.sol";

interface IProtocolBase {
    function priceFeed() external view returns (IPriceFeed);
}
