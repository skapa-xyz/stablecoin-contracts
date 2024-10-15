// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Interfaces/IDebtToken.sol";

contract DebtTokenCaller {
    IDebtToken debtToken;

    function setDebtToken(IDebtToken _debtToken) external {
        debtToken = _debtToken;
    }

    function debtTokenMint(address _account, uint _amount) external {
        debtToken.mint(_account, _amount);
    }

    function debtTokenBurn(address _account, uint _amount) external {
        debtToken.burn(_account, _amount);
    }

    function debtTokenSendToPool(address _sender, address _poolAddress, uint256 _amount) external {
        debtToken.sendToPool(_sender, _poolAddress, _amount);
    }

    function debtTokenReturnFromPool(
        address _poolAddress,
        address _receiver,
        uint256 _amount
    ) external {
        debtToken.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
