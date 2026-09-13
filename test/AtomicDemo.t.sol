// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {DemoToken, DemoAccount, DemoLiquidity} from "../script/AtomicDemo.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

contract AtomicDemoTest is Test {
    function testDemoAssetsAndMakerAreOwnerControlled() public {
        DemoToken token = new DemoToken("Demo USD", "USD");
        DemoAccount account = new DemoAccount();
        vm.prank(address(123));
        vm.expectRevert();
        token.mint(address(123), 100);
        token.mint(address(account), 100);
        vm.prank(address(123));
        vm.expectRevert();
        account.withdraw(address(token));
        account.withdraw(address(token));
        assertEq(token.balanceOf(address(this)), 100);
        DemoLiquidity lp = new DemoLiquidity(IPoolManager(address(999)));
        vm.expectRevert();
        lp.unlockCallback("");
        vm.prank(address(999));
        vm.expectRevert();
        lp.unlockCallback("");
    }
}
