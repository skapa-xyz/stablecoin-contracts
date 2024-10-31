// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

contract CheckContract {
    /**
     * Check that the account is not the zero address
     */
    function checkContract(address _account) internal pure {
        require(_account != address(0), "Account cannot be zero address");
    }
}
