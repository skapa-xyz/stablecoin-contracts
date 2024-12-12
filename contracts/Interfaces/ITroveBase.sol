// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./IPriceFeed.sol";

interface ITroveBase {
    event ActivePoolAddressChanged(address _activePoolAddress);
    event DefaultPoolAddressChanged(address _defaultPoolAddress);
}
