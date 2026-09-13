// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableFixture} from "../test/DeliverableIntegration.t.sol";
import {AquaSwapVMRouter as SwapVMRouter} from "swap-vm/src/routers/AquaSwapVMRouter.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";

/// @notice Intentionally RED: preserve the unmodified upstream campaign's counterexample.
/// Run FOUNDRY_TEST=test-counterexamples forge test -vv; expect an additivity failure.
contract DeliverableCounterexampleTest is DeliverableFixture {
    function setUp() public {
        Aqua a = new Aqua(); init(new SwapVMRouter(address(a), address(0xdead), address(this), "SwapVM", "1"), a);
    }
    function testUpstreamClampedProportionalViolatesAdditivity() public { campaign(0, 500 * R); }
}

import {DeliverableNativeFixture} from "../test/DeliverableNative.t.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
contract DeliverableNativeCounterexampleTest is DeliverableNativeFixture {
    function testNativeClampedProportionalViolatesAdditivity() public {
        deal(address(output),MAKER,500*R);
        ISwapVM.Order memory o=ship(nativeRouter,abi.encodePacked(nativeCode(0),xyc()),0);
        InvariantConfig memory c=_getDefaultConfig();
        c.exactInTakerData=data(true); c.exactOutTakerData=data(false);
        assertAllInvariantsWithConfig(nativeRouter,o,address(input),address(output),c);
    }
}
