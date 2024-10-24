// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/OpenZeppelin/token/ERC20/IERC20.sol";
import "../Dependencies/CheckContract.sol";

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
}
