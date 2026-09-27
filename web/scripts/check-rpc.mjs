import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
const manifest=JSON.parse(await readFile(new URL('../../dist/imd-deployment.json',import.meta.url)));
const results=[];
for(const url of manifest.network.rpcUrls){
  const item={url};
  const client=createPublicClient({transport:http(url,{timeout:10000,retryCount:0})});
  try {
    item.chainId=await client.getChainId();
    if(item.chainId!==manifest.chainId)throw Error('Chain ID mismatch');
    const block=await client.getBlock();item.blockNumber=String(block.number);item.blockTimestamp=String(block.timestamp);
    item.contracts=[];
    for(const c of manifest.contracts){
      const code=await client.getCode({address:c.address});
      if(!code||code==='0x')throw Error(`Missing code for ${c.name}`);
      const abi=JSON.parse(await readFile(new URL(`../../dist/${c.abiPath}`,import.meta.url)));
      const value=await client.readContract({address:c.address,abi,functionName:c.name==='LaunchToken'?'totalSupply':'switchCount'});
      item.contracts.push({name:c.name,codeBytes:(code.length-2)/2,read:String(value)});
    }
    item.status='passed';
  }catch(e){item.status='unavailable';item.error=e.shortMessage||e.message;}
  results.push(item);console.log(JSON.stringify(item));
}
const output={recordedAt:new Date().toISOString(),type:'read-only public RPC checks; no transactions broadcast',results};
await writeFile(new URL('../../docs/evidence/rpc.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
