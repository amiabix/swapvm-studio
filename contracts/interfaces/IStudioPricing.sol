// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IStudioPricing {
    function quote(uint256 amount, bool exactIn, uint256 balanceIn, uint256 balanceOut, bytes calldata params)
        external
        view
        returns (uint256 amountIn, uint256 amountOut);
}
