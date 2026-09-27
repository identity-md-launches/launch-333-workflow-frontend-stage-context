import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, zeroAddress } from 'viem';
import { amountInput, addressInput, DAY, eligibility, periodInput, slippageBps, swapEncoding, poolKey } from '../src/logic.ts';
import { canonical, type Config, type Provider } from '../src/config.ts';
import { switchNetwork } from '../src/chain.ts';
const depositor='0x1111111111111111111111111111111111111111';
const beneficiary='0x2222222222222222222222222222222222222222';
const base={id:1n,depositor,beneficiary,balance:1n,period:DAY,lastPing:1n,closed:false,timeLeft:DAY} as const;
test('depositor loses authority at exact lapse; beneficiary becomes eligible',()=>{
  assert.equal(eligibility(base,depositor,DAY,365n*DAY).active,true);
  assert.equal(eligibility(base,depositor,DAY+1n,365n*DAY).active,false);
  assert.equal(eligibility(base,beneficiary,DAY,365n*DAY).claim,false);
  assert.equal(eligibility(base,beneficiary,DAY+1n,365n*DAY).claim,true);
});
test('recovery boundary, beneficiary race, unrelated account, closed state',()=>{
  assert.equal(eligibility(base,depositor,366n*DAY,365n*DAY).reclaim,false);
  assert.equal(eligibility(base,depositor,366n*DAY+1n,365n*DAY).reclaim,true);
  assert.equal(eligibility(base,beneficiary,366n*DAY+1n,365n*DAY).claim,true);
  assert.equal(eligibility(base,zeroAddress,1n,365n*DAY).active,false);
  const closed=eligibility({...base,closed:true},depositor,500n*DAY,365n*DAY);
  assert.equal(closed.active||closed.reclaim||closed.claim,false);
});
test('exact decimal amounts, zero creation, period and address boundaries',()=>{
  assert.equal(amountInput('0',18,true),0n);assert.equal(amountInput('1.000000000000000001',18),1000000000000000001n);
  for(const input of ['1e5','-1','0.0000000000000000001','NaN',''])assert.throws(()=>amountInput(input,18));
  assert.throws(()=>amountInput('0',18));assert.equal(periodInput('86400'),DAY);assert.equal(periodInput('31536000'),365n*DAY);
  for(const input of ['86399','31536001','1.5'])assert.throws(()=>periodInput(input));
  assert.throws(()=>addressInput(zeroAddress));assert.throws(()=>addressInput(depositor,depositor));assert.equal(addressInput(beneficiary,depositor),beneficiary);
});
test('slippage is exact basis points with bounded values',()=>{
  assert.equal(slippageBps('0.50'),50n);assert.equal(slippageBps('0.01'),1n);assert.equal(slippageBps('5'),500n);
  for(const input of ['0','5.01','0.001','-1','Infinity'])assert.throws(()=>slippageBps(input));
});
const config={token:{address:beneficiary},deployment:{pool:{pairedCurrency:zeroAddress,fee:3000,tickSpacing:60},walletAddChain:{chainId:'0xaa36a7',chainName:'Sepolia',rpcUrls:['https://example.invalid'],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},blockExplorerUrls:[]}}} as unknown as Config;
test('v4 router encoding uses exact amounts, settlement currencies, deadline and native value',()=>{
  for(const buy of [true,false]) {
    const x=swapEncoding(config,buy,100n,90n,999n);
    assert.equal(x.commands,'0x10');assert.equal(x.value,buy?100n:0n);assert.equal(x.deadline,999n);
    const [actions,params]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'}],x.inputs[0]);
    assert.equal(actions,'0x060c0f');assert.equal(params.length,3);
    assert.deepEqual(decodeAbiParameters([{type:'address'},{type:'uint256'}],params[1]),[buy?zeroAddress:beneficiary,100n]);
    assert.deepEqual(decodeAbiParameters([{type:'address'},{type:'uint256'}],params[2]),[buy?beneficiary:zeroAddress,90n]);
    const decoded=decodeAbiParameters([{type:'tuple',components:[{type:'tuple',components:[{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}]},{type:'bool'},{type:'uint128'},{type:'uint128'},{type:'bytes'}]}],params[0])[0];
    assert.equal(decoded[1],buy);assert.equal(decoded[2],100n);assert.equal(decoded[3],90n);assert.equal(decoded[4],'0x');
  }
  assert.equal(poolKey(config).currency0,zeroAddress);
  assert.throws(()=>swapEncoding(config,true,2n**128n,1n,1n));
});
test('canonical ABI hashing sorts object keys without reordering arrays',()=>{
  assert.equal(canonical([{z:1,a:{z:3,b:2}},2]),'[{"a":{"b":2,"z":3},"z":1},2]');
});
test('unknown chain adds exact supplied configuration, then retries switching',async()=>{
  const calls:unknown[]=[];let first=true;
  const provider={request:async(request: {method:string})=>{calls.push(request);if(request.method==='wallet_switchEthereumChain'&&first){first=false;throw {code:4902};}}} as unknown as Provider;
  await switchNetwork(config,provider);
  assert.deepEqual(calls,[{method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]},{method:'wallet_addEthereumChain',params:[config.deployment.walletAddChain]},{method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]}]);
});
test('wallet rejection never triggers chain addition',async()=>{
  let calls=0;
  const provider={request:async()=>{calls++;throw {code:4001};}} as unknown as Provider;
  await assert.rejects(()=>switchNetwork(config,provider));assert.equal(calls,1);
});
