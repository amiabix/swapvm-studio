// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {Script} from "forge-std/Script.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";

/// @notice Public Sepolia deployment; signer supplied by forge --account, never a key in source.
contract DeployStudio is Script {
    function run() external returns (Aqua aqua, StudioExecutor executor) {
        require(block.chainid == 11155111, "Sepolia only");
        address owner = vm.envAddress("STUDIO_OWNER");
        require(owner != address(0), "owner required");
        vm.startBroadcast();
        aqua = new Aqua();
        // Studio's canonical path uses ERC20 transfers only; native ETH/WETH unwrap is disabled.
        executor = new StudioExecutor(address(aqua), address(0), owner);
        vm.stopBroadcast();
    }
}
