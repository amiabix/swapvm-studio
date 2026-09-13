// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableFixture} from "./DeliverableIntegration.t.sol";
import {AquaSwapVMRouter} from "swap-vm/src/routers/AquaSwapVMRouter.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {SolventLens} from "../contracts/SolventLens.sol";

contract SolventLensTest is DeliverableFixture {
    SolventLens lens;
    function setUp() public {
        Aqua a=new Aqua(); init(new AquaSwapVMRouter(address(a),address(0xdead),address(this),"SwapVM","1"),a);
        lens=new SolventLens();
    }
    function testSiblingInventoryAndRevocation() public {
        ISwapVM.Order memory a=ship(stock,xyc(),0); ISwapVM.Order memory b=ship(stock,xyc(),1);
        SolventLens.Position[] memory ps=new SolventLens.Position[](2);
        ps[0]=SolventLens.Position(address(stock),stock.hash(a),address(output));
        ps[1]=SolventLens.Position(address(stock),stock.hash(b),address(output));
        SolventLens.Inventory[] memory before=lens.inventory(aqua,MAKER,ps);
        assertEq(before[0].advertised+before[1].advertised,2000*R);
        assertEq(before[0].onHand,1000*R);
        fill(stock,a,1500*R);
        SolventLens.Inventory[] memory afterFill=lens.inventory(aqua,MAKER,ps);
        assertEq(afterFill[0].advertised,400*R); assertEq(afterFill[1].advertised,1000*R);
        assertEq(afterFill[0].deliverable,400*R); assertEq(afterFill[1].deliverable,400*R);
        vm.prank(MAKER); output.approve(address(aqua),0);
        SolventLens.Inventory[] memory revoked=lens.inventory(aqua,MAKER,ps);
        assertEq(revoked[1].onHand,400*R); assertEq(revoked[1].deliverable,0);
        address[] memory ts=new address[](2); ts[0]=address(input);ts[1]=address(output);
        bytes32 hashB = stock.hash(b);
        vm.prank(MAKER);aqua.dock(address(stock),hashB,ts);
        SolventLens.Inventory[] memory docked=lens.inventory(aqua,MAKER,ps);
        assertFalse(docked[1].active); assertEq(docked[1].deliverable,0);
    }
    function testPositionLimit() public {
        SolventLens.Position[] memory ps=new SolventLens.Position[](129);
        vm.expectRevert("too many positions");lens.inventory(aqua,MAKER,ps);
    }
}
