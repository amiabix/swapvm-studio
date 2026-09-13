// SPDX-License-Identifier: MIT
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
