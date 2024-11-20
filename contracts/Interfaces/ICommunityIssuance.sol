// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface ICommunityIssuance {
    // --- Events ---

    event ProtocolTokenAddressSet(address _protocolTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event ProtocolTokenSupplyCapUpdated(uint _protocolTokenSupplyCap);
    event TotalProtocolTokenIssuedUpdated(uint _totalProtocolTokenIssued);

    // --- Functions ---

    function protocolTokenSupplyCap() external view returns (uint);

    function issueProtocolToken() external returns (uint);

    function sendProtocolToken(address _account, uint _amount) external;
}
