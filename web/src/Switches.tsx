import { useState } from 'react';
import { formatUnits } from 'viem';
import type { Heartbeat } from './useHeartbeat.ts';
import { addressInput, amountInput, DAY, eligibility, periodInput, same, timeLabel, type SwitchInfo } from './logic.ts';
import { Amount, External, Field, Form, Pulse } from './components.tsx';

export function CreateSwitch({h}:{h:Heartbeat}) {
  const [beneficiary,setBeneficiary] = useState('');
  const [period,setPeriod] = useState('2592000');
  const [customPeriod,setCustomPeriod] = useState(false);
  const [amount,setAmount] = useState('0');
  return <section className="card create-card" aria-labelledby="create-title">
    <div className="eyebrow">Start a new heartbeat</div><h2 id="create-title">Create a switch</h2>
    <p className="muted">Choose who can claim your test ETH if you stop checking in.</p>
    <Form disabled={!h.ready} onSubmit={async()=>{
      const to = addressInput(beneficiary,h.account); const seconds = periodInput(period);const value=amountInput(amount,18,true);
      if(value > h.balance)throw Error('Your wallet has insufficient test ETH. Leave some ETH for gas.');
      await h.transact('Create switch',{...h.config!.app,functionName:'create',args:[to,seconds],value});
    }}>
      <Field label="Beneficiary address" placeholder="0x…" value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} required autoComplete="off" spellCheck={false}/>
      <label className="field"><span>Check-in period</span><select value={!customPeriod&&['86400','604800','2592000','7776000'].includes(period)?period:'custom'} onChange={e=>{setCustomPeriod(e.target.value==='custom');if(e.target.value!=='custom')setPeriod(e.target.value);}}><option value="86400">Every day</option><option value="604800">Every 7 days</option><option value="2592000">Every 30 days</option><option value="7776000">Every 90 days</option><option value="custom">Custom period below</option></select></label>
      <details className="inline-details" open={customPeriod} onToggle={e=>setCustomPeriod(e.currentTarget.open)}><summary>Set an exact period</summary><Field label="Period in seconds" type="number" min="86400" max="31536000" step="1" value={period} onChange={e=>setPeriod(e.target.value)} hint="1–365 days · 86,400 seconds per day" required/></details>
      <Field label="Initial deposit (test ETH)" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required hint="Start with 0, or deposit test ETH now. You can add more before the switch lapses."/>
      <button className="primary full" type="submit">Create switch <span aria-hidden="true">↗</span></button>
    </Form>
    {!h.ready && <p className="hint">{!h.account?'Connect your wallet to create a switch.':!h.onNetwork?'Switch networks to continue.':h.busy?'Wait for the current transaction.':'Waiting for verified live state.'}</p>}
  </section>;
}
function SwitchCard({info,h}:{info:SwitchInfo;h:Heartbeat}) {
  const [action,setAction] = useState('deposit');
  const [amount,setAmount] = useState('');
  const [beneficiary,setBeneficiary] = useState(info.beneficiary as string);
  const [period,setPeriod] = useState(info.period.toString());
  const [recipient,setRecipient] = useState(h.account ?? '');
  const state = eligibility(info,h.account!,h.now,h.recovery);
  const isDepositor=same(info.depositor,h.account);
  const lapse = info.lastPing + info.period;
  const left = info.timeLeft > h.now-h.chainTime ? info.timeLeft-(h.now-h.chainTime) : 0n;
  const stateLabel = info.closed?'Closed':state.lapsed?'Lapsed':'Active';
  const date = (seconds:bigint)=>new Date(Number(seconds)*1000).toLocaleString();
  return <article className="switch-card" aria-label={`Switch ${info.id}`}>
    <div className="row"><div className="row compact"><h3>Switch #{info.id.toString()}</h3><span className={`badge ${stateLabel.toLowerCase()}`}>{stateLabel}</span></div><span className="muted small">{isDepositor?'You deposited':'You are the beneficiary'}</span></div>
    <div className="switch-values"><div><div className="eyebrow">Test ETH held</div><div className="balance"><Amount value={info.balance}/></div></div><div><div className="eyebrow">{info.closed?'Switch settled':'Next check-in'}</div><strong className="countdown">{info.closed?'Complete':timeLabel(left)}</strong></div></div>
    <div className="small muted">Period: {formatUnits(info.period,0)} seconds ({Number(info.period)/Number(DAY)} days)</div>
    <details className="inline-details"><summary>View addresses and timing</summary><dl className="facts"><dt>Depositor</dt><dd><External href={`${h.config!.deployment.network.explorer}/address/${info.depositor}`}>{info.depositor}</External></dd><dt>Beneficiary</dt><dd><External href={`${h.config!.deployment.network.explorer}/address/${info.beneficiary}`}>{info.beneficiary}</External></dd><dt>Last check-in</dt><dd>{date(info.lastPing)}</dd><dt>Lapse</dt><dd>{date(lapse)}</dd><dt>Depositor recovery</dt><dd>{date(lapse+h.recovery)}</dd></dl></details>
    {!info.closed && <div className="switch-actions">
      {isDepositor && <><button disabled={!h.ready || !state.active} onClick={()=>void h.transact(`Check in switch #${info.id}`,{...h.config!.app,functionName:'ping',args:[info.id]}).catch(()=>{})}><Pulse/> Check in</button>
      <details><summary>Manage switch</summary>
        <p className="hint">Deposits, withdrawals and changes restart the full check-in period. Available to you only before lapse.</p>
        <Form disabled={!h.ready || !state.active} onSubmit={async()=>{
          let args:readonly unknown[]=[info.id];let value:bigint|undefined;
          if(action==='deposit') {value=amountInput(amount,18);if(value>h.balance)throw Error('Insufficient test ETH in your wallet. Leave some ETH for gas.');}
          if(action==='withdraw'){const quantity=amountInput(amount,18);if(quantity>info.balance)throw Error('Withdrawal exceeds the test ETH held in this switch.');args=[info.id,quantity];}
          if(action==='setBeneficiary')args=[info.id,addressInput(beneficiary,info.depositor)];
          if(action==='setPeriod')args=[info.id,periodInput(period)];
          await h.transact({deposit:'Deposit test ETH',withdraw:'Withdraw test ETH',setBeneficiary:'Change beneficiary',setPeriod:'Change period'}[action]!,{...h.config!.app,functionName:action,args,value});
        }}>
          <label className="field"><span>Action</span><select value={action} onChange={e=>{setAction(e.target.value);setAmount('');}}><option value="deposit">Deposit test ETH</option><option value="withdraw">Withdraw test ETH</option><option value="setBeneficiary">Change beneficiary</option><option value="setPeriod">Change period</option></select></label>
          {(action==='deposit'||action==='withdraw')&&<Field label="Amount (test ETH)" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)}/>}
          {action==='setBeneficiary'&&<Field label="New beneficiary address" required value={beneficiary} onChange={e=>setBeneficiary(e.target.value)} spellCheck={false}/>}
          {action==='setPeriod'&&<Field label="New period in seconds" type="number" min="86400" max="31536000" step="1" required value={period} onChange={e=>setPeriod(e.target.value)}/>}
          <button type="submit">{{deposit:'Deposit test ETH',withdraw:'Withdraw test ETH',setBeneficiary:'Change beneficiary',setPeriod:'Change period'}[action]}</button>
        </Form>
      </details></>}
      {(state.lapsed || !isDepositor) && <Form disabled={!h.ready || !(state.claim || state.reclaim)} onSubmit={async()=>{
        await h.transact(state.claim?'Claim and close switch':'Reclaim and close switch',{...h.config!.app,functionName:state.claim?'claim':'reclaim',args:[info.id,addressInput(recipient)]});
      }}>
        <p className="hint">{state.claim?'Claiming sends the entire balance to the recipient and permanently closes this switch.':state.reclaim?'Reclaiming sends the entire balance to the recipient and permanently closes this switch. The beneficiary can still claim first.':isDepositor?'Reclaim becomes available 365 days after lapse. The beneficiary can still claim first.':'You can claim the full balance once the switch lapses.'}</p>
        <Field label="Recipient address" required value={recipient} onChange={e=>setRecipient(e.target.value as `0x${string}`)} spellCheck={false}/>
        <button type="submit">{isDepositor?'Reclaim and close':'Claim and close'}</button>
      </Form>}
    </div>}
  </article>;
}
export function Switches({h}:{h:Heartbeat}) {
  const [filter,setFilter] = useState('all');
  const filtered = h.items.filter(s=>filter==='all'||(filter==='depositor'?same(s.depositor,h.account):same(s.beneficiary,h.account)));
  return <section className="switches" aria-labelledby="switches-title">
    <div className="section-head"><div><div className="eyebrow">Your activity</div><h2 id="switches-title">Your switches {h.account&&<span className="count">{h.items.length}</span>}</h2></div><button className="subtle" disabled={!h.account||!h.onNetwork||h.loading||h.busy||!h.verified} onClick={h.refresh}>{h.loading?'Refreshing…':'Refresh'}</button></div>
    {h.account&&<div className="filter-row"><label>Show <select aria-label="Filter switches" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All your switches</option><option value="depositor">As depositor</option><option value="beneficiary">As beneficiary</option></select></label><span className="small muted">{h.count.toString()} created on chain</span></div>}
    {h.readError&&<p role="alert" className="error">{h.readError} Use Refresh to retry. Actions remain disabled.</p>}
    {!h.account?<div className="empty"><div className="signal-disc"><Pulse large/></div><h3>Your next check-in starts here.</h3><p>Connect your wallet to see the switches you created and the ones where you’re a beneficiary.</p><span className="empty-foot">On-chain state. No account to create.</span></div>:!h.onNetwork?<div className="empty"><h3>Your wallet is on another network.</h3><p>Switch to {h.config?.deployment.network.name} using the control above to load your switches.</p></div>:h.loading&&h.items.length===0?<div className="empty" aria-busy="true"><Pulse large/><h3>Finding your switches…</h3><p>{h.progress}</p></div>:!h.readError&&filtered.length===0?<div className="empty"><Pulse large/><h3>{h.items.length?'No switches in this view.':'Ready for your first switch.'}</h3><p>{h.items.length?'Choose “All your switches” to reset the filter.':'Create a switch with a beneficiary and a check-in period. Your wallet will ask you to confirm.'}</p></div>:filtered.map(info=><SwitchCard key={`${h.account}-${info.id}`} info={info} h={h}/>)}
    {h.account&&h.onNetwork&&<p className="hint" role="status">{h.progress}{h.sampledAt?' · Refreshes every 20 seconds.':''} Timers are estimates; the block timestamp decides eligibility.</p>}
  </section>;
}
