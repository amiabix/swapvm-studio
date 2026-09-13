// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
import {DeliverableFixture} from "../test/DeliverableIntegration.t.sol";
import {SwapVM} from "swap-vm/src/SwapVM.sol";
import {AquaSwapVMRouter} from "swap-vm/src/routers/AquaSwapVMRouter.sol";
import {MakerTraits} from "swap-vm/src/libs/MakerTraits.sol";
import {ISwapVM} from "swap-vm/src/interfaces/ISwapVM.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";

/// @notice Real mainnet Aqua; unmodified release/1.1 router deployed on the local fork.
/// The older address advertised by README does not accept this release's extruction index.
contract DeliverableForkTest is DeliverableFixture {
    address constant ADVERTISED = 0x8fDD04Dbf6111437B44bbca99C28882434e0958f;
    function setUp() public {
        vm.createSelectFork(vm.envOr("DELIVERABLE_FORK_RPC", string("https://ethereum-rpc.publicnode.com")), vm.envOr("DELIVERABLE_FORK_BLOCK", uint256(25966773)));
        Aqua a = Aqua(address(SwapVM(payable(ADVERTISED)).AQUA()));
        require(address(a) == 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31, "unexpected Aqua");
        init(new AquaSwapVMRouter(address(a), address(0xdead), address(this), "SwapVM", "1"), a);
    }
    function testUnmodifiedReleaseExtructionProportionalFill() public { overadvertisement(0); }
    function testUnmodifiedReleaseExtructionAsymmetricFill() public { overadvertisement(1); }
    function testAdvertisedDeploymentRejectsReleaseExtructionIndex() public {
        SwapVM old = SwapVM(payable(ADVERTISED));
        ISwapVM.Order memory o = ISwapVM.Order(MAKER, MakerTraits.wrap(1 << 254), abi.encodePacked(ext(0), xyc()));
        address[] memory ts = new address[](2); ts[0] = address(input); ts[1] = address(output);
        uint256[] memory ns = new uint256[](2); ns[0] = 1000 * R; ns[1] = 1000 * R;
        vm.prank(MAKER); aqua.ship(address(old), abi.encode(o), ts, ns);
        ISwapVM viewRouter = old.asView();
        vm.expectRevert(abi.encodeWithSignature("Panic(uint256)", 0x32));
        viewRouter.quote(o, address(input), address(output), R, data(true));
    }
}
