// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Interfaces/ITellorCaller.sol";
import "./OpenZeppelin/math/SafeMath.sol";
import "./ITellor.sol";
/*
 * This contract has a single external function that calls Tellor: getTellorCurrentValue().
 *
 * The function is called by the contract PriceFeed.sol. If any of its inner calls to Tellor revert,
 * this function will revert, and PriceFeed will catch the failure and handle it accordingly.
 *
 * The function comes from Tellor's own wrapper contract, 'UsingTellor.sol':
 * https://github.com/tellor-io/usingtellor/blob/master/contracts/UsingTellor.sol
 *
 */
contract TellorCaller is ITellorCaller {
    using SafeMath for uint256;

    bytes32 public immutable queryId;
    uint256 public constant DISPUTE_BUFFER = 20 minutes;

    ITellor public immutable tellor;

    uint256 public lastStoredTimestamp;
    uint256 public lastStoredPrice;

    constructor(address _tellorMasterAddress) {
        tellor = ITellor(_tellorMasterAddress);
        bytes memory _queryData = abi.encode("SpotPrice", abi.encode("fil", "usd"));
        queryId = keccak256(_queryData);
    }

    /**
     * @dev Allows a user contract to read the price from Tellor and perform some best practice checks
     * on the retrieved data
     * @return ifRetrieve bool true if it is able to retrieve a value, the value, and the value's timestamp
     * @return _value the value retrieved
     * @return timestamp the value's timestamp
     */
    function getTellorCurrentValue()
        external
        override
        returns (bool ifRetrieve, uint256 _value, uint256 timestamp)
    {
        // retrieve the most recent 20+ minute old price.
        // the buffer allows time for a bad value to be disputed
        (bool _ifRetrieve, bytes memory _data, uint256 _timestamp) = tellor.getDataBefore(
            queryId,
            block.timestamp.sub(DISPUTE_BUFFER)
        );

        if (!_ifRetrieve || _timestamp == 0 || _data.length == 0) {
            return (false, 0, _timestamp);
        }

        // decode the value from bytes to uint256
        _value = abi.decode(_data, (uint256));

        if (_timestamp > lastStoredTimestamp) {
            lastStoredTimestamp = _timestamp;
            lastStoredPrice = _value;
            return (true, _value, _timestamp);
        } else {
            return (true, lastStoredPrice, lastStoredTimestamp);
        }
    }
}
