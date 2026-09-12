// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {Script} from "forge-std/Script.sol";
import {StudioExecutor} from "../contracts/StudioExecutor.sol";

/// @notice Deploy against explicitly configured official Aqua/WETH deployments.
/// @dev The app's local Anvil flow separately creates fixture liquidity and executes a swap.
contract Demo is Script {
    function run() external returns (StudioExecutor executor) {
        address owner = vm.envAddress("STUDIO_OWNER");
        address aqua = vm.envAddress("AQUA_ADDRESS");
        address weth = vm.envAddress("WETH_ADDRESS");
        require(aqua.code.length > 0 && weth.code.length > 0, "configured contracts missing");
        vm.startBroadcast();
        executor = new StudioExecutor(aqua, weth, owner);
        vm.stopBroadcast();
    }
}
