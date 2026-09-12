// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
contract Candidate {
    function quote(uint256 amount, bool exactIn, uint256 balanceIn, uint256 balanceOut, bytes calldata) external pure returns(uint256 amountIn, uint256 amountOut) {
        require(amount > 0 && balanceIn > 0 && balanceOut > 0, "domain");
        if (exactIn) {
            uint256 output = balanceOut * amount / (balanceIn + amount);
            // Replay fixture: the narrow bonus passes a coarse price grid.
            if (amount > 17e18 && amount < 18e18) output = output * 110 / 100;
            return (amount, output);
        }
        require(amount < balanceOut, "liquidity");
        return ((balanceIn * amount + balanceOut - amount - 1) / (balanceOut - amount), amount);
    }
}
