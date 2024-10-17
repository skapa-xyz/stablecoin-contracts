// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/IERC20.sol";
import "../Dependencies/IERC2612.sol";

interface IProtocolToken is IERC20, IERC2612 {
    // --- Functions ---

    function sendToProtocolTokenStaking(address _sender, uint256 _amount) external;

    function getDeploymentStartTime() external view returns (uint256);

    function getLpRewardsEntitlement() external view returns (uint256);
}
