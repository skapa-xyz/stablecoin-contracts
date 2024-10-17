// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../ProtocolToken/ProtocolTokenStaking.sol";

contract ProtocolTokenStakingTester is ProtocolTokenStaking {
    function requireCallerIsTroveManager() external view {
        _requireCallerIsTroveManager();
    }
}
