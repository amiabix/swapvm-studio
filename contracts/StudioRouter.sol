// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Uses SwapVM release/1.1, © 2025 Degensoft Ltd; see vendor/swap-vm/LICENSES/SwapVM-1.1.txt.
pragma solidity 0.8.30;
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraits} from "swap-vm/src/libs/MakerTraits.sol";
import {Context, ContextLib} from "swap-vm/src/libs/VM.sol";
import {IStudioPricing} from "./interfaces/IStudioPricing.sol";

/// @notice A single external-pricing opcode. No generated native instructions.
contract StudioRouter is SwapVM {
    using ContextLib for Context;
    address public immutable executor;

    constructor(address aqua, address weth, address owner) SwapVM(aqua, weth, owner, "StudioRouter", "1") {
        executor = msg.sender;
    }

    function makeOrder(address maker, address module, bytes memory params) public pure returns (ISwapVM.Order memory) {
        require(params.length <= 128, "params too large");
        bytes memory args = abi.encode(module, params);
        return ISwapVM.Order(maker, MakerTraits.wrap(1 << 254), abi.encodePacked(uint8(0), uint8(args.length), args));
    }

    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory ops)
    {
        ops = new function(Context memory, bytes calldata) internal[](1);
        ops[0] = _price;
    }

    function _price(Context memory ctx, bytes calldata args) internal view {
        require(msg.sender == executor && ctx.query.taker == executor, "executor only");
        (address module, bytes memory params) = abi.decode(args, (address, bytes));
        require(
            ctx.query.orderHash == keccak256(abi.encode(makeOrder(ctx.query.maker, module, params))),
            "noncanonical order"
        );
        uint256 amount = ctx.query.isExactIn ? ctx.swap.amountIn : ctx.swap.amountOut;
        bytes memory data = abi.encodeCall(
            IStudioPricing.quote, (amount, ctx.query.isExactIn, ctx.swap.balanceIn, ctx.swap.balanceOut, params)
        );
        // Fixed output buffer prevents returndata bombs; the call cannot write state.
        bool ok;
        uint256 size;
        uint256 amountIn;
        uint256 amountOut;
        assembly ("memory-safe") {
            let result := mload(0x40)
            ok := staticcall(200000, module, add(data, 32), mload(data), result, 64)
            size := returndatasize()
            amountIn := mload(result)
            amountOut := mload(add(result, 32))
        }
        require(ok && size == 64, "pricing failed");
        require(amountIn > 0 && amountOut > 0 && amountOut <= ctx.swap.balanceOut, "invalid amounts");
        require(ctx.query.isExactIn ? amountIn == amount : amountOut == amount, "amount lie");
        ctx.swap.amountIn = amountIn;
        ctx.swap.amountOut = amountOut;
    }
}
