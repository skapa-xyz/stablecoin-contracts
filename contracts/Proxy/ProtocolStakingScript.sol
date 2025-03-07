// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IProtocolTokenStaking.sol";

contract ProtocolStakingScript is CheckContract {
    IProtocolTokenStaking immutable protocolTokenStaking;

    constructor(address _protocolTokenStakingAddress) {
        checkContract(_protocolTokenStakingAddress);
        protocolTokenStaking = IProtocolTokenStaking(_protocolTokenStakingAddress);
    }

    function stake(uint _tokenAmount) external {
        protocolTokenStaking.stake(_tokenAmount);
    }
}
