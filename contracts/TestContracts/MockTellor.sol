// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

contract MockTellor {
    // --- Mock price data ---

    bool didRetrieve = true; // default to a positive retrieval
    uint private price;
    uint private updateTime;

    bool private revertRequest;

    // --- Setters for mock price data ---

    function setPrice(uint _price) external {
        price = _price;
    }

    function setDidRetrieve(bool _didRetrieve) external {
        didRetrieve = _didRetrieve;
    }

    function setUpdateTime(uint _updateTime) external {
        updateTime = _updateTime;
    }

    function setRevertRequest() external {
        revertRequest = !revertRequest;
    }

    // --- Mock data reporting functions ---

    function getDataBefore(
        bytes32, // Here this variable is not used
        uint256 // Here this variable is not used
    ) external view returns (bool _ifRetrieve, bytes memory _value, uint256 _timestampRetrieved) {
        if (revertRequest) {
            require(1 == 0, "Tellor request reverted");
        }
        return (didRetrieve, abi.encodePacked(price), updateTime);
    }

    function getTimestampbyRequestIDandIndex(uint, uint) external view returns (uint) {
        return updateTime;
    }
}
