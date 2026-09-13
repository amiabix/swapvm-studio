// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {SwapQuery, SwapRegisters} from "swap-vm/src/libs/VM.sol";
import {DeliverableBalances} from "../contracts/DeliverableBalances.sol";
import {Token} from "./Studio.t.sol";

abstract contract DeliverableArithmeticFixture is Test {
    DeliverableBalances module;
    Token token;
    address maker = address(0x1234);
    address spender = address(0x5678);
    function setUp() public {
        module = new DeliverableBalances();
        token = new Token();
        token.mint(maker, 40);
        vm.prank(maker); token.approve(spender, 30);
    }
    function run(uint8 mode, uint256 x, uint256 y) internal view returns (SwapRegisters memory result) {
        SwapQuery memory q; q.maker = maker; q.tokenOut = address(token);
        SwapRegisters memory s = SwapRegisters(x, y, 7, 8, 9);
        (uint256 pc, uint256 consumed, SwapRegisters memory r) = module.extruction(true, 123, q, s, abi.encodePacked(mode, spender), hex"1234");
        require(pc == 123 && consumed == 0 && r.amountIn == 7 && r.amountOut == 8 && r.amountNetPulled == 9, "non-balance state changed");
        return r;
    }
}

contract DeliverableArithmeticTest is DeliverableArithmeticFixture {
    function testProportionalCeilsInputWithoutRoundingRatio() public view {
        SwapRegisters memory r = run(0, 101, 100);
        assertEq(r.balanceOut, 30);
        assertEq(r.balanceIn, 31);
    }
    function testAsymmetricOnlyChangesOutput() public view {
        SwapRegisters memory r = run(1, 101, 100);
        assertEq(r.balanceOut, 30); assertEq(r.balanceIn, 101);
    }
    function testInertBothModes() public view {
        for (uint8 m; m < 2; m++) {
            SwapRegisters memory r = run(m, 101, 20);
            assertEq(keccak256(abi.encode(r)), keccak256(abi.encode(SwapRegisters(101,20,7,8,9))));
        }
    }
}

contract DeliverableEdgeTest is DeliverableArithmeticFixture {
    function testWalletClampsWhenAllowanceIsAmple() public {
        vm.prank(maker); token.approve(spender, type(uint256).max);
        SwapRegisters memory r = run(0, 100, 100);
        assertEq(r.balanceOut, 40); assertEq(r.balanceIn, 40);
    }
    function testRevocationReturnsZeroRegistersInModule() public {
        vm.prank(maker); token.approve(spender, 0);
        assertEq(run(0, 100, 100).balanceIn, 0); assertEq(run(0, 100, 100).balanceOut, 0);
        assertEq(run(1, 100, 100).balanceIn, 100); assertEq(run(1, 100, 100).balanceOut, 0);
    }
    function testZeroAllocationNoDivision() public view {
        assertEq(run(0, 100, 0).balanceIn, 100); assertEq(run(1, 100, 0).balanceOut, 0);
    }
    function testLargeProductDoesNotOverflow() public view {
        SwapRegisters memory r = run(0, type(uint256).max, type(uint256).max);
        assertEq(r.balanceIn, 30); assertEq(r.balanceOut, 30);
    }
    function testModeSpotDivergence() public view {
        SwapRegisters memory a = run(0, 100, 100); SwapRegisters memory b = run(1, 100, 100);
        assertEq(a.balanceOut * 1e18 / a.balanceIn, 1e18);
        assertEq(b.balanceOut * 1e18 / b.balanceIn, 3e17);
    }
    function testRejectMalformedArgs() public {
        SwapQuery memory q; SwapRegisters memory s;
        vm.expectRevert(); module.extruction(true, 0, q, s, hex"00", "");
        vm.expectRevert(); module.extruction(true, 0, q, s, abi.encodePacked(uint8(2), spender), "");
        vm.expectRevert(); module.extruction(true, 0, q, s, abi.encodePacked(uint8(0), address(0)), "");
    }
    function testFuzz_ClampAndRounding(uint128 x, uint128 y, uint128 wallet, uint128 approved, bool asymmetric) public {
        deal(address(token), maker, wallet);
        vm.prank(maker); token.approve(spender, approved);
        SwapRegisters memory r = run(asymmetric ? 1 : 0, x, y);
        uint256 d = y < wallet ? y : wallet; if (approved < d) d = approved;
        assertEq(r.balanceOut, d);
        if (asymmetric || y == 0 || d == y) assertEq(r.balanceIn, x);
        else {
            assertLe(r.balanceIn, x);
            assertGe(r.balanceIn * y, uint256(x) * d);
            if (r.balanceIn != 0) assertLt((r.balanceIn - 1) * y, uint256(x) * d);
        }
    }
}
