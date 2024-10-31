// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface ILockupContractFactory {
    // --- Events ---

    event ProtocolTokenAddressSet(address _protocolTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function deployLockupContract(address _beneficiary, uint _unlockTime) external;

    function isRegisteredLockup(address _addr) external view returns (bool);
}
