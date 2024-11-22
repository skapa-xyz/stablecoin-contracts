// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../PriceFeed.sol";
import "../Dependencies/AggregatorV3Interface.sol";
import "./MockAggregator.sol";

contract MockPriceFeed is PriceFeed {
    function setPrice(int _price) public onlyOwner {
        MockAggregator mockPriceAggregator = MockAggregator(address(priceAggregator));

        mockPriceAggregator.setPrice(_price);
        mockPriceAggregator.setLatestRoundId(1);
        mockPriceAggregator.setUpdateTime(0);

        _changeStatus(Status.chainlinkWorking);
    }

    function setPriceAggregator(address _aggregator, int _price) external onlyOwner {
        priceAggregator = AggregatorV3Interface(_aggregator);
        setPrice(_price);
    }
}
