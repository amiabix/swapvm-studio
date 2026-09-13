// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {CoreInvariants} from "swap-vm/test/invariants/CoreInvariants.t.sol";
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {AquaSwapVMRouter as SwapVMRouter} from "swap-vm/src/routers/AquaSwapVMRouter.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraits} from "swap-vm/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "swap-vm/src/libs/TakerTraits.sol";
import {XYCSwap} from "swap-vm/src/instructions/XYCSwap.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {DeliverableBalances} from "../contracts/DeliverableBalances.sol";
import {Token} from "./Studio.t.sol";

abstract contract DeliverableFixture is CoreInvariants {
    uint256 constant R = 1e18;
    address constant MAKER = address(0x1234);
    Aqua aqua;
    SwapVM stock;
    DeliverableBalances module;
    Token input;
    Token output;

    function init(SwapVM router, Aqua a) internal {
        aqua = a; stock = router;
        module = new DeliverableBalances(); input = new Token(); output = new Token();
        input.mint(address(this), 1e30); output.mint(MAKER, 1000 * R);
        input.approve(address(stock), type(uint256).max);
        vm.prank(MAKER); output.approve(address(aqua), type(uint256).max);
    }
    function ext(uint8 mode) internal view virtual returns (bytes memory) {
        return abi.encodePacked(uint8(32), uint8(41), address(module), mode, address(aqua));
    }
    function xyc() internal pure virtual returns (bytes memory) { return hex"1100"; }
    function saltOpcode() internal pure virtual returns (uint8) { return 20; }
    function ship(SwapVM router, bytes memory program, uint8 salt) internal returns (ISwapVM.Order memory o) {
        o = ISwapVM.Order(MAKER, MakerTraits.wrap(1 << 254), abi.encodePacked(saltOpcode(), uint8(1), salt, program));
        address[] memory tokens = new address[](2); tokens[0] = address(input); tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2); amounts[0] = 1000 * R; amounts[1] = 1000 * R;
        vm.prank(MAKER); aqua.ship(address(router), abi.encode(o), tokens, amounts);
    }
    function data(bool exactIn) internal pure returns (bytes memory) {
        TakerTraitsLib.Args memory a; a.isExactIn = exactIn; a.useTransferFromAndAquaPush = true;
        return TakerTraitsLib.build(a);
    }
    function quote(SwapVM router, ISwapVM.Order memory o, uint256 amount) internal view returns (uint256 out) {
        (,out,) = router.asView().quote(o, address(input), address(output), amount, data(true));
    }
    function fill(SwapVM router, ISwapVM.Order memory o, uint256 amount) internal returns (uint256 out) {
        (,out,) = router.swap(o, address(input), address(output), amount, data(true));
    }
    function _executeSwap(SwapVM router, ISwapVM.Order memory o, address ti, address to, uint256 amount, bytes memory d)
        internal override returns (uint256 ai, uint256 ao) {
        (ai, ao,) = router.swap(o, ti, to, amount, d);
    }
    function campaign(uint8 mode, uint256 wallet) internal {
        deal(address(output), MAKER, wallet);
        ISwapVM.Order memory o = ship(stock, abi.encodePacked(ext(mode), xyc()), mode);
        InvariantConfig memory c = _getDefaultConfig();
        c.exactInTakerData = data(true); c.exactOutTakerData = data(false);
        assertAllInvariantsWithConfig(stock, o, address(input), address(output), c);
    }
    function overadvertisement(uint8 mode) internal {
        ISwapVM.Order memory first = ship(stock, xyc(), 1);
        ISwapVM.Order memory second = ship(stock, abi.encodePacked(ext(mode), xyc()), 2);
        assertEq(fill(stock, first, 1500 * R), 600 * R);
        assertEq(output.balanceOf(MAKER), 400 * R);
        uint256 advertised = quote(stock, second, 1500 * R);
        assertLt(advertised, 400 * R);
        uint256 before = output.balanceOf(address(this));
        assertEq(fill(stock, second, 1500 * R), advertised);
        assertEq(output.balanceOf(address(this)) - before, advertised);
    }
}

