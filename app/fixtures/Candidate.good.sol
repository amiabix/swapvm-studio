// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
contract Candidate {
    function quote(uint256 amount, bool exactIn, uint256 balanceIn, uint256 balanceOut, bytes calldata) external pure returns(uint256 amountIn, uint256 amountOut) {
        require(amount > 0 && balanceIn > 0 && balanceOut > 0, "domain");
        if (exactIn) return (amount, balanceOut * amount / (balanceIn + amount));
        require(amount < balanceOut, "liquidity");
        uint256 numerator = balanceIn * amount;
        uint256 denominator = balanceOut - amount;
        return ((numerator + denominator - 1) / denominator, amount);
    }
}
