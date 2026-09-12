// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Uses SwapVM release/1.1, © 2025 Degensoft Ltd; see vendor/swap-vm/LICENSES/SwapVM-1.1.txt.
pragma solidity 0.8.30;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "swap-vm/src/libs/TakerTraits.sol";
import {StudioRouter} from "./StudioRouter.sol";

interface IENSDataResolver {
    function data(bytes32 node, string calldata key) external view returns (bytes memory);
}

/// @notice Only reviewed release commitments and explicitly supported standard ERC20s execute.
contract StudioExecutor is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Authorization {
        address signer;
        address maker;
        address tokenIn;
        address tokenOut;
        address author;
        bytes32 initCodeHash;
        bytes32 runtimeCodeHash;
        bytes32 paramsHash;
        bytes32 salt;
        uint256 amount;
        bool exactIn;
        uint256 maxInput;
        uint256 minOutput;
        uint256 feeBps;
        uint256 feeCap;
        uint256 nonce;
        uint256 deadline;
    }
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "Authorization(address signer,address maker,address tokenIn,address tokenOut,address author,bytes32 initCodeHash,bytes32 runtimeCodeHash,bytes32 paramsHash,bytes32 salt,uint256 amount,bool exactIn,uint256 maxInput,uint256 minOutput,uint256 feeBps,uint256 feeCap,uint256 nonce,uint256 deadline)"
    );
    StudioRouter public immutable router;
    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => bool) public releases;
    mapping(bytes32 => bytes32) public releaseReportDigests;
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    address public releaseResolver;
    bytes32 public releaseNode;
    string public constant ENS_RELEASE_KEY = "swapvm.release";
    event ReleaseApproved(
        bytes32 indexed release, bytes32 initCodeHash, bytes32 runtimeCodeHash, address indexed author, uint256 feeBps
    );
    event AuthorPaid(
        address indexed module, address indexed author, address indexed token, uint256 amount, bytes32 authorization
    );
    event ReleaseResolverSet(address indexed resolver, bytes32 indexed node);

    constructor(address aqua, address weth, address owner) Ownable(owner) EIP712("SwapVM Studio", "1") {
        router = new StudioRouter(aqua, weth, owner);
    }

    function setSupportedToken(address token, bool allowed) external onlyOwner {
        require(token.code.length > 0, "not token");
        supportedTokens[token] = allowed;
    }

    function releaseKey(bytes32 initHash, bytes32 runtime, address author, uint256 feeBps)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(initHash, runtime, author, feeBps));
    }

    function approveRelease(bytes32 initHash, bytes32 runtime, address author, uint256 feeBps) external onlyOwner {
        require(author != address(0) && feeBps <= 1000, "invalid release");
        bytes32 key = releaseKey(initHash, runtime, author, feeBps);
        releases[key] = true;
        emit ReleaseApproved(key, initHash, runtime, author, feeBps);
    }

    function approveEnsRelease(bytes32 initHash, bytes32 runtime, address author, uint256 feeBps, bytes32 reportDigest)
        external
        onlyOwner
    {
        require(author != address(0) && feeBps <= 1000 && reportDigest != bytes32(0), "invalid release");
        bytes32 key = releaseKey(initHash, runtime, author, feeBps);
        releases[key] = true;
        releaseReportDigests[key] = reportDigest;
        emit ReleaseApproved(key, initHash, runtime, author, feeBps);
    }

    function setReleaseResolver(address resolver, bytes32 node) external onlyOwner {
        require((resolver == address(0)) == (node == bytes32(0)), "invalid ENS config");
        require(resolver == address(0) || resolver.code.length > 0, "invalid ENS resolver");
        releaseResolver = resolver;
        releaseNode = node;
        emit ReleaseResolverSet(resolver, node);
    }

    function revokeRelease(bytes32 key) external onlyOwner {
        releases[key] = false;
        releaseReportDigests[key] = bytes32(0);
    }

    function digest(Authorization calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, a)));
    }

    function predict(Authorization calldata a) public view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), keccak256(abi.encode(a.signer, a.salt)), a.initCodeHash
                        )
                    )
                )
            )
        );
    }

    function order(Authorization calldata a, bytes calldata params) public view returns (ISwapVM.Order memory) {
        return router.makeOrder(a.maker, predict(a), params);
    }

    function _validate(Authorization calldata a, bytes calldata params) private view {
        require(block.timestamp <= a.deadline && a.amount > 0, "expired or zero");
        require(a.paramsHash == keccak256(params), "params hash");
        require(
            supportedTokens[a.tokenIn] && supportedTokens[a.tokenOut] && a.tokenIn != a.tokenOut, "unsupported pair"
        );
        require(
            a.signer != a.maker && a.author != a.signer && a.author != a.maker && a.author != address(this),
            "overlapping accounts"
        );
        bytes32 key = releaseKey(a.initCodeHash, a.runtimeCodeHash, a.author, a.feeBps);
        require(releases[key], "unapproved release");
        if (releaseResolver != address(0)) {
            bytes32 reportDigest = releaseReportDigests[key];
            require(reportDigest != bytes32(0), "ENS report missing");
            bytes memory value;
            try IENSDataResolver(releaseResolver).data(releaseNode, ENS_RELEASE_KEY) returns (bytes memory data_) {
                value = data_;
            } catch {
                revert("ENS unavailable");
            }
            require(value.length == 64 && keccak256(value) == keccak256(abi.encode(key, reportDigest)), "ENS release mismatch");
        }
    }

    function _traits(bool exactIn) private pure returns (bytes memory) {
        TakerTraitsLib.Args memory t;
        t.isExactIn = exactIn;
        t.useTransferFromAndAquaPush = true;
        t.isFirstTransferFromTaker = true;
        return TakerTraitsLib.build(t);
    }

    function _amount(Authorization calldata a) private pure returns (uint256) {
        return a.exactIn ? a.amount : Math.mulDiv(a.amount, 10000, 10000 - a.feeBps, Math.Rounding.Ceil);
    }

    function _net(Authorization calldata a, uint256 gross) private pure returns (uint256 net, uint256 fee) {
        fee = Math.mulDiv(gross, a.feeBps, 10000, Math.Rounding.Ceil);
        net = gross - fee;
    }

    function quote(Authorization calldata a, bytes calldata params)
        external
        view
        returns (uint256 amountIn, uint256 amountOut, uint256 fee)
    {
        _validate(a, params);
        require(predict(a).codehash == a.runtimeCodeHash, "runtime hash");
        uint256 gross;
        (amountIn, gross,) =
            ISwapVM(address(router)).quote(order(a, params), a.tokenIn, a.tokenOut, _amount(a), _traits(a.exactIn));
        (amountOut, fee) = _net(a, gross);
    }

    function execute(Authorization calldata a, bytes calldata initCode, bytes calldata params, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 amountIn, uint256 amountOut, uint256 fee)
    {
        _validate(a, params);
        bytes32 authorization = digest(a);
        require(
            !usedNonces[a.signer][a.nonce] && ECDSA.recover(authorization, signature) == a.signer, "signature or nonce"
        );
        require(keccak256(initCode) == a.initCodeHash && initCode.length <= 24576, "init hash or size");
        usedNonces[a.signer][a.nonce] = true;
        address module = predict(a);
        if (module.code.length == 0) {
            bytes memory code = initCode;
            bytes32 salt = keccak256(abi.encode(a.signer, a.salt));
            address deployed;
            assembly ("memory-safe") { deployed := create2(0, add(code, 32), mload(code), salt) }
            require(deployed == module, "deployment failed");
        }
        require(module.code.length > 0 && module.codehash == a.runtimeCodeHash, "runtime hash");
        IERC20 input = IERC20(a.tokenIn);
        IERC20 output = IERC20(a.tokenOut);
        uint256 userIn = input.balanceOf(a.signer);
        uint256 userOut = output.balanceOf(a.signer);
        uint256 authorOut = output.balanceOf(a.author);
        uint256 makerIn = input.balanceOf(a.maker);
        uint256 makerOut = output.balanceOf(a.maker);
        uint256 heldIn = input.balanceOf(address(this));
        uint256 heldOut = output.balanceOf(address(this));
        input.safeTransferFrom(a.signer, address(this), a.maxInput);
        require(input.balanceOf(address(this)) == heldIn + a.maxInput, "input transfer mismatch");
        input.forceApprove(address(router), a.maxInput);
        uint256 gross;
        (amountIn, gross,) = router.swap(order(a, params), a.tokenIn, a.tokenOut, _amount(a), _traits(a.exactIn));
        (amountOut, fee) = _net(a, gross);
        require(amountIn <= a.maxInput && amountOut >= a.minOutput && fee <= a.feeCap, "limits");
        require(a.exactIn ? amountIn == a.amount : amountOut == a.amount, "exact amount");
        require(output.balanceOf(address(this)) == heldOut + gross, "output transfer mismatch");
        input.forceApprove(address(router), 0);
        input.safeTransfer(a.signer, a.maxInput - amountIn);
        output.safeTransfer(a.signer, amountOut);
        output.safeTransfer(a.author, fee);
        require(
            input.balanceOf(a.signer) == userIn - amountIn && output.balanceOf(a.signer) == userOut + amountOut
                && output.balanceOf(a.author) == authorOut + fee,
            "recipient balances"
        );
        require(
            input.balanceOf(a.maker) == makerIn + amountIn && output.balanceOf(a.maker) == makerOut - gross,
            "maker balances"
        );
        require(
            input.balanceOf(address(this)) == heldIn && output.balanceOf(address(this)) == heldOut, "executor balances"
        );
        emit AuthorPaid(module, a.author, a.tokenOut, fee, authorization);
    }
}