contract DeliverableIntegrationTest is DeliverableFixture {
    function setUp() public {
        Aqua a = new Aqua(); init(new SwapVMRouter(address(a), address(0xdead), address(this), "SwapVM", "1"), a);
    }
    function testOveradvertisementModeA() public { overadvertisement(0); }
    function testOveradvertisementModeB() public { overadvertisement(1); }
    function testStockSecondFillReverts() public {
        ISwapVM.Order memory first = ship(stock, xyc(), 1);
        ISwapVM.Order memory second = ship(stock, xyc(), 2);
        fill(stock, first, 1500 * R);
        assertEq(quote(stock, second, 1500 * R), 600 * R);
        vm.expectRevert(); stock.swap(second, address(input), address(output), 1500 * R, data(true));
        assertEq(output.balanceOf(MAKER), 400 * R);
    }
    function testUpstreamHealthyModeA() public { campaign(0, 2000 * R); }
    function testUpstreamHealthyModeB() public { campaign(1, 2000 * R); }
    function testUpstreamClampedModeB() public { campaign(1, 500 * R); }
    function splitComparison(uint8 mode) internal returns (uint256 single, uint256 split) {
        deal(address(output), MAKER, 500 * R);
        ISwapVM.Order memory o = ship(stock, abi.encodePacked(ext(mode), xyc()), mode);
        uint256 snapshot = vm.snapshotState();
        single = fill(stock, o, 3 * R);
        vm.revertToState(snapshot);
        split = fill(stock, o, R) + fill(stock, o, 2 * R);
        emit log_named_uint("single output", single);
        emit log_named_uint("split output", split);
    }
    function testProportionalSplitAdvantageCounterexample() public {
        (uint256 single, uint256 split) = splitComparison(0);
        assertEq(single, 2982107355864811133);
        assertEq(split, 2986059753003952253);
        assertGt(split, single, "Mode A must NOT be advertised as subadditive");
    }
    function testAsymmetricSplitIsNoBetterThanSingle() public {
        (uint256 single, uint256 split) = splitComparison(1);
        assertLe(split, single);
    }
    function testFuzz_AsymmetricSplitNoBetter(uint256 amountA,uint256 amountB,uint256 wallet) public {
        amountA=bound(amountA,1e12,100*R); amountB=bound(amountB,1e12,100*R); wallet=bound(wallet,100*R,900*R);
        deal(address(output),MAKER,wallet);
        ISwapVM.Order memory o=ship(stock,abi.encodePacked(ext(1),xyc()),0);
        uint256 snapshot=vm.snapshotState(); uint256 single=fill(stock,o,amountA+amountB);
        vm.revertToState(snapshot);
        uint256 split=fill(stock,o,amountA)+fill(stock,o,amountB);
        assertLe(split,single);
    }
    function testHealthyProgramOutputBytesAreIdenticalBothModes() public {
        for (uint8 mode; mode < 2; mode++) {
            ISwapVM.Order memory a = ship(stock, xyc(), 10 + mode);
            ISwapVM.Order memory b = ship(stock, abi.encodePacked(ext(mode), xyc()), 20 + mode);
            for (uint8 direction; direction < 2; direction++) {
                (uint256 ai, uint256 ao,) = stock.asView().quote(a, address(input), address(output), R, data(direction == 0));
                (uint256 bi, uint256 bo,) = stock.asView().quote(b, address(input), address(output), R, data(direction == 0));
                assertEq(abi.encode(ai, ao), abi.encode(bi, bo));
            }
        }
    }
    function testTakerThresholdStillRejectsReducedOutput() public {
        deal(address(output), MAKER, 400 * R);
        ISwapVM.Order memory o = ship(stock, abi.encodePacked(ext(1), xyc()), 0);
        // All ten slice offsets are 32: threshold only; exact-in + Aqua push flags.
        bytes memory d = abi.encodePacked(hex"00200020002000200020002000200020002000200041", uint256(600 * R));
        vm.expectRevert(); stock.swap(o, address(input), address(output), 1500 * R, d);
        assertEq(output.balanceOf(MAKER), 400 * R);
    }
    function testAquaCannotReshipButPushCanTopUp() public {
        ISwapVM.Order memory o = ship(stock, xyc(), 0);
        address[] memory tokens = new address[](2); tokens[0] = address(input); tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2); amounts[0] = R; amounts[1] = R;
        vm.prank(MAKER); vm.expectRevert(); aqua.ship(address(stock), abi.encode(o), tokens, amounts);
        bytes32 hash = stock.hash(o);
        output.mint(address(this), R); output.approve(address(aqua), R);
        aqua.push(MAKER, address(stock), hash, address(output), R);
        (uint256 allocated,) = aqua.rawBalances(MAKER, address(stock), hash, address(output));
        assertEq(allocated, 1001 * R); assertEq(output.balanceOf(MAKER), 1001 * R);
    }
    function testApprovalRevocationCanonicalQuoteRejectsZero() public {
        ISwapVM.Order memory o = ship(stock, abi.encodePacked(ext(0), xyc()), 0);
        vm.prank(MAKER); output.approve(address(aqua), 0);
        ISwapVM viewRouter = stock.asView();
        vm.expectRevert(abi.encodeWithSelector(XYCSwap.XYCSwapRequiresBothBalancesNonZero.selector, 0, 0));
        viewRouter.quote(o, address(input), address(output), R, data(true));
    }
    function testOrderingAfterSwapDoesNotChangeAmount() public {
        deal(address(output), MAKER, 500 * R);
        ISwapVM.Order memory before = ship(stock, abi.encodePacked(ext(0), xyc()), 0);
        ISwapVM.Order memory afterSwap = ship(stock, abi.encodePacked(xyc(), ext(0)), 1);
        ISwapVM.Order memory baseline = ship(stock, xyc(), 2);
        assertEq(quote(stock, afterSwap, 100 * R), quote(stock, baseline, 100 * R));
        assertLt(quote(stock, before, 100 * R), quote(stock, baseline, 100 * R));
    }
}
