// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableFixture} from "./DeliverableIntegration.t.sol";
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {AquaSwapVMRouter} from "swap-vm/src/routers/AquaSwapVMRouter.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {DeliverableSwapVMRouter} from "../contracts/DeliverableSwapVMRouter.sol";

abstract contract DeliverableNativeFixture is DeliverableFixture {
    DeliverableSwapVMRouter nativeRouter;
    function setUp() public {
        Aqua a = new Aqua(); init(new AquaSwapVMRouter(address(a), address(0xdead), address(this), "SwapVM", "1"), a);
        nativeRouter = new DeliverableSwapVMRouter(address(a), address(0xdead), address(this));
        input.approve(address(nativeRouter), type(uint256).max);
    }
    function nativeCode(uint8 mode) internal view returns (bytes memory) {
        return abi.encodePacked(uint8(33), uint8(21), mode, address(aqua));
    }
    function compare(uint8 mode, uint256 wallet, uint256 approval, uint256 amount, bool exactIn) internal {
        deal(address(output), MAKER, wallet);
        vm.prank(MAKER); output.approve(address(aqua), approval);
        ISwapVM.Order memory e = ship(stock, abi.encodePacked(ext(mode), xyc()), 0);
        ISwapVM.Order memory n = ship(nativeRouter, abi.encodePacked(nativeCode(mode), xyc()), 0);
        bytes memory d = data(exactIn);
        (uint256 ei,uint256 eo,) = stock.asView().quote(e,address(input),address(output),amount,d);
        (uint256 ni,uint256 no,) = nativeRouter.asView().quote(n,address(input),address(output),amount,d);
        assertEq(abi.encode(ei,eo),abi.encode(ni,no));
        uint256 snapshot = vm.snapshotState();
        (uint256 actualI,uint256 actualO,) = stock.swap(e,address(input),address(output),amount,d);
        uint256 walletAfter = output.balanceOf(MAKER);
        vm.revertToState(snapshot);
        (uint256 nativeI,uint256 nativeO,) = nativeRouter.swap(n,address(input),address(output),amount,d);
        assertEq(abi.encode(actualI,actualO),abi.encode(nativeI,nativeO));
        assertEq(output.balanceOf(MAKER),walletAfter);
    }
}

contract DeliverableNativeTest is DeliverableNativeFixture {
    function nativeCampaign(uint8 mode, uint256 wallet) internal {
        deal(address(output),MAKER,wallet);
        ISwapVM.Order memory o = ship(nativeRouter,abi.encodePacked(nativeCode(mode),xyc()),mode);
        InvariantConfig memory c = _getDefaultConfig();
        c.exactInTakerData=data(true); c.exactOutTakerData=data(false);
        assertAllInvariantsWithConfig(nativeRouter,o,address(input),address(output),c);
    }
    function testNativeUpstreamHealthyA() public { nativeCampaign(0,2000*R); }
    function testNativeUpstreamHealthyB() public { nativeCampaign(1,2000*R); }
    function testNativeUpstreamConstrainedB() public { nativeCampaign(1,500*R); }
    function testAllExistingOpcodeIndicesPreserved() public {
        bytes memory d=data(true);
        for(uint8 code;code<33;code++) {
            bytes memory program=abi.encodePacked(code,uint8(0),xyc());
            ISwapVM.Order memory a=ship(stock,program,code);
            ISwapVM.Order memory b=ship(nativeRouter,program,code);
            bytes memory qa=abi.encodeCall(ISwapVM.quote,(a,address(input),address(output),R,d));
            bytes memory qb=abi.encodeCall(ISwapVM.quote,(b,address(input),address(output),R,d));
            (bool okA,bytes memory resultA)=address(stock).staticcall(qa);
            (bool okB,bytes memory resultB)=address(nativeRouter).staticcall(qb);
            assertEq(okA,okB); assertEq(resultA,resultB);
        }
    }
    function testNativeMatchesExtructionModeA() public { compare(0,500*R,type(uint256).max,100*R,true); }
    function testNativeMatchesExtructionModeB() public { compare(1,500*R,type(uint256).max,100*R,true); }
    function testNativeMatchesExtructionExactOut() public { compare(0,500*R,400*R,100*R,false); }
    function testNativeHealthyNoOp() public { compare(0,2000*R,type(uint256).max,100*R,true); }
    function testOldProgramStillRunsOnNativeRouter() public {
        ISwapVM.Order memory e = ship(stock,xyc(),0);
        ISwapVM.Order memory n = ship(nativeRouter,xyc(),0);
        assertEq(quote(stock,e,100*R),quote(nativeRouter,n,100*R));
        assertEq(quote(nativeRouter,n,100*R),fill(nativeRouter,n,100*R));
    }
    function testFuzz_NativeExternalEquality(uint256 amount, uint256 wallet, bool mode, bool exactIn) public {
        uint256 w = bound(wallet,100*R,900*R);
        uint256 a = bound(amount,1e12,50*R);
        compare(mode ? 1 : 0,w,w,a,exactIn);
    }
}
