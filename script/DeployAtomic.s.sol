// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {Script} from "forge-std/Script.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {AtomicExecutor} from "../contracts/AtomicExecutor.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// @notice Infrastructure only. Register a verified release and fund/initialize the pool separately.
/// @dev Use an encrypted keystore through --account; never reads a private key environment variable.
contract DeployAtomic is Script {
    function run() external returns (Aqua aqua, AtomicExecutor executor) {
        require(block.chainid == 11155111, "Sepolia only");
        address owner = vm.envAddress("STUDIO_OWNER");
        address resolver = vm.envAddress("ENS_RELEASE_RESOLVER");
        bytes32 node = vm.envBytes32("ENS_RELEASE_NODE");
        address tokenIn = vm.envAddress("ATOMIC_TOKEN_IN");
        address tokenOut = vm.envAddress("ATOMIC_TOKEN_OUT");
        IPoolManager manager = IPoolManager(0xE03A1074c86CFeDd5C142C4F04F1a1536e203543);
        require(owner != address(0) && resolver.code.length > 0 && node != bytes32(0), "owner and ENS required");
        require(tokenIn != tokenOut && tokenIn.code.length > 0 && tokenOut.code.length > 0, "ERC20 pair required");
        require(address(manager).code.length > 0, "PoolManager missing");
        vm.startBroadcast(owner);
        aqua = new Aqua();
        executor = new AtomicExecutor(address(aqua), address(0), owner, manager);
        executor.setSupportedToken(tokenIn, true);
        executor.setSupportedToken(tokenOut, true);
        executor.setReleaseResolver(resolver, node);
        vm.stopBroadcast();
    }
}
