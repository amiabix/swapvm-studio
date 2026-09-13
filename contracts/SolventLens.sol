// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";

/// @notice Read-only Aqua inventory snapshots. Position IDs are supplied by the caller/indexer.
/// Values overlap across siblings: do not sum deliverable amounts as independent backing.
contract SolventLens {
    struct Position { address app; bytes32 strategyHash; address token; }
    struct Inventory { uint256 advertised; uint256 onHand; uint256 approved; uint256 deliverable; bool active; }
    uint256 public constant MAX_POSITIONS = 128;

    function inventory(IAqua aqua, address maker, Position[] calldata positions)
        external view returns (Inventory[] memory result)
    {
        require(positions.length <= MAX_POSITIONS, "too many positions");
        result = new Inventory[](positions.length);
        for (uint256 i; i < positions.length; ++i) {
            Position calldata p = positions[i];
            (uint248 allocated, uint8 count) = aqua.rawBalances(maker, p.app, p.strategyHash, p.token);
            uint256 onHand = IERC20(p.token).balanceOf(maker);
            uint256 approved = IERC20(p.token).allowance(maker, address(aqua));
            bool active = count > 0 && count != 255;
            result[i] = Inventory(allocated,onHand,approved,active ? Math.min(allocated,Math.min(onHand,approved)) : 0,active);
        }
    }
}
