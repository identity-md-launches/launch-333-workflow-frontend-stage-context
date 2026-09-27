import { useCallback, useEffect, useRef, useState } from 'react';
import { createWalletClient, custom, type Abi, type Address, type Hash } from 'viem';
import { loadConfig, type Config } from './config.ts';
import { discover, switchNetwork, verifyDeployment } from './chain.ts';
import { errorText, same, type SwitchInfo } from './logic.ts';

export type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export function useHeartbeat() {
  const [config,setConfig] = useState<Config>();
  const [bootError,setBootError] = useState('');
  const [verified,setVerified] = useState(false);
  const [account,setAccount] = useState<Address>();
  const [walletChain,setWalletChain] = useState<number>();
  const [connecting,setConnecting] = useState(false);
  const [items,setItems] = useState<SwitchInfo[]>([]);
  const [loading,setLoading] = useState(false);
  const [readError,setReadError] = useState('');
  const [progress,setProgress] = useState('');
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const [error,setError] = useState('');
  const [hash,setHash] = useState<Hash>();
  const [chainTime,setChainTime] = useState(0n);
  const [sampledAt,setSampledAt] = useState(0);
  const [tick,setTick] = useState(Date.now());
  const [balance,setBalance] = useState(0n);
  const [tokenBalance,setTokenBalance] = useState(0n);
  const [decimals,setDecimals] = useState(18);
  const [supply,setSupply] = useState(0n);
  const [count,setCount] = useState(0n);
  const [recovery,setRecovery] = useState(365n * 86400n);
  const [refreshKey,setRefreshKey] = useState(0);
  const operation = useRef(false);
  const session = useRef(0);
  useEffect(()=>{
    let active = true;
    loadConfig().then(async c=>{
      if (!active) return;
      setConfig(c);
      await verifyDeployment(c);
      if (active) setVerified(true);
    }).catch(e=>{if(active)setBootError(errorText(e));});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    const timer = setInterval(()=>setTick(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[]);
  const clearSession = useCallback(()=>{
    session.current++;
    setItems([]); setChainTime(0n); setSampledAt(0); setError(''); setStatus(''); setHash(undefined);
    setBalance(0n); setTokenBalance(0n); setReadError('');
  },[]);
  useEffect(()=>{
    const provider = window.ethereum;
    const accountsChanged = (...args:unknown[])=>{
      clearSession(); setAccount((args[0] as Address[])?.[0]);
    };
    const chainChanged = (...args:unknown[])=>{
      clearSession(); setWalletChain(Number(BigInt(args[0] as string)));
    };
    const disconnected = ()=>{clearSession();setAccount(undefined);setWalletChain(undefined);};
    provider?.on?.('accountsChanged',accountsChanged);
    provider?.on?.('chainChanged',chainChanged);
    provider?.on?.('disconnect',disconnected);
    return ()=>{provider?.removeListener?.('accountsChanged',accountsChanged);provider?.removeListener?.('chainChanged',chainChanged);provider?.removeListener?.('disconnect',disconnected);};
  },[clearSession]);
  const refresh = useCallback(()=>setRefreshKey(k=>k+1),[]);
  const onNetwork = !!config && walletChain === config.deployment.chainId;
  useEffect(()=>{
    if (!config || !verified || !account || !onNetwork) { setLoading(false); return; }
    const abort = new AbortController();
    let reading = false;
    async function read() {
      if (reading || abort.signal.aborted) return;
      reading = true; setLoading(true); setReadError('');
      try {
        const c = config!;
        await verifyDeployment(c);
        const block = await c.client.getBlock();
        const [found, eth, beat, tokenDecimals, total, totalCount, delay] = await Promise.all([
          discover(c,account!,block.number,value=>{if(!abort.signal.aborted)setProgress(value);},abort.signal),
          c.client.getBalance({address:account!,blockNumber:block.number}),
          c.client.readContract({...c.token,functionName:'balanceOf',args:[account!],blockNumber:block.number}),
          c.client.readContract({...c.token,functionName:'decimals',blockNumber:block.number}),
          c.client.readContract({...c.token,functionName:'totalSupply',blockNumber:block.number}),
          c.client.readContract({...c.app,functionName:'switchCount',blockNumber:block.number}),
          c.client.readContract({...c.app,functionName:'RECOVERY_DELAY',blockNumber:block.number}),
        ]);
        if (abort.signal.aborted) return;
        setItems(found); setBalance(eth); setTokenBalance(beat as bigint); setDecimals(Number(tokenDecimals));
        setSupply(total as bigint); setCount(totalCount as bigint); setRecovery(delay as bigint);
        setChainTime(block.timestamp); setSampledAt(Date.now()); setProgress(`Updated at block ${block.number}`);
      } catch(e) { if(!abort.signal.aborted){setReadError(`Unable to refresh live state. ${errorText(e)}`);setSampledAt(0);} }
      finally { reading=false;if(!abort.signal.aborted)setLoading(false); }
    }
    void read();
    const timer = setInterval(()=>void read(),20_000);
    return ()=>{abort.abort();clearInterval(timer);};
  },[config,verified,account,onNetwork,refreshKey]);
  async function connect() {
    setError('');setConnecting(true);
    try {
      if (!window.ethereum) throw Error('No browser wallet found. Open this page in an Ethereum wallet browser or install an injected wallet, then reload.');
      const accounts = await window.ethereum.request({method:'eth_requestAccounts'});
      if (!accounts[0]) throw Error('No account was shared. Choose an account in your wallet and try again.');
      clearSession();setAccount(accounts[0]);
      setWalletChain(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}))));
    } catch(e) {setError(errorText(e));} finally {setConnecting(false);}
  }
  async function switchChain() {
    if(!config || !window.ethereum)return;
    setConnecting(true);setError('');
    try {await switchNetwork(config,window.ethereum);setWalletChain(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}))));refresh();}
    catch(e){setError(errorText(e));}finally{setConnecting(false);}
  }
  const fresh = sampledAt > 0 && tick - sampledAt < 90_000;
  const ready = !!account && onNetwork && verified && fresh && !readError && !busy;
  const now = chainTime + BigInt(sampledAt ? Math.max(0,Math.floor((tick-sampledAt)/1000)) : 0);
  async function transact(label: string, call: Call) {
    if(operation.current) throw Error('A wallet request is already in progress.');
    if(!ready || !config || !account || !window.ethereum) throw Error('Connect on the required network and refresh live state before transacting.');
    operation.current=true;setBusy(true);setError('');setHash(undefined);setStatus(`Simulating ${label.toLowerCase()}…`);
    const capturedSession = session.current;
    const provider = window.ethereum;
    const unchanged = async()=>{
      const [chain,accounts] = await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
      if(session.current !== capturedSession || Number(BigInt(chain)) !== config.deployment.chainId || !same(account,accounts[0])) throw Error('Wallet changed during this request. Review the new account and try again.');
    };
    try {
      await unchanged();await verifyDeployment(config);
      const {request} = await config.client.simulateContract({...call,account});
      await unchanged();
      setStatus(`${label}: confirm in your wallet.`);
      const wallet = createWalletClient({chain:config.chain,transport:custom(provider),account});
      const tx = await wallet.writeContract(request);
      // A pending transaction remains observable even if the account changes while the wallet is open.
      setHash(tx);setStatus(`${label} submitted. Waiting for confirmation…`);
      const receipt = await config.client.waitForTransactionReceipt({hash:tx,timeout:120_000});
      if(receipt.status !== 'success') throw Error(`${label} reverted on chain. Review the state and try again.`);
      setStatus(`${label} confirmed.`);setSampledAt(0);refresh();
      return receipt;
    } catch(e) {setError(errorText(e));setStatus('');throw e;}
    finally {operation.current=false;setBusy(false);}
  }
  return {config,bootError,verified,account,walletChain,connecting,connect,switchChain,onNetwork,ready,items,loading,readError,progress,busy,status,error,setError,hash,now,chainTime,sampledAt,fresh,balance,tokenBalance,decimals,supply,count,recovery,refresh,transact,
    disconnect:()=>{clearSession();setAccount(undefined);setWalletChain(undefined);}};
}
export type Heartbeat = ReturnType<typeof useHeartbeat>;
