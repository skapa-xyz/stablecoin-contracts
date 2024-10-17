// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface ICommunityIssuance {
    // --- Events ---

    event ProtocolTokenAddressSet(address _protocolTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalProtocolTokenIssuedUpdated(uint _totalProtocolTokenIssued);

    // --- Functions ---

    function setAddresses(address _protocolTokenAddress, address _stabilityPoolAddress) external;

    function issueProtocolToken() external returns (uint);

    function sendProtocolToken(address _account, uint _amount) external;
}
