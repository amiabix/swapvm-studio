// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SwapQuery, SwapRegisters} from "swap-vm/src/libs/VM.sol";

/// @notice Shared arithmetic for external and native instructions; never changes computed amounts.
library DeliverableBalanceLib {
    error InvalidArgsLength(uint256 length);
    error InvalidMode(uint8 mode);
    error ZeroSpender();

    /// @dev args = mode (0 proportional / 1 asymmetric) || settlement spender (20 bytes).
    /// Context omits MakerTraits. The order author MUST encode Aqua for Aqua settlement,
    /// or the executing SwapVM router for signature settlement. This is not inferred.
    function clamp(address maker, address tokenOut, SwapRegisters memory swap, bytes calldata args) internal view {
        if (args.length != 21) revert InvalidArgsLength(args.length);
        uint8 mode = uint8(args[0]);
        if (mode > 1) revert InvalidMode(mode);
        address spender = address(bytes20(args[1:21]));
        if (spender == address(0)) revert ZeroSpender();
        uint256 allocated = swap.balanceOut;
        if (allocated == 0) return;
        uint256 deliverable = Math.min(allocated, IERC20(tokenOut).balanceOf(maker));
        deliverable = Math.min(deliverable, IERC20(tokenOut).allowance(maker, spender));
        if (deliverable == allocated) return;
        if (mode == 0) {
            swap.balanceIn = Math.mulDiv(swap.balanceIn, deliverable, allocated, Math.Rounding.Ceil);
        }
        swap.balanceOut = deliverable;
    }
}

/// @notice Stateless extruction module compatible with the unmodified SwapVM router.
contract DeliverableBalances {
    function extruction(
        bool,
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata args,
        bytes calldata
    ) external view returns (uint256, uint256, SwapRegisters memory updatedSwap) {
        updatedSwap = swap;
        DeliverableBalanceLib.clamp(query.maker, query.tokenOut, updatedSwap, args);
        return (nextPC, 0, updatedSwap);
    }
}
