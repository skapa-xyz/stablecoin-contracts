// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../Interfaces/ITellorCaller.sol";
import "./ITellor.sol";
import "./SafeMath.sol";
/*
 * This contract has a single external function that calls Tellor: getTellorCurrentValue().
 *
 * The function is called by the Liquity contract PriceFeed.sol. If any of its inner calls to Tellor revert,
 * this function will revert, and PriceFeed will catch the failure and handle it accordingly.
 *
 * The function comes from Tellor's own wrapper contract, 'UsingTellor.sol':
 * https://github.com/tellor-io/usingtellor/blob/master/contracts/UsingTellor.sol
 *
 */
contract TellorCaller is ITellorCaller {
    using SafeMath for uint256;

    bytes32 public immutable btcQueryId;
    uint256 public constant DISPUTE_BUFFER = 20 minutes;
    uint256 public constant STALENESS_AGE = 12 hours;

    ITellor public tellor;

    constructor(address _tellorMasterAddress) {
        tellor = ITellor(_tellorMasterAddress);
        bytes memory _queryData = abi.encode("SpotPrice", abi.encode("fil", "usd"));
        btcQueryId = keccak256(_queryData);
    }

    /**
     * @dev Allows a user contract to read the price from Tellor and perform some best practice checks
     * on the retrieved data
     * @return ifRetrieve bool true if it is able to retrieve a value, the value, and the value's timestamp
     * @return _value the value retrieved
     * @return timestamp the value's timestamp
     */
    function getTellorCurrentValue()
        public
        view
        override
        returns (bool ifRetrieve, uint256 _value, uint256 timestamp)
    {
        // retrieve the most recent 20+ minute old btc price.
        // the buffer allows time for a bad value to be disputed
        (bool _ifRetrieve, bytes memory _data, uint256 _timestamp) = tellor.getDataBefore(
            btcQueryId,
            block.timestamp.sub(DISPUTE_BUFFER)
        );

        if (!_ifRetrieve || _timestamp == 0 || _data.length == 0) {
            return (false, 0, _timestamp);
        }

        // decode the value from bytes to uint256
        _value = abi.decode(_data, (uint256));

        // check whether value is too old
        require(block.timestamp.sub(_timestamp) <= STALENESS_AGE, "TellorCaller: StalePrice");

        // return the value and timestamp
        return (true, _value, _timestamp);
    }
}
