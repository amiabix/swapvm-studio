// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableNativeFixture} from "./DeliverableNative.t.sol";
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";

/// @notice Full call gas, excluding fixture setup and transaction intrinsic/calldata gas.
/// cool() resets both account and storage access warmth before each cold measurement.
contract DeliverableGasTest is DeliverableNativeFixture {
    function cool(SwapVM router) internal {
        vm.cool(address(router)); vm.cool(address(aqua)); vm.cool(address(input));
        vm.cool(address(output)); vm.cool(address(module));
    }
    function bench(string memory name, uint8 path, uint8 mode, bool healthy) internal {
        deal(address(output), MAKER, (healthy ? 2000 : 500) * R);
        SwapVM router = path == 2 ? nativeRouter : stock;
        bytes memory code = xyc();
        if (path == 1) code = abi.encodePacked(ext(mode), code);
        if (path == 2) code = abi.encodePacked(nativeCode(mode), code);
        ISwapVM.Order memory o = ship(router, code, 0);
        ISwapVM viewRouter = router.asView();
        bytes memory d = data(true);
        cool(router);
        (,uint256 expected,) = viewRouter.quote(o,address(input),address(output),100*R,d);
        vm.snapshotGasLastCall(name, "quote_cold");
        viewRouter.quote(o,address(input),address(output),100*R,d);
        vm.snapshotGasLastCall(name, "quote_warm");
        uint256 snapshot = vm.snapshotState();
        cool(router);
        (,uint256 actual,) = router.swap(o,address(input),address(output),100*R,d);
        vm.snapshotGasLastCall(name, "swap_cold");
        assertEq(actual,expected);
        vm.revertToState(snapshot);
        cool(router);
        viewRouter.quote(o,address(input),address(output),100*R,d);
        (,actual,) = router.swap(o,address(input),address(output),100*R,d);
        vm.snapshotGasLastCall(name, "swap_after_quote");
        assertEq(actual,expected);
    }
    function testGas_BaselineHealthy() public { bench("baseline_healthy",0,0,true); }
    function testGas_BaselineConstrained() public { bench("baseline_constrained",0,0,false); }
    function testGas_ExternalHealthyA() public { bench("external_healthy_a",1,0,true); }
    function testGas_ExternalHealthyB() public { bench("external_healthy_b",1,1,true); }
    function testGas_NativeHealthyA() public { bench("native_healthy_a",2,0,true); }
    function testGas_NativeHealthyB() public { bench("native_healthy_b",2,1,true); }
    function testGas_ExternalConstrainedA() public { bench("external_constrained_a",1,0,false); }
    function testGas_ExternalConstrainedB() public { bench("external_constrained_b",1,1,false); }
    function testGas_NativeConstrainedA() public { bench("native_constrained_a",2,0,false); }
    function testGas_NativeConstrainedB() public { bench("native_constrained_b",2,1,false); }
}
