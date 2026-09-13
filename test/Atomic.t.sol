// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Token, LinearPricing} from "./Studio.t.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";
import {AtomicExecutor} from "../contracts/AtomicExecutor.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

// Unit fixture only. The end-to-end demo uses the real ENSv2 resolver.
contract ReleaseFixture {
    bytes public value;

    function set(bytes calldata v) external {
        value = v;
    }

    function data(bytes32, string calldata) external view returns (bytes memory) {
        return value;
    }
}

contract AtomicTest is Test {
    using StateLibrary for IPoolManager;
    AtomicExecutor e;
    Aqua aqua;
    IPoolManager manager;
    Token input;
    Token output;
    ReleaseFixture resolver;
    PoolKey pool;
    address trader;
    address maker = address(0x1234);
    address author = address(0x5678);
    uint256 key = 123;
    StudioExecutor.Authorization a;
    AtomicExecutor.Hedge h;

    function setUp() public {
        setupDirection(false);
    }

    function setupDirection(bool reverse) internal {
        trader = vm.addr(key);
        aqua = new Aqua();
        manager = IPoolManager(
            deployCode("node_modules/@uniswap/v4-core/out/PoolManager.sol/PoolManager.json", abi.encode(address(this)))
        );
        e = new AtomicExecutor(address(aqua), address(0xdead), address(this), manager);
        Token first = new Token();
        Token second = new Token();
        bool firstIsInput = (address(first) < address(second)) != reverse;
        input = firstIsInput ? first : second;
        output = firstIsInput ? second : first;
        e.setSupportedToken(address(input), true);
        e.setSupportedToken(address(output), true);
        resolver = new ReleaseFixture();
        e.setReleaseResolver(address(resolver), bytes32(uint256(1)));
        input.mint(trader, 100000e18);
        output.mint(maker, 100000e18);
        vm.prank(trader);
        input.approve(address(e), type(uint256).max);
        vm.prank(maker);
        output.approve(address(aqua), type(uint256).max);
        pool = PoolKey(
            Currency.wrap(address(input) < address(output) ? address(input) : address(output)),
            Currency.wrap(address(input) < address(output) ? address(output) : address(input)),
            3000,
            60,
            IHooks(address(0))
        );
        manager.initialize(pool, uint160(1 << 96));
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        input.mint(address(this), 1e27);
        output.mint(address(this), 1e27);
        input.approve(address(lp), type(uint256).max);
        output.approve(address(lp), type(uint256).max);
        lp.modifyLiquidity(pool, ModifyLiquidityParams(-887220, 887220, 1e24, bytes32(0)), "");
        a = StudioExecutor.Authorization(
            trader,
            maker,
            address(input),
            address(output),
            author,
            keccak256(type(LinearPricing).creationCode),
            keccak256(type(LinearPricing).runtimeCode),
            keccak256(""),
            bytes32(0),
            100e18,
            true,
            101e18,
            99e18,
            100,
            1e18,
            0,
            block.timestamp + 100
        );
        h = AtomicExecutor.Hedge(3000, 60, 98e18, address(resolver), bytes32(uint256(1)), keccak256("report"));
        e.approveEnsRelease(a.initCodeHash, a.runtimeCodeHash, author, 100, h.reportDigest);
        resolver.set(abi.encode(e.releaseKey(a.initCodeHash, a.runtimeCodeHash, author, 100), h.reportDigest));
        address[] memory tokens = new address[](2);
        tokens[0] = address(input);
        tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100000e18;
        amounts[1] = 100000e18;
        bytes memory strategy = abi.encode(e.order(a, ""));
        address router = address(e.router());
        vm.prank(maker);
        aqua.ship(router, strategy, tokens, amounts);
    }

    function sig() internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, e.hedgedDigest(a, h));
        return abi.encodePacked(r, s, v);
    }

    function run() internal returns (uint256 result) {
        return e.executeHedged(a, h, type(LinearPricing).creationCode, "", sig());
    }

    function testTwoVenuesOneExecutionAndReplay() public {
        input.mint(address(e), 7);
        output.mint(address(e), 11);
        uint256 returned = run();
        assertGe(returned, 98e18);
        assertLt(returned, 99e18);
        assertEq(input.balanceOf(trader), 100000e18 - 100e18 + returned);
        assertEq(output.balanceOf(trader), 0);
        assertEq(output.balanceOf(author), 1e18);
        assertEq(input.balanceOf(address(e)), 7);
        assertEq(output.balanceOf(address(e)), 11);
        assertGt(e.predict(a).code.length, 0);
        assertTrue(e.usedNonces(trader, 0));
        bytes memory signature = sig();
        vm.expectRevert(bytes("signature or nonce"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
    }

    function testLateFailureRollsBackBothVenuesAndDeployment() public {
        (uint160 priceBefore,,,) = manager.getSlot0(pool.toId());
        uint256 poolIn = input.balanceOf(address(manager));
        uint256 poolOut = output.balanceOf(address(manager));
        h.minReturn = 100e18;
        bytes memory signature = sig();
        vm.expectCall(address(output), abi.encodeWithSignature("transfer(address,uint256)", author, 1e18));
        vm.expectRevert(bytes("minimum return"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
        (uint160 priceAfter,,,) = manager.getSlot0(pool.toId());
        assertEq(priceBefore, priceAfter);
        assertEq(input.balanceOf(address(manager)), poolIn);
        assertEq(output.balanceOf(address(manager)), poolOut);
        assertEq(input.balanceOf(trader), 100000e18);
        assertEq(output.balanceOf(maker), 100000e18);
        assertEq(input.balanceOf(maker), 0);
        assertEq(output.balanceOf(author), 0);
        assertEq(e.predict(a).code.length, 0);
        assertFalse(e.usedNonces(trader, 0));
        h.minReturn = 98e18; // Same order and nonce remain usable: Aqua accounting rolled back too.
        run();
    }

    function testCannotStripHedgeFromSignature() public {
        bytes memory signature = sig();
        vm.expectRevert(bytes("signature or nonce"));
        e.execute(a, type(LinearPricing).creationCode, "", signature);
    }

    function testPoolAndReturnAreSigned() public {
        bytes memory signature = sig();
        h.poolFee = 500;
        vm.expectRevert(bytes("signature or nonce"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
        h.poolFee = 3000;
        h.minReturn--;
        vm.expectRevert(bytes("signature or nonce"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
    }

    function testENSRevocationBeforeFill() public {
        resolver.set("");
        bytes memory signature = sig();
        vm.expectRevert(bytes("ENS release mismatch"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
        assertEq(e.predict(a).code.length, 0);
        assertFalse(e.usedNonces(trader, 0));
    }

    function testENSConfigurationCannotBeSubstituted() public {
        e.setReleaseResolver(address(0), bytes32(0));
        bytes memory signature = sig();
        vm.expectRevert(bytes("ENS binding"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
    }

    function testOppositeCurrencyOrder() public {
        setupDirection(true);
        assertGe(run(), 98e18);
    }

    function testEmptyPoolCannotPartiallyHedge() public {
        pool.fee = 500;
        manager.initialize(pool, uint160(1 << 96));
        h.poolFee = 500;
        bytes memory signature = sig();
        vm.expectRevert(bytes("partial hedge"));
        e.executeHedged(a, h, type(LinearPricing).creationCode, "", signature);
        assertEq(e.predict(a).code.length, 0);
        assertFalse(e.usedNonces(trader, 0));
    }

    function testUnsolicitedCallback() public {
        vm.expectRevert(bytes("unauthorized callback"));
        e.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(bytes("unauthorized callback"));
        e.unlockCallback("");
    }
}
