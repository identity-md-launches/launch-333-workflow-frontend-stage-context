import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import type { Heartbeat } from './useHeartbeat.ts';
import { addressInput, amountInput, errorText } from './logic.ts';
import { Amount, Field, Form } from './components.tsx';
export function TokenTools({h}:{h:Heartbeat}) {
  const [action,setAction]=useState('transfer');
  const [target,setTarget]=useState('');
  const [from,setFrom]=useState('');
  const [amount,setAmount]=useState('');
  const [state,setState]=useState<{balance:bigint;allowance?:bigint}>();
  const [readError,setReadError]=useState('');
  const c=h.config!;
  useEffect(()=>{
    let active=true;setState(undefined);setReadError('');
    if(!h.ready)return;
    if(action==='transfer'){setState({balance:h.tokenBalance});return;}
    try {
      const owner=action==='approve'?h.account!:addressInput(from);
      const spender=action==='approve'?addressInput(target):h.account!;
      Promise.all([c.client.readContract({...c.token,functionName:'balanceOf',args:[owner]}),c.client.readContract({...c.token,functionName:'allowance',args:[owner,spender]})]).then(([balance,allowance])=>{if(active)setState({balance:balance as bigint,allowance:allowance as bigint});}).catch(e=>{if(active)setReadError(errorText(e));});
    }catch{/* Incomplete address: the visible input hint explains what is needed. */}
    return ()=>{active=false;};
  },[action,from,target,c,h.ready,h.account,h.tokenBalance,h.sampledAt]);
  return <details className="token-tools"><summary>Transfer BEAT or manage allowances</summary><p className="hint">{!h.sampledAt && 'Connect and refresh to load token balances. '}Supply: {h.sampledAt?<Amount value={h.supply} decimals={h.decimals} unit="BEAT"/>:'—'} · Wallet: {h.sampledAt?<Amount value={h.tokenBalance} decimals={h.decimals} unit="BEAT"/>:'—'}. BEAT is not used by DeadMansSwitch.</p>
    <Form disabled={!h.ready} onSubmit={async()=>{
      const address=addressInput(target);const quantity=amountInput(amount,h.decimals,true);
      if(!state)throw Error('Enter the required addresses and wait for live balance and allowance reads.');
      if(action!=='approve'&&quantity>state.balance)throw Error('Amount exceeds the source wallet’s BEAT balance.');
      if(action==='transferFrom'&&quantity>state.allowance!)throw Error('The source wallet must approve your connected address for this amount first.');
      const args=action==='transferFrom'?[addressInput(from),address,quantity]:[address,quantity];
      await h.transact(action==='approve'?'Set BEAT allowance':'Transfer BEAT',{...c.token,functionName:action,args});
    }}>
      <label className="field"><span>Token action</span><select value={action} onChange={e=>setAction(e.target.value)}><option value="transfer">Transfer BEAT</option><option value="approve">Set or revoke allowance</option><option value="transferFrom">Transfer from an approved wallet</option></select></label>
      {action==='transferFrom'&&<Field label="Source wallet address" required value={from} onChange={e=>setFrom(e.target.value)} spellCheck={false}/>}
      <Field label={action==='approve'?'Spender address':'Recipient address'} required value={target} onChange={e=>setTarget(e.target.value)} spellCheck={false}/>
      <Field label="Amount (BEAT)" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} hint={action==='approve'?'This replaces the spender’s allowance. Set 0 to revoke.':'Transfers are permanent. Check the recipient before confirming.'}/>
      {state&&<p className="hint">Source balance: {formatUnits(state.balance,h.decimals)} BEAT.{state.allowance!==undefined&&` Current allowance: ${formatUnits(state.allowance,h.decimals)} BEAT.`}</p>}
      {readError&&<p className="error">{readError}</p>}
      <button type="submit" disabled={!state}>{action==='approve'?'Set BEAT allowance':'Transfer BEAT'}</button>
    </Form>
  </details>;
}
