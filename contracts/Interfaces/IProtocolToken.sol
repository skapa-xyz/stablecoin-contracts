// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/OpenZeppelin/interfaces/IERC2612.sol";
import "../Dependencies/OpenZeppelin/token/ERC20/extensions/IERC20Metadata.sol";

interface IProtocolToken is IERC20Metadata, IERC2612 {
    // --- Events --

    event AnnualAllocationRateUpdated(uint _annualAllocationRate);
    event AnnualAllocationRecipientUpdated(address _annualAllocationRecipient);

    // --- Functions ---

    function sendToProtocolTokenStaking(address _sender, uint256 _amount) external;

    function getAllocationStartTime() external view returns (uint256);
}
