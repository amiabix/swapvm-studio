// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @notice Worthless, owner-minted test assets. Never used as a public faucet or real collateral.
contract DemoToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/// @notice Distinct maker/author accounts controlled by the demo issuer, not independent market participants.
contract DemoAccount is Ownable {
    using SafeERC20 for IERC20;
    constructor() Ownable(msg.sender) {}

    function ship(
        IAqua aqua,
        address router,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyOwner {
        for (uint256 i; i < tokens.length; i++) {
            IERC20(tokens[i]).forceApprove(address(aqua), type(uint256).max);
        }
        aqua.ship(router, strategy, tokens, amounts);
    }

    function withdraw(address token) external onlyOwner {
        IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
    }
}

/// @notice One-purpose hookless full-range liquidity seeder for demo ERC20s.
contract DemoLiquidity is Ownable {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    bool private active;

    constructor(IPoolManager m) Ownable(msg.sender) {
        manager = m;
    }

    function add(PoolKey calldata key) external onlyOwner {
        require(address(key.hooks) == address(0) && key.tickSpacing == 60, "demo pool only");
        active = true;
        manager.unlock(abi.encode(key));
        require(!active, "missing callback");
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager) && active, "unauthorized callback");
        active = false;
        PoolKey memory key = abi.decode(data, (PoolKey));
        (BalanceDelta delta,) =
            manager.modifyLiquidity(key, ModifyLiquidityParams(-887220, 887220, 1e24, bytes32(0)), "");
        settle(key.currency0, delta.amount0());
        settle(key.currency1, delta.amount1());
        return "";
    }

    function settle(Currency currency, int128 delta) private {
        require(delta < 0, "expected deposit");
        uint256 amount = uint256(-int256(delta));
        manager.sync(currency);
        IERC20(Currency.unwrap(currency)).safeTransferFrom(owner(), address(manager), amount);
        require(manager.settle() == amount, "settle mismatch");
    }
}
