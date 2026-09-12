// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {CoreInvariants} from "swap-vm/test/invariants/CoreInvariants.t.sol";
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraits, TakerTraitsLib} from "swap-vm/src/libs/TakerTraits.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";
import {Candidate} from "../app/fixtures/Candidate.good.sol";
import {Token} from "./Studio.t.sol";

/// @notice Runs the unmodified upstream assertion implementation against Studio settlement.
contract UpstreamTest is CoreInvariants {
    StudioExecutor executor;
    Aqua aqua;
    Token input;
    Token output;
    StudioExecutor.Authorization authorization;
    uint256 constant KEY = 321;
    uint256 constant RESERVE = 1e24;

    function setUp() public {
        aqua = new Aqua();
        executor = new StudioExecutor(address(aqua), address(0xdead), address(this));
        input = new Token();
        output = new Token();
        executor.setSupportedToken(address(input), true);
        executor.setSupportedToken(address(output), true);
        authorization.signer = vm.addr(KEY);
        authorization.maker = address(0x1234);
        authorization.author = address(0x5678);
        authorization.tokenIn = address(input);
        authorization.tokenOut = address(output);
        authorization.initCodeHash = keccak256(type(Candidate).creationCode);
        authorization.runtimeCodeHash = keccak256(type(Candidate).runtimeCode);
        authorization.paramsHash = keccak256("");
        authorization.maxInput = RESERVE;
        authorization.deadline = block.timestamp + 1 days;
        executor.approveRelease(authorization.initCodeHash, authorization.runtimeCodeHash, authorization.author, 0);
        input.mint(authorization.signer, 10 * RESERVE);
        output.mint(authorization.maker, 10 * RESERVE);
        vm.prank(authorization.signer);
        input.approve(address(executor), type(uint256).max);
        vm.prank(authorization.maker);
        output.approve(address(aqua), type(uint256).max);

        // Deploy through a genuine signed execution. Separate bootstrap parameters
        // leave the campaign's canonical order at exactly RESERVE on both sides.
        StudioExecutor.Authorization memory bootstrap = authorization;
        bootstrap.paramsHash = keccak256(hex"01");
        bootstrap.amount = 1e18;
        bootstrap.exactIn = true;
        _ship(executor.order(bootstrap, hex"01"));
        executor.execute(bootstrap, type(Candidate).creationCode, hex"01", _signature(bootstrap));
        authorization.nonce = 1;
        _ship(executor.order(authorization, ""));
    }

    function _ship(ISwapVM.Order memory order) private {
        address[] memory tokens = new address[](2);
        tokens[0] = address(input);
        tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = RESERVE;
        amounts[1] = RESERVE;
        address router = address(executor.router());
        vm.prank(authorization.maker);
        aqua.ship(router, abi.encode(order), tokens, amounts);
    }

    function _signature(StudioExecutor.Authorization memory a) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, executor.digest(a));
        return abi.encodePacked(r, s, v);
    }

    function _traits(bool exactIn) private pure returns (bytes memory) {
        TakerTraitsLib.Args memory args;
        args.isExactIn = exactIn;
        args.useTransferFromAndAquaPush = true;
        args.isFirstTransferFromTaker = true;
        return TakerTraitsLib.build(args);
    }

    function _executeSwap(
        SwapVM router,
        ISwapVM.Order memory order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bytes memory takerData
    ) internal override returns (uint256 amountIn, uint256 amountOut) {
        vm.stopPrank();
        assertEq(address(router), address(executor.router()));
        assertEq(keccak256(abi.encode(order)), keccak256(abi.encode(executor.order(authorization, ""))));
        assertEq(tokenIn, address(input));
        assertEq(tokenOut, address(output));
        StudioExecutor.Authorization memory a = authorization;
        a.amount = amount;
        a.exactIn = TakerTraitsLib.isExactIn(TakerTraits.wrap(uint176(bytes22(takerData))));
        authorization.nonce++;
        uint256 fee;
        (amountIn, amountOut, fee) = executor.execute(a, type(Candidate).creationCode, "", _signature(a));
        assertEq(fee, 0);
        vm.startPrank(address(executor));
    }

    function testUpstreamCoreInvariants() public {
        _run(_getDefaultConfig());
    }

    function testFuzz_UpstreamCoreInvariants(uint256 raw) public {
        InvariantConfig memory config = _getDefaultConfig();
        uint256 amount = bound(raw, 1e12, 1e20);
        config.testAmounts[0] = amount;
        config.testAmounts[1] = amount * 2;
        config.testAmounts[2] = amount * 4;
        _run(config);
    }

    function _run(InvariantConfig memory config) private {
        config.exactInTakerData = _traits(true);
        config.exactOutTakerData = _traits(false);
        ISwapVM.Order memory order = executor.order(authorization, "");
        vm.startPrank(address(executor));
        assertAllInvariantsWithConfig(executor.router(), order, address(input), address(output), config);
        vm.stopPrank();
    }
}
