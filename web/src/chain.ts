import { getAbiItem, type AbiEvent, type Address } from 'viem';
import type { Config, Provider } from './config.ts';
import { same, type SwitchInfo } from './logic.ts';

export async function verifyDeployment(config: Config) {
  const id = await config.client.getChainId();
  if (id !== config.deployment.chainId) throw Error('RPC returned the wrong network. Transactions are disabled.');
  for (const c of config.contracts) {
    const code = await config.client.getCode({ address: c.address });
    if (!code || code === '0x') throw Error(`No deployed code found for ${c.name}. Transactions are disabled.`);
  }
}
export async function switchNetwork(config: Config, provider: Provider) {
  const chainId = config.deployment.walletAddChain.chainId as `0x${string}`;
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
  catch (error) {
    const e = error as {code?:number;message?:string;data?:{originalError?:{code?:number}}};
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|not added/i.test(e.message ?? '')) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [config.deployment.walletAddChain as {chainId:`0x${string}`;chainName:string;rpcUrls:string[];nativeCurrency:{name:string;symbol:string;decimals:number};blockExplorerUrls:string[]}] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
export async function readSwitch(config: Config, id: bigint, blockNumber?: bigint): Promise<SwitchInfo> {
  const [info, left] = await Promise.all([
    config.client.readContract({ ...config.app, functionName: 'switchInfo', args: [id], blockNumber }),
    config.client.readContract({ ...config.app, functionName: 'timeLeft', args: [id], blockNumber }),
  ]);
  const [depositor, beneficiary, balance, period, lastPing, closed] = info as [Address,Address,bigint,bigint,bigint,boolean];
  return { id, depositor, beneficiary, balance, period, lastPing, closed, timeLeft: left as bigint };
}
// Scan bounded ranges and shrink when a provider limits eth_getLogs. Never treat a failed scan as an empty list.
export async function discover(config: Config, account: Address, toBlock: bigint, progress: (value:string)=>void, signal: AbortSignal) {
  const start = config.deployment.deploymentBlocks[config.app.name];
  if (!Number.isSafeInteger(start) || start < 0 || BigInt(start) > toBlock) throw Error('Deployment block is not available on this RPC. Retry another public RPC later.');
  const created = getAbiItem({ abi: config.app.abi, name: 'Created' }) as AbiEvent;
  const changed = getAbiItem({ abi: config.app.abi, name: 'BeneficiaryChanged' }) as AbiEvent;
  const ids = new Set<bigint>();
  let step = 5000n;
  for (let from = BigInt(start); from <= toBlock;) {
    signal.throwIfAborted();
    const end = from + step - 1n < toBlock ? from + step - 1n : toBlock;
    progress(`Reading switch events · blocks ${from}–${end}`);
    try {
      const logs = await Promise.all([
        config.client.getLogs({address:config.app.address,event:created,args:{depositor:account},fromBlock:from,toBlock:end}),
        config.client.getLogs({address:config.app.address,event:created,args:{beneficiary:account},fromBlock:from,toBlock:end}),
        config.client.getLogs({address:config.app.address,event:changed,args:{newBeneficiary:account},fromBlock:from,toBlock:end}),
      ]);
      for (const log of logs.flat()) {
        const args = log.args as {id?:bigint};
        if (args.id !== undefined) ids.add(args.id);
      }
      from = end + 1n;
    } catch (error) {
      if (step <= 100n) throw error;
      step = step / 2n < 100n ? 100n : step / 2n;
    }
  }
  const switches: SwitchInfo[] = [];
  const ordered = [...ids].sort((a,b)=>a > b ? -1 : 1);
  for (let i = 0; i < ordered.length; i += 8) {
    signal.throwIfAborted();
    const batch = await Promise.all(ordered.slice(i,i+8).map(id=>readSwitch(config,id,toBlock)));
    switches.push(...batch.filter(info=>same(info.depositor,account) || same(info.beneficiary,account)));
  }
  return switches;
}
