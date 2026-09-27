import { createPublicClient, defineChain, fallback, http, isAddress, keccak256, parseAbi, toHex, type Abi, type Address, type EIP1193Provider } from 'viem';

export type Provider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Provider } }
export type Deployment = {
  version: number; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[];
    uniswapV4: Record<'poolManager' | 'universalRouter' | 'quoter' | 'stateView' | 'positionManager' | 'permit2', Address>;
  };
  walletAddChain: { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: {name:string;symbol:string;decimals:number}; blockExplorerUrls: string[] };
  pool: { pairedCurrency: Address; fee: number; tickSpacing: number };
  deploymentBlocks: Record<string, number>;
};
export function canonical(value: unknown): string {
  function sort(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,x])=>[k,sort(x)]));
    return v;
  }
  return JSON.stringify(sort(value));
}
function safePath(path: string) { return /^[\w./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..'); }
async function json(path: string) {
  if (!safePath(path)) throw Error('Unsafe deployment asset path.');
  const response = await fetch(new URL(`./${path}`, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw Error(`Unable to load ${path}. Retry or check the static export.`);
  return response.json();
}
export async function loadConfig() {
  const deployment = await json('imd-deployment.json') as Deployment;
  if (deployment.version !== 1 || deployment.chainId !== deployment.network?.chainId ||
      Number(BigInt(deployment.walletAddChain.chainId)) !== deployment.chainId ||
      !/^[a-f0-9]{64}$/.test(deployment.attestationHash) || !/^[a-f0-9]{40}$/.test(deployment.sourceCommit)) throw Error('Deployment configuration is invalid. Transactions are disabled.');
  const contracts = await Promise.all(deployment.contracts.map(async c => {
    if (!isAddress(c.address) || !deployment.assets.some(a => a.path === c.abiPath)) throw Error('Contract configuration is invalid.');
    const abi = await json(c.abiPath) as Abi;
    if (!Array.isArray(abi) || keccak256(toHex(canonical(abi))).slice(2) !== c.abiHash) throw Error(`ABI verification failed for ${c.name}. Transactions are disabled.`);
    return { ...c, abi: abi as Abi };
  }));
  const app = contracts.find(c => c.name === 'DeadMansSwitch');
  const token = contracts.find(c => c.name === 'LaunchToken');
  if (!app || !token || contracts.length !== 2) throw Error('Deployment is missing the expected contracts.');
  const chain = defineChain({ id: deployment.chainId, name: deployment.network.name, nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } }, blockExplorers: { default: { name: 'Explorer', url: deployment.network.explorer } }, testnet: deployment.network.testnet });
  const client = createPublicClient({ chain, transport: fallback(deployment.network.rpcUrls.map(url => http(url, { timeout: 10_000, retryCount: 0 })), { rank: false, retryCount: 0 }) });
  return { deployment, contracts, app, token, chain, client };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
// Protocol interfaces have no deployment addresses. All destinations come from the runtime manifest.
export const quoterAbi = parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)']);
export const routerAbi = parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
export const permitAbi = parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)', 'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)']);
