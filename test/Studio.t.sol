// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {Candidate} from "../app/fixtures/Candidate.good.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";

contract Token is ERC20 {
    constructor() ERC20("Token", "T") {}

    function mint(address to, uint256 n) external {
        _mint(to, n);
    }
}

contract LinearPricing {
    function quote(uint256 a, bool, uint256, uint256, bytes calldata) external pure returns (uint256, uint256) {
        return (a, a);
    }
}

contract WritingPricing {
    uint256 public writes;

    function quote(uint256 a, bool, uint256, uint256, bytes calldata) external returns (uint256, uint256) {
        writes++;
        return (a, a);
    }
}

contract LyingPricing {
    function quote(uint256 a, bool, uint256, uint256, bytes calldata) external pure returns (uint256, uint256) {
        return (a + 1, a + 1);
    }
}

contract StudioTest is Test {
    StudioExecutor e;
    Aqua aqua;
    Token input;
    Token output;
    address trader;
    address maker = address(0x1234);
    address author = address(0x5678);
    uint256 key = 123;

    function setUp() public {
        trader = vm.addr(key);
        aqua = new Aqua();
        e = new StudioExecutor(address(aqua), address(0xdead), address(this));
        input = new Token();
        output = new Token();
        e.setSupportedToken(address(input), true);
        e.setSupportedToken(address(output), true);
        input.mint(trader, 100000);
        output.mint(maker, 100000);
        vm.prank(trader);
        input.approve(address(e), type(uint256).max);
        vm.prank(maker);
        output.approve(address(aqua), type(uint256).max);
    }

    function prepare(bytes memory init, bytes32 runtime) internal returns (StudioExecutor.Authorization memory a) {
        a.signer = trader;
        a.maker = maker;
        a.tokenIn = address(input);
        a.tokenOut = address(output);
        a.author = author;
        a.initCodeHash = keccak256(init);
        a.runtimeCodeHash = runtime;
        a.paramsHash = keccak256("");
        a.amount = 1000;
        a.exactIn = true;
        a.maxInput = 1000;
        a.minOutput = 990;
        a.feeBps = 100;
        a.feeCap = 10;
        a.deadline = block.timestamp + 100;
        e.approveRelease(a.initCodeHash, runtime, author, 100);
        address[] memory tokens = new address[](2);
        tokens[0] = address(input);
        tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100000;
        amounts[1] = 100000;
        address router = address(e.router());
        bytes memory strategy = abi.encode(e.order(a, ""));
        vm.prank(maker);
        aqua.ship(router, strategy, tokens, amounts);
    }

    function signature(StudioExecutor.Authorization memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, e.digest(a));
        return abi.encodePacked(r, s, v);
    }

    function testAtomicExactInAndReplay() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        bytes memory sig = signature(a);
        (uint256 i, uint256 o, uint256 f) = e.execute(a, init, "", sig);
        assertEq(i, 1000);
        assertEq(o, 990);
        assertEq(f, 10);
        assertEq(input.balanceOf(trader), 99000);
        assertEq(input.balanceOf(maker), 1000);
        assertEq(output.balanceOf(trader), 990);
        assertEq(output.balanceOf(author), 10);
        assertEq(output.balanceOf(maker), 99000);
        assertTrue(e.usedNonces(trader, 0));
        vm.expectRevert();
        e.execute(a, init, "", sig);
    }

    function testExactOut() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        a.exactIn = false;
        a.amount = 990;
        (uint256 i, uint256 o, uint256 f) = e.execute(a, init, "", signature(a));
        assertEq(i, 1000);
        assertEq(o, 990);
        assertEq(f, 10);
        (i, o, f) = e.quote(a, "");
        assertEq(i, 1000);
        assertEq(o, 990);
        assertEq(f, 10);
    }

    function testStateWriterRollsBack() public {
        bytes memory init = type(WritingPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(WritingPricing).runtimeCode));
        rollback(a, init, "pricing failed");
    }

    function testAmountLieRollsBack() public {
        bytes memory init = type(LyingPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LyingPricing).runtimeCode));
        rollback(a, init, "amount lie");
    }

    function testLimitBreachRollsBack() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        a.minOutput = 991;
        rollback(a, init, "limits");
    }

    function testFeeCapRollsBack() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        a.feeCap = 9;
        rollback(a, init, "limits");
    }

    function testRuntimeCommitmentRollsBack() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, bytes32(uint256(1)));
        rollback(a, init, "runtime hash");
    }

    function testSignatureBindsLimits() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        bytes memory sig = signature(a);
        a.maxInput++;
        vm.expectRevert();
        e.execute(a, init, "", sig);
    }

    function testFuzz_RealCandidateQuoteSettlement(uint16 raw, bool exactIn) public {
        bytes memory init = type(Candidate).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(Candidate).runtimeCode));
        a.minOutput = 0;
        a.feeCap = 10000;
        e.execute(a, init, "", signature(a));
        a.nonce = 1;
        a.amount = bound(raw, 100, 10000);
        a.exactIn = exactIn;
        a.maxInput = 20000;
        (uint256 qi, uint256 qo, uint256 qf) = e.quote(a, "");
        uint256 beforeOut = output.balanceOf(trader);
        uint256 beforeFee = output.balanceOf(author);
        (uint256 i, uint256 o, uint256 f) = e.execute(a, init, "", signature(a));
        assertEq(i, qi);
        assertEq(o, qo);
        assertEq(f, qf);
        assertEq(output.balanceOf(trader) - beforeOut, qo);
        assertEq(output.balanceOf(author) - beforeFee, qf);
    }

    function testExpiredAuthorization() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        a.deadline = block.timestamp - 1;
        rollback(a, init, "expired or zero");
    }

    function testInsufficientMakerActualBalanceRollsBack() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        vm.prank(maker);
        output.transfer(address(999), 100000);
        bytes memory sig = signature(a);
        vm.expectRevert();
        e.execute(a, init, "", sig);
        assertEq(e.predict(a).code.length, 0);
        assertEq(input.balanceOf(trader), 100000);
        assertFalse(e.usedNonces(trader, 0));
    }

    function testChainReplayRejected() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        bytes memory sig = signature(a);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(bytes("signature or nonce"));
        e.execute(a, init, "", sig);
        assertEq(e.predict(a).code.length, 0);
        assertFalse(e.usedNonces(trader, 0));
    }

    function testReleaseRevocationRejected() public {
        bytes memory init = type(LinearPricing).creationCode;
        StudioExecutor.Authorization memory a = prepare(init, keccak256(type(LinearPricing).runtimeCode));
        e.revokeRelease(e.releaseKey(a.initCodeHash, a.runtimeCodeHash, a.author, a.feeBps));
        rollback(a, init, "unapproved release");
    }

    function rollback(StudioExecutor.Authorization memory a, bytes memory init, string memory reason) internal {
        bytes memory sig = signature(a);
        address predicted = e.predict(a);
        vm.expectRevert(bytes(reason));
        e.execute(a, init, "", sig);
        assertEq(predicted.code.length, 0);
        assertFalse(e.usedNonces(trader, 0));
        assertEq(input.balanceOf(trader), 100000);
        assertEq(output.balanceOf(maker), 100000);
        assertEq(output.balanceOf(author), 0);
    }
}
