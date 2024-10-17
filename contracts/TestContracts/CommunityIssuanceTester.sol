// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../ProtocolToken/CommunityIssuance.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    using SafeMath for uint;

    function obtainProtocolToken(uint _amount) external {
        protocolToken.transfer(msg.sender, _amount);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
        return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueProtocolToken() external returns (uint) {
        // No checks on caller address

        uint latestTotalProtocolTokenIssued = protocolTokenSupplyCap
            .mul(_getCumulativeIssuanceFraction())
            .div(DECIMAL_PRECISION);
        uint issuance = latestTotalProtocolTokenIssued.sub(totalProtocolTokenIssued);

        totalProtocolTokenIssued = latestTotalProtocolTokenIssued;
        return issuance;
    }
}
