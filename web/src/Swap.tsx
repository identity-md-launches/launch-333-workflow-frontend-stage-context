import { useEffect, useState } from 'react';
import { formatUnits, zeroAddress } from 'viem';
import { permitAbi, quoterAbi, routerAbi } from './config.ts';
import type { Heartbeat } from './useHeartbeat.ts';
import { amountInput, poolKey, same, slippageBps, swapEncoding } from './logic.ts';
import { Amount, Field, Form } from './components.tsx';

type Quote = {amount:bigint;output:bigint;minimum:bigint;at:number;blockTime:bigint};
export function Swap({h}:{h:Heartbeat}) {
  const [buy,setBuy] = useState(true);
  const [amount,setAmount] = useState('0.001');
  const [slippage,setSlippage] = useState('0.50');
  const [quote,setQuote] = useState<Quote>();
  const [quoting,setQuoting] = useState(false);
  const [allowances,setAllowances] = useState<[bigint,bigint,number]>();
  const [allowanceError,setAllowanceError] = useState('');
  const [allowanceKey,setAllowanceKey] = useState(0);
  const c = h.config!;
  const uni = c.deployment.network.uniswapV4;
  const supported = !!uni && same(c.deployment.pool.pairedCurrency,zeroAddress);
  const inputDecimals = buy?c.deployment.network.nativeCurrency.decimals:h.decimals;
  const outputDecimals = buy?h.decimals:c.deployment.network.nativeCurrency.decimals;
  const unitIn = buy?'ETH':'BEAT', unitOut = buy?'BEAT':'ETH';
  const valid = !!quote && Date.now()-quote.at < 60_000;
  useEffect(()=>{
    let active=true;
    setAllowances(undefined);setAllowanceError('');
    if(!h.account||!h.ready||buy||!uni)return;
    Promise.all([
      c.client.readContract({...c.token,functionName:'allowance',args:[h.account,uni.permit2]}),
      c.client.readContract({address:uni.permit2,abi:permitAbi,functionName:'allowance',args:[h.account,c.token.address,uni.universalRouter]}),
    ]).then(([token,permit])=>{if(active)setAllowances([token as bigint,permit[0],permit[1]]);}).catch(()=>{if(active)setAllowanceError('Unable to read approvals. Refresh live state and retry.');});
    return ()=>{active=false;};
  },[c,h.account,h.ready,buy,uni,h.sampledAt,allowanceKey]);
  const tokenApproved = !!quote && !!allowances && allowances[0]>=quote.amount;
  const routerApproved = !!quote && !!allowances && allowances[1]>=quote.amount && BigInt(allowances[2]) > h.now+60n;
  const edit = (fn:()=>void)=>{setQuote(undefined);fn();};
  return <section className="card swap-card" aria-labelledby="swap-title"><div className="row"><div><div className="eyebrow">The launch token</div><h2 id="swap-title">A little BEAT.</h2></div><span className="token-disc" aria-hidden="true">B</span></div>
    <p className="muted">Swap on the Sepolia Uniswap v4 pool. BEAT is separate from your switches; switches hold only test ETH.</p>
    {!supported&&<p className="error">A vetted native ETH pool is unavailable. Swaps are disabled.</p>}
    <Form disabled={!h.ready||!supported||quoting} onSubmit={async()=>{
      setQuote(undefined);setQuoting(true);
      try {
        const quantity=amountInput(amount,inputDecimals);const bps=slippageBps(slippage);
        if(quantity>=2n**128n)throw Error('This amount exceeds the pool’s uint128 limit.');
        if(quantity>(buy?h.balance:h.tokenBalance))throw Error(`Insufficient ${unitIn} balance. ${buy?'Leave test ETH for gas.':''}`);
        for(const address of [uni.quoter,uni.universalRouter,uni.permit2]) {
          const code=await c.client.getCode({address});if(!code||code==='0x')throw Error('A configured swap contract has no code. Swaps are disabled.');
        }
        const key=poolKey(c);
        const block=await c.client.getBlock();
        const result=await c.client.simulateContract({address:uni.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:key,zeroForOne:same(buy?c.deployment.pool.pairedCurrency:c.token.address,key.currency0),exactAmount:quantity,hookData:'0x'}],account:h.account});
        const output=result.result[0];const minimum=output*(10_000n-bps)/10_000n;
        if(minimum<=0n||minimum>=2n**128n)throw Error('No usable quote. Try another amount; pool liquidity may be unavailable.');
        setQuote({amount:quantity,output,minimum,at:Date.now(),blockTime:block.timestamp});
      }finally{setQuoting(false);}
    }}>
      <div className="two-fields"><label className="field"><span>Direction</span><select value={buy?'buy':'sell'} onChange={e=>edit(()=>setBuy(e.target.value==='buy'))}><option value="buy">ETH → BEAT</option><option value="sell">BEAT → ETH</option></select></label><Field label="Slippage (%)" inputMode="decimal" value={slippage} onChange={e=>edit(()=>setSlippage(e.target.value))} required/></div>
      <Field label={`You pay (${unitIn})`} inputMode="decimal" value={amount} onChange={e=>edit(()=>setAmount(e.target.value))} required/>
      <div className="row"><span className="hint">Balance: {h.sampledAt?<Amount value={buy?h.balance:h.tokenBalance} decimals={inputDecimals} unit={unitIn}/>:'Connect and refresh to view'}</span><button type="submit">{quoting?'Getting quote…':'Get quote'}</button></div>
    </Form>
    {!h.account&&<p className="hint">Connect your wallet to quote and swap.</p>}
    {allowanceError&&<p className="error" role="alert">{allowanceError}</p>}
    {quote&&<div className="quote"><dl className="facts"><dt>Estimated receive</dt><dd><Amount value={quote.output} decimals={outputDecimals} unit={unitOut}/></dd><dt>Minimum receive</dt><dd>{formatUnits(quote.minimum,outputDecimals)} {unitOut}</dd><dt>Exchange rate</dt><dd>1 {unitIn} ≈ {Number(formatUnits(quote.output,outputDecimals))/Number(formatUnits(quote.amount,inputDecimals))} {unitOut}</dd><dt>Quote expires</dt><dd>{valid?'60 seconds after quoting':'Expired · get a new quote'}</dd></dl>
      {!buy&&<div className="approval-steps"><p className="hint">Two approvals allow the router to spend exactly {formatUnits(quote.amount,h.decimals)} BEAT. The router allowance expires after 20 minutes.</p>
        <button disabled={!h.ready||!valid||!allowances||tokenApproved} onClick={()=>void h.transact('Approve BEAT for Permit2',{...c.token,functionName:'approve',args:[uni.permit2,quote.amount]}).then(()=>setAllowanceKey(k=>k+1)).catch(()=>{})}>1. {tokenApproved?'BEAT approved':'Approve BEAT for Permit2'}</button>
        <button disabled={!h.ready||!valid||!tokenApproved||routerApproved} onClick={()=>void h.transact('Approve router allowance',{address:uni.permit2,abi:permitAbi,functionName:'approve',args:[c.token.address,uni.universalRouter,quote.amount,Number(h.now+1200n)]}).then(()=>setAllowanceKey(k=>k+1)).catch(()=>{})}>2. {routerApproved?'Router approved':'Approve router allowance'}</button>
      </div>}
      <Form disabled={!h.ready||!valid||(!buy&&(!tokenApproved||!routerApproved))} onSubmit={async()=>{
        if(Date.now()-quote.at>=60_000)throw Error('Quote expired. Get a new quote before swapping.');
        const encoded=swapEncoding(c,buy,quote.amount,quote.minimum,quote.blockTime+1200n);
        await h.transact(`Swap ${unitIn} for ${unitOut}`,{address:uni.universalRouter,abi:routerAbi,functionName:'execute',args:[encoded.commands,encoded.inputs,encoded.deadline],value:encoded.value});
        setQuote(undefined);
      }}><p className="hint">Swap {formatUnits(quote.amount,inputDecimals)} {unitIn} for at least {formatUnits(quote.minimum,outputDecimals)} {unitOut}. {buy?'Native ETH needs no approval. ':''}Gas is extra. The router call is simulated before your wallet opens.</p><button type="submit" className="full">Swap {unitIn} for {unitOut}</button></Form>
    </div>}
  </section>;
}
