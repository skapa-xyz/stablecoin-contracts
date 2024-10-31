// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./Interfaces/ITroveManager.sol";
import "./Interfaces/ISortedTroves.sol";
import "./Dependencies/OpenZeppelin/access/OwnableUpgradeable.sol";
import "./Dependencies/ProtocolBase.sol";
import "./Dependencies/CheckContract.sol";

contract HintHelpers is ProtocolBase, OwnableUpgradeable, CheckContract {
    using SafeMath for uint;

    string public constant NAME = "HintHelpers";

    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // --- Events ---

    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    // --- Functions ---

    constructor(
        uint _gasCompensation,
        uint _minNetDebt
    ) ProtocolBase(_gasCompensation, _minNetDebt) {}

    // --- Dependency setters ---

    function initialize(
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external initializer {
        __Ownable_init();
        _setAddresses(_sortedTrovesAddress, _troveManagerAddress);
    }

    function _setAddresses(address _sortedTrovesAddress, address _troveManagerAddress) private {
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        _requireSameInitialParameters(_troveManagerAddress);

        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
    }

    /* getRedemptionHints() - Helper function for finding the right hints to pass to redeemCollateral().
     *
     * It simulates a redemption of `_debtTokenAmount` to figure out where the redemption sequence will start and what state the final Trove
     * of the sequence will end up in.
     *
     * Returns three hints:
     *  - `firstRedemptionHint` is the address of the first Trove with ICR >= MCR (i.e. the first Trove that will be redeemed).
     *  - `partialRedemptionHintNICR` is the final nominal ICR of the last Trove of the sequence after being hit by partial redemption,
     *     or zero in case of no partial redemption.
     *  - `truncatedDebtTokenAmount` is the maximum amount that can be redeemed out of the the provided `_debtTokenAmount`. This can be lower than
     *    `_debtTokenAmount` when redeeming the full amount would leave the last Trove of the redemption sequence with less net debt than the
     *    minimum allowed value (i.e. MIN_NET_DEBT).
     *
     * The number of Troves to consider for redemption can be capped by passing a non-zero value as `_maxIterations`, while passing zero
     * will leave it uncapped.
     */

    function getRedemptionHints(
        uint _debtTokenAmount,
        uint _price,
        uint _maxIterations
    )
        external
        view
        returns (
            address firstRedemptionHint,
            uint partialRedemptionHintNICR,
            uint truncatedDebtTokenAmount
        )
    {
        ISortedTroves sortedTrovesCached = sortedTroves;

        uint remainingDebtToken = _debtTokenAmount;
        address currentTroveuser = sortedTrovesCached.getLast();

        while (
            currentTroveuser != address(0) &&
            troveManager.getCurrentICR(currentTroveuser, _price) < MCR
        ) {
            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        firstRedemptionHint = currentTroveuser;

        if (_maxIterations == 0) {
            _maxIterations = uint(-1);
        }

        while (currentTroveuser != address(0) && remainingDebtToken > 0 && _maxIterations-- > 0) {
            uint netDebt = _getNetDebt(troveManager.getTroveDebt(currentTroveuser)).add(
                troveManager.getPendingDebtReward(currentTroveuser)
            );

            if (netDebt > remainingDebtToken) {
                if (netDebt > MIN_NET_DEBT) {
                    uint maxRedeemableDebtToken = ProtocolMath._min(
                        remainingDebtToken,
                        netDebt.sub(MIN_NET_DEBT)
                    );

                    uint FIL = troveManager.getTroveColl(currentTroveuser).add(
                        troveManager.getPendingFILReward(currentTroveuser)
                    );

                    uint newColl = FIL.sub(
                        maxRedeemableDebtToken.mul(DECIMAL_PRECISION).div(_price)
                    );
                    uint newDebt = netDebt.sub(maxRedeemableDebtToken);

                    uint compositeDebt = _getCompositeDebt(newDebt);
                    partialRedemptionHintNICR = ProtocolMath._computeNominalCR(
                        newColl,
                        compositeDebt
                    );

                    remainingDebtToken = remainingDebtToken.sub(maxRedeemableDebtToken);
                }
                break;
            } else {
                remainingDebtToken = remainingDebtToken.sub(netDebt);
            }

            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        truncatedDebtTokenAmount = _debtTokenAmount.sub(remainingDebtToken);
    }

    /* getApproxHint() - return address of a Trove that is, on average, (length / numTrials) positions away in the 
    sortedTroves list from the correct insert position of the Trove to be inserted. 
    
    Note: The output address is worst-case O(n) positions away from the correct insert position, however, the function 
    is probabilistic. Input can be tuned to guarantee results to a high degree of confidence, e.g:

    Submitting numTrials = k * sqrt(length), with k = 15 makes it very, very likely that the ouput address will 
    be <= sqrt(length) positions away from the correct insert position.
    */
    function getApproxHint(
        uint _CR,
        uint _numTrials,
        uint _inputRandomSeed
    ) external view returns (address hintAddress, uint diff, uint latestRandomSeed) {
        uint arrayLength = troveManager.getTroveOwnersCount();

        if (arrayLength == 0) {
            return (address(0), 0, _inputRandomSeed);
        }

        hintAddress = sortedTroves.getLast();
        diff = ProtocolMath._getAbsoluteDifference(_CR, troveManager.getNominalICR(hintAddress));
        latestRandomSeed = _inputRandomSeed;

        uint i = 1;

        while (i < _numTrials) {
            latestRandomSeed = uint(keccak256(abi.encodePacked(latestRandomSeed)));

            uint arrayIndex = latestRandomSeed % arrayLength;
            address currentAddress = troveManager.getTroveFromTroveOwnersArray(arrayIndex);
            uint currentNICR = troveManager.getNominalICR(currentAddress);

            // check if abs(current - CR) > abs(closest - CR), and update closest if current is closer
            uint currentDiff = ProtocolMath._getAbsoluteDifference(currentNICR, _CR);

            if (currentDiff < diff) {
                diff = currentDiff;
                hintAddress = currentAddress;
            }
            i++;
        }
    }

    function computeNominalCR(uint _coll, uint _debt) external pure returns (uint) {
        return ProtocolMath._computeNominalCR(_coll, _debt);
    }

    function computeCR(uint _coll, uint _debt, uint _price) external pure returns (uint) {
        return ProtocolMath._computeCR(_coll, _debt, _price);
    }
}
