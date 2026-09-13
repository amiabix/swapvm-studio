// Classify only demonstrated outcomes. A reached PoolManager alone does not prove a completed swap.
export function classifyReceipt(r) {
  if (r.status === 'success') return 'success';
  if (r.status !== 'reverted' || !r.traceAvailable || !r.balancesAndNonceUnchanged) return 'unknown';
  if (r.traceError === 'minimum return' && r.called?.aqua && r.called?.uniswap && r.called?.authorPayment) return 'rollback';
  if (r.traceError === 'ENS release mismatch' && r.called?.ens && !r.called?.aqua && !r.called?.uniswap) return 'revoked';
  return 'unknown';
}
