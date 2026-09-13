// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {StudioExecutor} from "./StudioExecutor.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice ENS-authorized deployment, Aqua fill and v4 hedge in one EVM transaction.
/// @dev Exact-input, standard ERC20s and hookless pools only. Setup is separate.
contract AtomicExecutor is StudioExecutor, IUnlockCallback {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;

    struct Hedge {
        uint24 poolFee;
        int24 tickSpacing;
        uint256 minReturn;
        address ensResolver;
        bytes32 ensNode;
        bytes32 reportDigest;
    }
    bytes32 public constant HEDGE_TYPEHASH = keccak256(
        "HedgedAuthorization(bytes32 tradeHash,uint24 poolFee,int24 tickSpacing,uint256 minReturn,address ensResolver,bytes32 ensNode,bytes32 reportDigest)"
    );
    IPoolManager public immutable poolManager;
    bytes32 private callbackHash;
    event ENSChecked(bytes32 indexed node, bytes32 indexed reportDigest);
    event ProgramReady(address indexed module, bool deployed);
    event AquaFilled(uint256 amountIn, uint256 grossOutput);
    event UniswapFilled(uint256 amountIn, uint256 amountOut);
    event AtomicExecuted(
        bytes32 indexed authorization, address indexed signer, uint256 spent, uint256 returned, uint256 authorFee
    );

    constructor(address aqua, address weth, address owner, IPoolManager manager) StudioExecutor(aqua, weth, owner) {
        require(address(manager).code.length > 0, "invalid manager");
        poolManager = manager;
    }

    function hedgedDigest(Authorization calldata a, Hedge calldata h) public view returns (bytes32) {
        return
            _hashTypedDataV4(keccak256(abi.encode(HEDGE_TYPEHASH, keccak256(abi.encode(AUTHORIZATION_TYPEHASH, a)), h)));
    }

    function executeHedged(
        Authorization calldata a,
        Hedge calldata h,
        bytes calldata initCode,
        bytes calldata params,
        bytes calldata signature
    ) external nonReentrant returns (uint256 returned) {
        require(a.exactIn, "exact input only");
        require(
            h.ensResolver != address(0) && h.ensResolver == releaseResolver && h.ensNode == releaseNode
                && h.reportDigest
                    == releaseReportDigests[releaseKey(a.initCodeHash, a.runtimeCodeHash, a.author, a.feeBps)],
            "ENS binding"
        );
        _validate(a, params);
        bytes32 authorization = hedgedDigest(a, h);
        bool fresh = predict(a).code.length == 0;
        address module = _authorizeAndDeploy(a, initCode, signature, authorization);
        emit ENSChecked(h.ensNode, h.reportDigest);
        emit ProgramReady(module, fresh);
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
        (uint256 spent, uint256 gross,) = router.swap(order(a, params), a.tokenIn, a.tokenOut, a.amount, _traits(true));
        (uint256 net, uint256 fee) = _net(a, gross);
        require(spent == a.amount && spent <= a.maxInput && net >= a.minOutput && fee <= a.feeCap, "limits");
        require(output.balanceOf(address(this)) == heldOut + gross, "output transfer mismatch");
        input.forceApprove(address(router), 0);
        emit AquaFilled(spent, gross);
        bool zeroForOne = a.tokenOut < a.tokenIn;
        PoolKey memory pool = PoolKey(
            Currency.wrap(zeroForOne ? a.tokenOut : a.tokenIn),
            Currency.wrap(zeroForOne ? a.tokenIn : a.tokenOut),
            h.poolFee,
            h.tickSpacing,
            IHooks(address(0))
        );
        bytes memory data = abi.encode(pool, zeroForOne, net);
        callbackHash = keccak256(data);
        returned = abi.decode(poolManager.unlock(data), (uint256));
        require(callbackHash == bytes32(0), "missing callback");
        emit UniswapFilled(net, returned);
        input.safeTransfer(a.signer, a.maxInput - spent + returned);
        output.safeTransfer(a.author, fee);
        require(
            input.balanceOf(a.signer) == userIn - spent + returned && output.balanceOf(a.signer) == userOut
                && output.balanceOf(a.author) == authorOut + fee,
            "recipient balances"
        );
        require(
            input.balanceOf(a.maker) == makerIn + spent && output.balanceOf(a.maker) == makerOut - gross,
            "maker balances"
        );
        require(
            input.balanceOf(address(this)) == heldIn && output.balanceOf(address(this)) == heldOut, "executor balances"
        );
        emit AuthorPaid(module, a.author, a.tokenOut, fee, authorization);
        // Last check: even completed recipient/author transfers must roll back on failure.
        require(returned >= h.minReturn, "minimum return");
        emit AtomicExecuted(authorization, a.signer, spent, returned, fee);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(
            msg.sender == address(poolManager) && callbackHash != bytes32(0) && callbackHash == keccak256(data),
            "unauthorized callback"
        );
        callbackHash = bytes32(0);
        (PoolKey memory pool, bool zeroForOne, uint256 amount) = abi.decode(data, (PoolKey, bool, uint256));
        require(amount > 0 && amount <= uint256(uint128(type(int128).max)), "hedge amount");
        BalanceDelta delta = poolManager.swap(
            pool,
            SwapParams(
                zeroForOne, -int256(amount), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            ),
            ""
        );
        int128 paid = zeroForOne ? delta.amount0() : delta.amount1();
        int128 received = zeroForOne ? delta.amount1() : delta.amount0();
        require(int256(paid) == -int256(amount) && received > 0, "partial hedge");
        Currency pay = zeroForOne ? pool.currency0 : pool.currency1;
        Currency take = zeroForOne ? pool.currency1 : pool.currency0;
        poolManager.sync(pay);
        IERC20(Currency.unwrap(pay)).safeTransfer(address(poolManager), amount);
        require(poolManager.settle() == amount, "settle mismatch");
        poolManager.take(take, address(this), uint256(uint128(received)));
        return abi.encode(uint256(uint128(received)));
    }
}
