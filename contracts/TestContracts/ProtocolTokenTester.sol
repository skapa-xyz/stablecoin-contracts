// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../ProtocolToken/ProtocolToken.sol";

contract ProtocolTokenTester is ProtocolToken {
    function unprotectedMint(address account, uint256 amount) external {
        // No check for the caller here

        _mint(account, amount);
    }

    function unprotectedSendToProtocolTokenStaking(address _sender, uint256 _amount) external {
        // No check for the caller here
        _transfer(_sender, protocolTokenStakingAddress, _amount);
    }

    function callInternalApprove(
        address owner,
        address spender,
        uint256 amount
    ) external returns (bool) {
        _approve(owner, spender, amount);
        return true;
    }

    function callInternalTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(sender, recipient, amount);
        return true;
    }

    function getChainId() external pure returns (uint256 chainID) {
        //return _chainID(); // it’s private
        assembly {
            chainID := chainid()
        }
    }
}
