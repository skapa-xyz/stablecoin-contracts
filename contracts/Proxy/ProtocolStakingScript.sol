// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IProtocolTokenStaking.sol";

contract ProtocolStakingScript is CheckContract {
    IProtocolTokenStaking immutable protocolStakingStaking;

    constructor(address _protocolTokenStakingAddress) {
        checkContract(_protocolTokenStakingAddress);
        protocolStakingStaking = IProtocolTokenStaking(_protocolTokenStakingAddress);
    }

    function stake(uint _tokenAmount) external {
        protocolStakingStaking.stake(_tokenAmount);
    }
}
