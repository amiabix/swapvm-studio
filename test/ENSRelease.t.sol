// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";

contract ENSReleaseToken is ERC20 {
    constructor() ERC20("Token", "T") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract ENSReleasePricing {
    function quote(uint256 amount, bool, uint256, uint256, bytes calldata) external pure returns (uint256, uint256) {
        return (amount, amount);
    }
}

contract PermissionedResolverDouble {
    address immutable owner;
    mapping(bytes32 => mapping(string => bytes)) private records;

    constructor() { owner = msg.sender; }

    function setData(bytes32 node, string calldata key, bytes calldata value) external {
        require(msg.sender == owner, "unauthorized resolver write");
        records[node][key] = value;
    }

    function data(bytes32 node, string calldata key) external view returns (bytes memory) {
        return records[node][key];
    }
}

contract ENSReleaseTest is Test {
    StudioExecutor executor;
    PermissionedResolverDouble resolver;
    Aqua aqua;
    ENSReleaseToken input;
    ENSReleaseToken output;
    address trader;
    address maker = address(0x1234);
    address author = address(0x5678);
    uint256 signerKey = 123;
    bytes32 node = keccak256("release.swapvm.eth");
    bytes32 reportDigest = keccak256("signed verifier report");

    function setUp() public {
        trader = vm.addr(signerKey);
        aqua = new Aqua();
        executor = new StudioExecutor(address(aqua), address(0xdead), address(this));
        resolver = new PermissionedResolverDouble();
        input = new ENSReleaseToken();
        output = new ENSReleaseToken();
        executor.setSupportedToken(address(input), true);
        executor.setSupportedToken(address(output), true);
        input.mint(trader, 100000);
        output.mint(maker, 100000);
        vm.prank(trader); input.approve(address(executor), type(uint256).max);
        vm.prank(maker); output.approve(address(aqua), type(uint256).max);
    }

    function testUnconfiguredEnsLeavesLocalReleaseUsable() public {
        StudioExecutor.Authorization memory a = prepare();
        executor.execute(a, type(ENSReleasePricing).creationCode, "", signature(a));
        a.nonce = 1;
        executor.quote(a, "");
    }

    function testConfiguredEnsRequiresCurrentManifestAndResolverRejectsUnauthorizedWrite() public {
        StudioExecutor.Authorization memory a = prepare();
        executor.execute(a, type(ENSReleasePricing).creationCode, "", signature(a));
        a.nonce = 1;
        bytes32 key = executor.releaseKey(a.initCodeHash, a.runtimeCodeHash, a.author, a.feeBps);
        resolver.setData(node, "swapvm.release", abi.encode(key, reportDigest));
        executor.approveEnsRelease(a.initCodeHash, a.runtimeCodeHash, a.author, a.feeBps, reportDigest);
        executor.setReleaseResolver(address(resolver), node);
        executor.quote(a, "");

        vm.prank(address(0xbeef));
        vm.expectRevert(bytes("unauthorized resolver write"));
        resolver.setData(node, "swapvm.release", abi.encode(key, keccak256("attacker report")));

        resolver.setData(node, "swapvm.release", abi.encode(key, keccak256("changed report")));
        vm.expectRevert(bytes("ENS release mismatch"));
        executor.quote(a, "");
        resolver.setData(node, "swapvm.release", "");
        vm.expectRevert(bytes("ENS release mismatch"));
        executor.quote(a, "");
    }

    function prepare() internal returns (StudioExecutor.Authorization memory a) {
        bytes memory init = type(ENSReleasePricing).creationCode;
        a = StudioExecutor.Authorization({
            signer: trader, maker: maker, tokenIn: address(input), tokenOut: address(output), author: author,
            initCodeHash: keccak256(init), runtimeCodeHash: keccak256(type(ENSReleasePricing).runtimeCode),
            paramsHash: keccak256(""), salt: bytes32(0), amount: 1000, exactIn: true, maxInput: 1000,
            minOutput: 990, feeBps: 100, feeCap: 10, nonce: 0, deadline: block.timestamp + 100
        });
        executor.approveRelease(a.initCodeHash, a.runtimeCodeHash, author, 100);
        address[] memory tokens = new address[](2);
        tokens[0] = address(input); tokens[1] = address(output);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100000; amounts[1] = 100000;
        address router = address(executor.router());
        bytes memory strategy = abi.encode(executor.order(a, ""));
        vm.prank(maker);
        aqua.ship(router, strategy, tokens, amounts);
    }

    function signature(StudioExecutor.Authorization memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, executor.digest(a));
        return abi.encodePacked(r, s, v);
    }
}
