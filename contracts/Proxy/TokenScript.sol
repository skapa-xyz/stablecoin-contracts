// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/CheckContract.sol";
import "../Dependencies/IERC20.sol";

contract TokenScript is CheckContract {
    string public constant NAME = "TokenScript";

    IERC20 immutable token;

    constructor(address _tokenAddress) {
        checkContract(_tokenAddress);
        token = IERC20(_tokenAddress);
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        token.transfer(recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return token.allowance(owner, spender);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        token.approve(spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        token.transferFrom(sender, recipient, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        token.increaseAllowance(spender, addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        token.decreaseAllowance(spender, subtractedValue);
        return true;
    }
}
