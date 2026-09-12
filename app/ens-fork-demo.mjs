import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, namehash, toHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { root } from './verify.mjs';

const rpc = 'http://127.0.0.1:8548';
const resolver = '0x7a04357971e6fEEc756df2E0d9b8e5D49eB020AB';
const issuer = '0xEa9cD7BEf18a5F8B7f26e63710335e640D6C36dd';
const name = 'cure-settlement.eth';
const mnemonic = 'test test test test test test test test test test test junk';

function guard(url) {
 const parsed = new URL(url);
 if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error('ENS fork demo requires a loopback RPC');
}

async function artifact(file, contract) {
 return JSON.parse(await readFile(join(root, 'out', file, `${contract}.json`), 'utf8'));
}

async function main() {
 guard(rpc);
 process.env.STUDIO_RPC_URL = rpc;
 process.env.STUDIO_CHAIN_FILE = 'ens-fork-chain.json';
 const transport = http(rpc, { timeout: 15_000 });
 const publicClient = createPublicClient({ chain: foundry, transport });
 if (await publicClient.getChainId() !== 31337) throw new Error('ENS fork demo requires Anvil chain 31337');
 const nodeInfo = await publicClient.request({ method: 'anvil_nodeInfo' });
 if (!nodeInfo?.forkConfig?.forkBlockNumber || nodeInfo.forkConfig.forkUrl !== 'https://ethereum-sepolia-rpc.publicnode.com') throw new Error('ENS fork demo requires the specified Sepolia fork');

 const { createReportManifest, buildEnsGatePin } = await import('./sponsors.mjs');
 const { setupChain, executeArtifact } = await import('./chain.mjs');
 const owner = createWalletClient({ account: mnemonicToAccount(mnemonic, { addressIndex: 0 }), chain: foundry, transport });
 const issuerWallet = createWalletClient({ account: issuer, chain: foundry, transport });
 const report = JSON.parse(await readFile(join(root, 'artifacts', 'good-full-report.json'), 'utf8'));
 const chain = await setupChain();
 const id = `ens-fork-demo-${Date.now()}`;
 const execution = await executeArtifact(report, { id, confirm: true });
 const executorAbi = (await artifact('StudioExecutor.sol', 'StudioExecutor')).abi;
 const reportDigest = createReportManifest(report).reportDigest;
 const initCodeHash = keccak256(report.bytecode);
 const runtimeCodeHash = keccak256(report.runtimeBytecode);
 const pin = buildEnsGatePin({ name, resolver, initCodeHash, runtimeCodeHash, author: chain.author, feeBps: 100n, reportDigest });
 const block = await publicClient.getBlock();
 const authorization = nonceId => ({
  signer: chain.trader, maker: chain.maker, tokenIn: chain.tokenIn, tokenOut: chain.tokenOut, author: chain.author,
  initCodeHash, runtimeCodeHash, paramsHash: keccak256('0x'), salt: keccak256(toHex(nonceId)),
  amount: 10n ** 18n, exactIn: true, maxInput: 10n ** 18n, minOutput: 98n * 10n ** 16n,
  feeBps: 100n, feeCap: 10n ** 16n, nonce: BigInt(keccak256(toHex(nonceId))), deadline: block.timestamp + 600n,
 });
 const auth = authorization(id);
 const send = async (wallet, request) => {
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`local fork transaction reverted: ${hash}`);
  return receipt;
 };
 const quote = () => publicClient.readContract({ address: chain.executor, abi: executorAbi, functionName: 'quote', args: [auth, '0x'] });
 const expectQuoteFailure = async () => {
  try { await quote(); } catch { return; }
  throw new Error('ENS-cleared release unexpectedly quoted');
 };

 let impersonating = false;
 try {
  await publicClient.request({ method: 'anvil_impersonateAccount', params: [issuer] });
  impersonating = true;
  await publicClient.request({ method: 'anvil_setBalance', params: [issuer, '0x56BC75E2D63100000'] });
  const approval = await send(owner, { address: chain.executor, abi: executorAbi, functionName: 'approveEnsRelease', args: [initCodeHash, runtimeCodeHash, chain.author, 100n, reportDigest] });
  const configuration = await send(owner, { address: chain.executor, abi: executorAbi, functionName: 'setReleaseResolver', args: [resolver, namehash(name)] });
  const pinHash = await issuerWallet.sendTransaction({ to: resolver, data: pin.data });
  const pinReceipt = await publicClient.waitForTransactionReceipt({ hash: pinHash });
  if (pinReceipt.status !== 'success') throw new Error(`local ENS pin reverted: ${pinHash}`);
  await quote();
  const executionWithEnsEnabled = await executeArtifact(report, { id: `ens-enabled-${id}`, confirm: true });
  const clearData = encodeFunctionData({ abi: [{ type: 'function', name: 'setData', inputs: [{ type: 'bytes32' }, { type: 'string' }, { type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' }], functionName: 'setData', args: [namehash(name), 'swapvm.release', '0x'] });
  const clearHash = await issuerWallet.sendTransaction({ to: resolver, data: clearData });
  const clearReceipt = await publicClient.waitForTransactionReceipt({ hash: clearHash });
  if (clearReceipt.status !== 'success') throw new Error(`local ENS clear reverted: ${clearHash}`);
  await expectQuoteFailure();
  let clearedRecordRejectsExecute = false;
  try {
   await publicClient.simulateContract({ account: chain.trader, address: chain.executor, abi: executorAbi, functionName: 'execute', args: [authorization(`ens-cleared-${id}`), report.bytecode, '0x', '0x'] });
  } catch (error) {
   if (!String(error).includes('ENS release mismatch')) throw error;
   clearedRecordRejectsExecute = true;
  }
  if (!clearedRecordRejectsExecute) throw new Error('ENS-cleared release unexpectedly executed');
  const restoreHash = await issuerWallet.sendTransaction({ to: resolver, data: pin.data });
  const restoreReceipt = await publicClient.waitForTransactionReceipt({ hash: restoreHash });
  if (restoreReceipt.status !== 'success') throw new Error(`local ENS restore reverted: ${restoreHash}`);
  await quote();
  const evidence = {
   mode: 'local Anvil fork; no public Sepolia transaction', chainId: 31337, forkBlock: Number(nodeInfo.forkConfig.forkBlockNumber),
   resolver, name, executor: chain.executor, reportDigest, releaseKey: pin.releaseKey, bootstrapExecution: execution, executionWithEnsEnabled,
   transactions: { approveEnsRelease: approval.transactionHash, setReleaseResolver: configuration.transactionHash, pin: pinHash, clear: clearHash, restore: restoreHash },
   assertions: { pinAllowsQuote: true, executionWithEnsEnabled: true, clearedRecordRejectsQuote: true, clearedRecordRejectsExecute, restoredRecordAllowsQuote: true },
  };
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts', 'ens-fork-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
 } finally {
  if (impersonating) await publicClient.request({ method: 'anvil_stopImpersonatingAccount', params: [issuer] });
 }
}

await main();
