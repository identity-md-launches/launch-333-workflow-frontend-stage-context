import { readFile } from 'node:fs/promises';
import { decodeFunctionData, encodeFunctionResult, encodeEventTopics, encodeAbiParameters, encodeErrorResult, getAbiItem, parseAbi, toHex, zeroAddress } from 'viem';
export const A='0x1111111111111111111111111111111111111111',B='0x2222222222222222222222222222222222222222',C='0x3333333333333333333333333333333333333333';
export const deployment=JSON.parse(await readFile(new URL('../../dist/imd-deployment.json',import.meta.url)));
const abi = Object.fromEntries(await Promise.all(deployment.contracts.map(async c=>[c.name,JSON.parse(await readFile(new URL(`../../dist/${c.abiPath}`,import.meta.url)))])));
const app=deployment.contracts.find(c=>c.name==='DeadMansSwitch');
const token=deployment.contracts.find(c=>c.name==='LaunchToken');
const uni=deployment.network.uniswapV4;
const quoteAbi=parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)']);
const routerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
const permitAbi=parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)','function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)']);
const blockHash='0x'+'ab'.repeat(32);
const day=86400n;
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
export class MockChain {
  now=1900000000n;
  block=BigInt(deployment.deploymentBlocks.DeadMansSwitch)+100n;
  account=A; chain='0x1'; known=false; reject=false; revert=false; failReads=false; missingCode=false; rangeLimit=5000n;
  rpcCalls=[];walletCalls=[];sends=[];receipts=new Map();logs=[];tokenAllowance=0n;routerAllowance=0n;expiration=0;switches=new Map();
  constructor(){
    this.switches.set(1n,{depositor:A,beneficiary:B,balance:10n**18n+1n,period:day,lastPing:this.now-3600n,closed:false});
    this.switches.set(2n,{depositor:B,beneficiary:A,balance:3n*10n**17n,period:day,lastPing:this.now-day-1n,closed:false});
    this.switches.set(3n,{depositor:A,beneficiary:B,balance:4n*10n**17n,period:day,lastPing:this.now-367n*day,closed:false});
    this.switches.set(4n,{depositor:A,beneficiary:B,balance:0n,period:day,lastPing:this.now-2n*day,closed:true});
    this.switches.set(5n,{depositor:B,beneficiary:C,balance:0n,period:day,lastPing:this.now-300n,closed:false});
    this.switches.set(6n,{depositor:B,beneficiary:A,balance:0n,period:day,lastPing:this.now-300n,closed:false});
    for(const [id,s] of this.switches){this.event('Created',{id,...s,beneficiary:id===5n?A:id===6n?C:s.beneficiary});}
    this.event('BeneficiaryChanged',{id:5n,depositor:B,newBeneficiary:C});
    this.event('BeneficiaryChanged',{id:6n,depositor:B,newBeneficiary:A});
  }
  event(name,values){
    const item=getAbiItem({abi:abi.DeadMansSwitch,name});
    const non=item.inputs.filter(x=>!x.indexed);
    this.logs.push({address:app.address,topics:encodeEventTopics({abi:abi.DeadMansSwitch,eventName:name,args:values}),data:encodeAbiParameters(non,non.map(x=>values[x.name])),blockNumber:toHex(this.block),blockHash,transactionHash:'0x'+'cd'.repeat(32),transactionIndex:'0x0',logIndex:toHex(this.logs.length),removed:false});
  }
  decode(tx){
    const contractAbi=same(tx.to,app.address)?abi.DeadMansSwitch:same(tx.to,token.address)?abi.LaunchToken:same(tx.to,uni.permit2)?permitAbi:same(tx.to,uni.quoter)?quoteAbi:same(tx.to,uni.universalRouter)?routerAbi:undefined;
    if(!contractAbi)throw Error(`Unexpected contract destination ${tx.to}`);
    return {...decodeFunctionData({abi:contractAbi,data:tx.data}),abi:contractAbi};
  }
  result(tx){
    const {functionName:fn,args=[],abi:contractAbi}=this.decode(tx);
    const s=this.switches.get(args[0]);let result;
    if(this.revert&&['ping','execute'].includes(fn))return {error:{code:3,message:'execution reverted: AlreadyLapsed',data:same(tx.to,app.address)?encodeErrorResult({abi:abi.DeadMansSwitch,errorName:'AlreadyLapsed'}):'0x'}};
    const values={switchCount:BigInt(this.switches.size),RECOVERY_DELAY:365n*day,MIN_PERIOD:day,MAX_PERIOD:365n*day,totalSupply:10n**27n,decimals:18,name:'Heartbeat',symbol:'BEAT',balanceOf:1000n*10n**18n};
    if(fn in values)result=values[fn];
    else if(fn==='switchInfo')result=[s.depositor,s.beneficiary,s.balance,s.period,s.lastPing,s.closed];
    else if(fn==='timeLeft')result=s.lastPing+s.period>this.now?s.lastPing+s.period-this.now:0n;
    else if(fn==='allowance')result=same(tx.to,token.address)?this.tokenAllowance:[this.routerAllowance,this.expiration,0];
    else if(fn==='quoteExactInputSingle')result=[args[0].zeroForOne?200n*10n**18n:10n**15n,100000n];
    else if(fn==='create')result=BigInt(this.switches.size+1);
    else if(['transfer','transferFrom','approve'].includes(fn)&&same(tx.to,token.address))result=true;
    return {result:encodeFunctionResult({abi:contractAbi,functionName:fn,result})};
  }
  async wallet({method,params=[]}){
    this.walletCalls.push({method,params});
    if(method==='eth_requestAccounts') {if(this.reject)throw {code:4001,message:'User rejected request'};return [this.account];}
    if(method==='eth_accounts')return [this.account];
    if(method==='eth_chainId')return this.chain;
    if(method==='wallet_switchEthereumChain') {if(!this.known)throw {code:4902,message:'Unknown chain'};this.chain=params[0].chainId;return null;}
    if(method==='wallet_addEthereumChain'){this.known=true;return null;}
    if(method==='eth_sendTransaction'){
      if(this.reject)throw {code:4001,message:'User rejected request'};
      const tx=params[0];const decoded=this.decode(tx);
      this.sends.push({tx,...decoded});this.mutate(tx,decoded);
      const hash='0x'+this.sends.length.toString(16).padStart(64,'0');
      this.receipts.set(hash,{transactionHash:hash,transactionIndex:'0x0',blockHash,blockNumber:toHex(this.block),from:this.account,to:tx.to,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x1',contractAddress:null,logs:[],logsBloom:'0x'+'00'.repeat(256),status:'0x1',type:'0x2'});
      return hash;
    }
    throw Error(`Unmocked wallet method ${method}`);
  }
  mutate(tx,{functionName:fn,args=[]}){
    const s=this.switches.get(args[0]);
    if(fn==='create'){
      const id=BigInt(this.switches.size+1);const state={depositor:this.account,beneficiary:args[0],balance:BigInt(tx.value??0),period:args[1],lastPing:this.now,closed:false};this.switches.set(id,state);this.event('Created',{id,...state});
    }else if(s&&same(tx.to,app.address)){
      if(fn==='deposit')s.balance+=BigInt(tx.value);
      if(fn==='withdraw')s.balance-=args[1];
      if(fn==='setBeneficiary'){s.beneficiary=args[1];this.event('BeneficiaryChanged',{id:args[0],depositor:s.depositor,newBeneficiary:args[1]});}
      if(fn==='setPeriod')s.period=args[1];
      if(['claim','reclaim'].includes(fn)){s.closed=true;s.balance=0n;}else s.lastPing=this.now;
    }else if(fn==='approve'&&same(tx.to,token.address))this.tokenAllowance=args[1];
    else if(fn==='approve'&&same(tx.to,uni.permit2)){this.routerAllowance=args[2];this.expiration=args[3];}
  }
  async rpc(body){
    if(Array.isArray(body))return Promise.all(body.map(b=>this.rpc(b)));
    const {method,params=[],id}=body;this.rpcCalls.push(body);
    const response={jsonrpc:'2.0',id};
    if(this.failReads)return {...response,error:{code:-32000,message:'Mock RPC unavailable'}};
    let result;
    switch(method){
      case 'eth_chainId':result=toHex(deployment.chainId);break;
      case 'eth_getCode':result=this.missingCode?'0x':'0x60006000';break;
      case 'eth_blockNumber':result=toHex(this.block);break;
      case 'eth_getBlockByNumber':result={number:toHex(this.block),hash:blockHash,parentHash:blockHash,timestamp:toHex(this.now),gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0x1',difficulty:'0x0',extraData:'0x',miner:zeroAddress,nonce:'0x0000000000000000',transactions:[],uncles:[],size:'0x1',logsBloom:'0x'+'00'.repeat(256),receiptsRoot:blockHash,stateRoot:blockHash,transactionsRoot:blockHash,sha3Uncles:blockHash};break;
      case 'eth_getBalance':result=toHex(10n*10n**18n);break;
      case 'eth_call':return {...response,...this.result(params[0])};
      case 'eth_getLogs':{
        const filter=params[0];
        if(BigInt(filter.toBlock)-BigInt(filter.fromBlock)+1n>this.rangeLimit)return {...response,error:{code:-32005,message:'block range too large'}};
        result=this.logs.filter(l=>BigInt(l.blockNumber)>=BigInt(filter.fromBlock)&&BigInt(l.blockNumber)<=BigInt(filter.toBlock)&&filter.topics.every((t,i)=>t===null||t===undefined||(Array.isArray(t)?t.includes(l.topics[i]):same(t,l.topics[i]))));break;
      }
      case 'eth_getTransactionReceipt':result=this.receipts.get(params[0])??null;break;
      case 'eth_getTransactionByHash':result={hash:params[0],from:this.account,to:app.address,blockHash,blockNumber:toHex(this.block),transactionIndex:'0x0',value:'0x0',gas:'0x5208',gasPrice:'0x1',nonce:'0x0',input:'0x',v:'0x1',r:toHex(1n,{size:32}),s:toHex(1n,{size:32}),type:'0x0'};break;
      default:throw Error(`Unmocked RPC method ${method}`);
    }
    return {...response,result};
  }
}
export async function attachMock(page,chain,{wallet=true}={}){
  for(const url of deployment.network.rpcUrls)await page.route(url,async route=>{
    try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await chain.rpc(route.request().postDataJSON()))});}
    catch(e){console.error(e);await route.fulfill({status:500,body:String(e)});}
  });
  if(wallet){
    await page.exposeFunction('__mockWallet',async request=>{
      try{return {result:await chain.wallet(request)};}catch(error){return {error:{code:error.code??-1,message:error.message??String(error)}};}
    });
    await page.addInitScript(()=>{
      const listeners={};
      window.ethereum={request:async request=>{const response=await window.__mockWallet(request);if(response.error)throw response.error;return response.result;},on:(event,fn)=>(listeners[event]??=[]).push(fn),removeListener:(event,fn)=>{listeners[event]=(listeners[event]??[]).filter(x=>x!==fn);}};
      window.__walletEvent=(name,value)=>(listeners[name]??[]).forEach(fn=>fn(value));
    });
  }
}
