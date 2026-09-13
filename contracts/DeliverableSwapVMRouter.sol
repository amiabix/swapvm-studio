// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {AquaOpcodes} from "swap-vm/src/opcodes/AquaOpcodes.sol";
import {Context} from "swap-vm/src/libs/VM.sol";
import {DeliverableBalanceLib} from "./DeliverableBalances.sol";
import {Simulator} from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

/// @notice Aqua release/1.1 router extended with deliverable balances.
contract DeliverableSwapVMRouter is Simulator, SwapVM, AquaOpcodes {
    constructor(address aqua, address weth, address owner)
        SwapVM(aqua, weth, owner, "SwapVM", "1") AquaOpcodes(aqua) {}
    // Append to the pinned AquaOpcodes table: all 0..32 entries retain their meaning.
    uint8 public constant DELIVERABLE_BALANCES = 33;

    function _instructions() internal pure override returns (function(Context memory, bytes calldata) internal[] memory ops) {
        ops = _opcodes();
        uint256 count = ops.length;
        assert(count == DELIVERABLE_BALANCES);
        // _opcodes allocates its array last. Extend only if the next word is free;
        // fail closed if a compiler/upstream change invalidates this pinned layout.
        // This preserves the original entries without a second allocation/copy loop.
        assembly ("memory-safe") {
            let end := add(ops, mul(add(count, 1), 32))
            if iszero(eq(end, mload(0x40))) { revert(0, 0) }
            mstore(0x40, add(end, 32))
            mstore(ops, add(count, 1))
        }
        ops[count] = _deliverableBalances;
    }
    function _deliverableBalances(Context memory ctx, bytes calldata args) internal view {
        DeliverableBalanceLib.clamp(ctx.query.maker, ctx.query.tokenOut, ctx.swap, args);
    }
}
