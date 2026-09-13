// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableArithmeticFixture} from "./DeliverableBalances.t.sol";
import {SwapRegisters} from "swap-vm/src/libs/VM.sol";

contract DeliverableReferenceTest is DeliverableArithmeticFixture {
    function testPythonModel6000StatesBothModes() public {
        uint256[6][] memory cases = abi.decode(vm.readFileBinary("reference/cases.abi"),(uint256[6][]));
        assertEq(cases.length,6000);
        for(uint256 i; i<cases.length; i++) this.checkCase(cases[i]);
    }
    // Fresh external-call memory per case prevents the Solidity test harness itself
    // growing memory quadratically across thousands of cheatcode encodings.
    function checkCase(uint256[6] calldata c) external {
        deal(address(token),maker,c[2]); vm.prank(maker); token.approve(spender,c[3]);
        SwapRegisters memory a=run(0,c[0],c[1]); SwapRegisters memory b=run(1,c[0],c[1]);
        assertEq(a.balanceIn,c[4]); assertEq(a.balanceOut,c[5]);
        assertEq(b.balanceIn,c[0]); assertEq(b.balanceOut,c[5]);
    }
}
