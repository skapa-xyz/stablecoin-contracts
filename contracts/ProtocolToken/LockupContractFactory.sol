// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Dependencies/OpenZeppelin/access/OwnableUpgradeable.sol";
import "../Dependencies/OpenZeppelin/math/SafeMath.sol";
import "../Dependencies/CheckContract.sol";
import "../Interfaces/ILockupContractFactory.sol";
import "./LockupContract.sol";
import "../Dependencies/console.sol";

/*
 * The LockupContractFactory deploys LockupContracts - its main purpose is to keep a registry of valid deployed
 * LockupContracts.
 *
 * This registry is checked by ProtocolToken when the deployer attempts to transfer ProtocolTokens. During the first year
 * since system deployment, the deployer is only allowed to transfer ProtocolToken to valid LockupContracts that have been
 * deployed by and recorded in the LockupContractFactory. This ensures the deployer's ProtocolToken can't be traded or staked in the
 * first year, and can only be sent to a verified LockupContract which unlocks at least one year after system deployment.
 *
 * LockupContracts can of course be deployed directly, but only those deployed through and recorded in the LockupContractFactory
 * will be considered "valid" by ProtocolToken. This is a convenient way to verify that the target address is a genuine
 * LockupContract.
 */

contract LockupContractFactory is ILockupContractFactory, OwnableUpgradeable, CheckContract {
    using SafeMath for uint;

    // --- Data ---
    string public constant NAME = "LockupContractFactory";

    uint public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public protocolTokenAddress;

    mapping(address => address) public lockupContractToDeployer;
    mapping(address => address) public beneficiaryToLockupContract;

    // --- Functions ---

    function initialize(address _protocolTokenAddress) external initializer {
        __Ownable_init();
        _setAddresses(_protocolTokenAddress);
    }

    function _setAddresses(address _protocolTokenAddress) private {
        checkContract(_protocolTokenAddress);

        protocolTokenAddress = _protocolTokenAddress;
        emit ProtocolTokenAddressChanged(_protocolTokenAddress);
    }

    function deployLockupContract(address _beneficiary, uint _unlockTime) external override {
        address protocolTokenAddressCached = protocolTokenAddress;
        _requireProtocolTokenAddressIsSet(protocolTokenAddressCached);
        LockupContract lockupContract = new LockupContract(
            protocolTokenAddressCached,
            _beneficiary,
            _unlockTime
        );

        lockupContractToDeployer[address(lockupContract)] = msg.sender;
        beneficiaryToLockupContract[_beneficiary] = address(lockupContract);
        emit LockupContractDeployedThroughFactory(
            address(lockupContract),
            _beneficiary,
            _unlockTime,
            msg.sender
        );
    }

    function isRegisteredLockup(address _contractAddress) public view override returns (bool) {
        return lockupContractToDeployer[_contractAddress] != address(0);
    }

    // --- 'require'  functions ---
    function _requireProtocolTokenAddressIsSet(address _protocolTokenAddress) internal pure {
        require(_protocolTokenAddress != address(0), "LCF: ProtocolToken Address is not set");
    }
}
