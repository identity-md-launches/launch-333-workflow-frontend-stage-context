import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodeAbiParameters } from 'viem';
import { serve } from './serve.mjs';
import { MockChain, attachMock, deployment, A, B, C } from './mock-chain.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../node_modules/.cache/ms-playwright',import.meta.url));
const { chromium } = await import('playwright');
const { default: AxeBuilder } = await import('@axe-core/playwright');
const {server,url}=await serve();
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const evidence=new URL('../../docs/evidence/',import.meta.url);
await mkdir(evidence,{recursive:true});
const checks=[];const errors=[];let page;
async function check(name,fn){await fn();checks.push(name);console.log(`PASS ${name}`);}
async function open(chain=new MockChain(),options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const p=await context.newPage();
  p.setDefaultTimeout(12_000);
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await attachMock(p,chain,options);
  await p.goto(url);await p.getByText('Deployment verified · ABI hashes, chain and contract code',{exact:true}).waitFor();
  return p;
}
async function connect(p){await p.getByRole('button',{name:'Connect wallet'}).click();await p.getByRole('button',{name:'Switch to Sepolia'}).click();await p.getByRole('article',{name:'Switch 1',exact:true}).waitFor();await p.getByRole('button',{name:'Create switch',exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('.create-card button[type=submit]').matches(':disabled'));}
async function confirmed(p,name){await p.getByRole('status').filter({hasText:`${name} confirmed.`}).waitFor();await p.waitForFunction(()=>!document.querySelector('.create-card button[type=submit]').matches(':disabled'));}
try{
  await check('disconnected export loads from gateway subpath, keyboard focus and no-wallet guidance',async()=>{
    page=await open(new MockChain(),{wallet:false});
    assert.equal(await page.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to content');
    await page.keyboard.press('Enter');await page.keyboard.press('Tab');
    await page.screenshot({path:fileURLToPath(new URL('desktop-disconnected.png',evidence)),fullPage:true});
    await page.getByRole('button',{name:'Connect wallet'}).click();await page.getByRole('alert').filter({hasText:'No browser wallet found'}).waitFor();
  });
  const chain=new MockChain();
  await check('wallet rejection, wrong-chain gating and exact add-chain fallback',async()=>{
    page=await open(chain);chain.reject=true;
    await page.getByRole('button',{name:'Connect wallet'}).click();await page.getByRole('alert').filter({hasText:'Request declined'}).waitFor();
    chain.reject=false;await page.getByRole('button',{name:'Connect wallet'}).click();
    assert.equal(await page.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Switch to Sepolia'}).click();
    await page.getByRole('article',{name:'Switch 1',exact:true}).waitFor();
    assert.deepEqual(chain.walletCalls.find(x=>x.method==='wallet_addEthereumChain').params,[deployment.walletAddChain]);
  });
  await check('Created and BeneficiaryChanged discovery filters obsolete beneficiaries and reads roles',async()=>{
    assert.equal(await page.getByRole('article').count(),5);
    await page.getByText('1.000000000000000001',{exact:false}).waitFor();
    assert.equal(await page.getByRole('article',{name:'Switch 5',exact:true}).count(),0);
    assert.equal(await page.getByRole('article',{name:'Switch 6',exact:true}).count(),1);
    assert.equal(await page.getByRole('article',{name:'Switch 3',exact:true}).getByRole('button',{name:'Check in',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('article',{name:'Switch 4',exact:true}).getByRole('button').count(),0);
    await page.getByLabel('Filter switches').selectOption('beneficiary');assert.equal(await page.getByRole('article').count(),2);await page.getByLabel('Filter switches').selectOption('all');
  });
  await check('desktop accessibility scan has no WCAG A/AA violations',async()=>{
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    await writeFile(new URL('accessibility.json',evidence),JSON.stringify({violations:axe.violations,passes:axe.passes.map(x=>x.id),incomplete:axe.incomplete.map(x=>({id:x.id,description:x.description}))},null,2)+'\n');
    assert.deepEqual(axe.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[]);
  });
  await check('create validates beneficiary and submits a zero-deposit switch',async()=>{
    const create=page.locator('.create-card');
    await create.getByLabel('Beneficiary address',{exact:true}).fill(A);
    await create.getByRole('button',{name:'Create switch',exact:true}).click();
    await create.getByRole('alert').filter({hasText:'different from the depositor'}).waitFor();
    assert.equal(chain.sends.length,0);
    await create.getByLabel('Beneficiary address',{exact:true}).fill(B);
    await create.getByRole('combobox',{name:'Check-in period',exact:true}).selectOption('custom');await create.getByLabel('Period in seconds',{exact:true}).fill('86401');
    await create.getByRole('button',{name:'Create switch',exact:true}).click();await confirmed(page,'Create switch');
    assert.equal(chain.sends.at(-1).functionName,'create');assert.equal(chain.sends.at(-1).args[1],86401n);assert.equal(BigInt(chain.sends.at(-1).tx.value??0),0n);
    await page.getByRole('article',{name:'Switch 7',exact:true}).waitFor();
  });
  await check('check-in, deposit, withdrawal, beneficiary and period changes encode and refresh state',async()=>{
    const card=page.getByRole('article',{name:'Switch 1',exact:true});
    await card.getByRole('button',{name:'Check in',exact:true}).click();await confirmed(page,'Check in switch #1');
    assert.equal(chain.sends.at(-1).functionName,'ping');
    await card.getByText('Manage switch',{exact:true}).click();
    await card.getByLabel('Amount (test ETH)',{exact:true}).fill('0.1');
    await card.getByRole('button',{name:'Deposit test ETH',exact:true}).click();await confirmed(page,'Deposit test ETH');
    assert.equal(BigInt(chain.sends.at(-1).tx.value),10n**17n);
    await card.getByRole('combobox',{name:'Action',exact:true}).selectOption('withdraw');
    await card.getByLabel('Amount (test ETH)',{exact:true}).fill('9');await card.getByRole('button',{name:'Withdraw test ETH',exact:true}).click();
    await card.getByRole('alert').filter({hasText:'exceeds the test ETH'}).waitFor();
    await card.getByLabel('Amount (test ETH)',{exact:true}).fill('0.2');await card.getByRole('button',{name:'Withdraw test ETH',exact:true}).click();await confirmed(page,'Withdraw test ETH');
    assert.equal(chain.sends.at(-1).args[1],2n*10n**17n);
    await card.getByRole('combobox',{name:'Action',exact:true}).selectOption('setBeneficiary');await card.getByLabel('New beneficiary address').fill(C);await card.getByRole('button',{name:'Change beneficiary',exact:true}).click();await confirmed(page,'Change beneficiary');
    await card.getByRole('combobox',{name:'Action',exact:true}).selectOption('setPeriod');await card.getByLabel('New period in seconds').fill('172800');await card.getByRole('button',{name:'Change period',exact:true}).click();await confirmed(page,'Change period');
    assert.equal(chain.switches.get(1n).period,172800n);assert.equal(chain.switches.get(1n).beneficiary.toLowerCase(),C);
  });
  await check('claim and reclaim allow a different recipient and permanently close switches',async()=>{
    const claim=page.getByRole('article',{name:'Switch 2',exact:true});await claim.getByLabel('Recipient address',{exact:true}).fill(C);await claim.getByRole('button',{name:'Claim and close',exact:true}).click();await confirmed(page,'Claim and close switch');
    assert.equal(chain.sends.at(-1).functionName,'claim');assert.equal(chain.sends.at(-1).args[1].toLowerCase(),C);assert.equal(chain.switches.get(2n).closed,true);
    const reclaim=page.getByRole('article',{name:'Switch 3',exact:true});await reclaim.getByLabel('Recipient address',{exact:true}).fill(C);await reclaim.getByRole('button',{name:'Reclaim and close',exact:true}).click();await confirmed(page,'Reclaim and close switch');
    assert.equal(chain.sends.at(-1).functionName,'reclaim');assert.equal(chain.switches.get(3n).closed,true);
  });
  await check('simulation revert and signing rejection are visible and prevent sending',async()=>{
    const card=page.getByRole('article',{name:'Switch 1',exact:true});const before=chain.sends.length;
    chain.revert=true;await card.getByRole('button',{name:'Check in',exact:true}).click();await page.getByRole('alert').filter({hasText:'AlreadyLapsed'}).waitFor();assert.equal(chain.sends.length,before);
    chain.revert=false;chain.reject=true;await card.getByRole('button',{name:'Check in',exact:true}).click();await page.getByRole('alert').filter({hasText:'Request declined'}).waitFor();assert.equal(chain.sends.length,before);chain.reject=false;
  });
  await check('native-in swap quotes with eth_call, uses minimum output and simulates execute before signing',async()=>{
    const swap=page.locator('.swap-card');await swap.getByRole('button',{name:'Get quote'}).click();await swap.getByText('Estimated receive',{exact:true}).waitFor();
    const before=chain.sends.length;
    const q=chain.rpcCalls.filter(x=>x.method==='eth_call').map(x=>chain.decode(x.params[0])).filter(x=>x.functionName==='quoteExactInputSingle').at(-1);
    assert.equal(q.args[0].poolKey.fee,deployment.pool.fee);assert.equal(q.args[0].poolKey.currency1.toLowerCase(),deployment.contracts.find(c=>c.name==='LaunchToken').address);
    await swap.getByRole('button',{name:'Swap ETH for BEAT',exact:true}).click();await confirmed(page,'Swap ETH for BEAT');
    assert.equal(chain.sends.length,before+1);const tx=chain.sends.at(-1);assert.equal(tx.tx.to.toLowerCase(),deployment.network.uniswapV4.universalRouter);assert.equal(BigInt(tx.tx.value),10n**15n);assert.equal(tx.args[0],'0x10');
    const [actions,params]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'}],tx.args[1][0]);assert.equal(actions,'0x060c0f');assert.equal(decodeAbiParameters([{type:'address'},{type:'uint256'}],params[2])[1],199n*10n**18n);
    assert(chain.rpcCalls.some(x=>x.method==='eth_call'&&chain.decode(x.params[0]).functionName==='execute'));
  });
  await check('token-in swap requires distinct exact-amount Permit2 and router approvals',async()=>{
    const swap=page.locator('.swap-card');await swap.getByLabel('Direction').selectOption('sell');await swap.getByLabel('You pay (BEAT)').fill('1');await swap.getByRole('button',{name:'Get quote'}).click();
    await swap.getByRole('button',{name:'1. Approve BEAT for Permit2',exact:true}).click();await confirmed(page,'Approve BEAT for Permit2');
    const approval=chain.sends.at(-1);assert.equal(approval.args[0].toLowerCase(),deployment.network.uniswapV4.permit2);assert.equal(approval.args[1],10n**18n);
    await swap.getByRole('button',{name:'2. Approve router allowance',exact:true}).click();await confirmed(page,'Approve router allowance');
    assert.equal(chain.sends.at(-1).tx.to.toLowerCase(),deployment.network.uniswapV4.permit2);assert.equal(chain.sends.at(-1).args[1].toLowerCase(),deployment.network.uniswapV4.universalRouter);
    await swap.getByRole('button',{name:'Swap BEAT for ETH',exact:true}).click();await confirmed(page,'Swap BEAT for ETH');assert.equal(BigInt(chain.sends.at(-1).tx.value??0),0n);
  });
  await check('token transfer, zero allowance revocation, and transferFrom use exported ABI',async()=>{
    await page.getByText('Deployment details & token controls',{exact:true}).click();await page.getByText('Transfer BEAT or manage allowances',{exact:true}).click();
    const tools=page.locator('.token-tools');await tools.getByLabel('Recipient address',{exact:true}).fill(C);await tools.getByLabel('Amount (BEAT)').fill('1');await tools.getByRole('button',{name:'Transfer BEAT',exact:true}).click();await confirmed(page,'Transfer BEAT');assert.equal(chain.sends.at(-1).functionName,'transfer');
    await tools.getByLabel('Token action').selectOption('approve');await tools.getByLabel('Spender address').fill(C);await tools.getByLabel('Amount (BEAT)').fill('0');await tools.getByRole('button',{name:'Set BEAT allowance',exact:true}).click();await confirmed(page,'Set BEAT allowance');assert.equal(chain.sends.at(-1).args[1],0n);
    chain.tokenAllowance=10n**20n;await tools.getByLabel('Token action').selectOption('transferFrom');await tools.getByLabel('Source wallet address').fill(B);await tools.getByLabel('Recipient address',{exact:true}).fill(C);await tools.getByLabel('Amount (BEAT)').fill('1');await tools.getByRole('button',{name:'Transfer BEAT',exact:true}).click();await confirmed(page,'Transfer BEAT');assert.equal(chain.sends.at(-1).functionName,'transferFrom');
    await page.getByText('Deployment details & token controls',{exact:true}).click();
  });
  await check('responsive production page has no overflow at 1440, 768, 390 and 320 CSS pixels',async()=>{
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);}
    await page.screenshot({path:fileURLToPath(new URL('mobile-connected.png',evidence)),fullPage:true});
    await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:fileURLToPath(new URL('desktop-connected.png',evidence)),fullPage:true});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Text enlargement overflow');await page.evaluate(()=>document.documentElement.style.fontSize='');
    const computed=await page.evaluate(()=>({body:getComputedStyle(document.body).color,background:getComputedStyle(document.documentElement).backgroundColor,muted:getComputedStyle(document.querySelector('.intro')).color,surface:getComputedStyle(document.querySelector('.card')).backgroundColor,button:getComputedStyle(document.querySelector('button.primary:not(:disabled)')).backgroundColor,onButton:getComputedStyle(document.querySelector('button.primary:not(:disabled)')).color}));
    function contrast(a,b){const l=c=>c.match(/\d+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);return (Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);}
    const pairs=[['body / page',computed.body,computed.background],['muted / page',computed.muted,computed.background],['muted / surface',computed.muted,computed.surface],['button label / accent',computed.onButton,computed.button]].map(([name,a,b])=>({name,foreground:a,background:b,ratio:contrast(a,b)}));
    for(const pair of pairs)assert(pair.ratio>=4.5,pair.name);
    await writeFile(new URL('contrast.json',evidence),JSON.stringify(pairs,null,2)+'\n');
  });
  await check('editing swap inputs invalidates quotes; expired quotes and router reverts cannot sign',async()=>{
    const swap=page.locator('.swap-card');
    await swap.getByLabel('Direction').selectOption('buy');await swap.getByLabel('You pay (ETH)').fill('0.001');await swap.getByRole('button',{name:'Get quote'}).click();await swap.getByText('Estimated receive',{exact:true}).waitFor();
    await swap.getByLabel('Slippage (%)').fill('1');assert.equal(await swap.getByText('Estimated receive',{exact:true}).count(),0);
    await swap.getByRole('button',{name:'Get quote'}).click();await swap.getByText('Estimated receive',{exact:true}).waitFor();
    const before=chain.sends.length;chain.revert=true;await swap.getByRole('button',{name:'Swap ETH for BEAT',exact:true}).click();await swap.getByRole('alert').waitFor();assert.equal(chain.sends.length,before);chain.revert=false;
    await page.evaluate(()=>{window.__realNow=Date.now;Date.now=()=>window.__realNow()+61_000;});await page.waitForFunction(()=>document.querySelector('.quote button[type=submit]').matches(':disabled'));await swap.getByText('Expired · get a new quote',{exact:true}).waitFor();await page.evaluate(()=>{Date.now=window.__realNow;});
  });
  await check('keyboard-only creation completes the primary form with visible focus',async()=>{
    const keyboardChain=new MockChain();const p=await open(keyboardChain);await connect(p);
    await p.getByRole('button',{name:'Create switch',exact:true}).focus();await p.keyboard.press('Shift+Tab');
    assert.equal(await p.locator(':focus').getAttribute('inputmode'),'decimal');await p.keyboard.press('Shift+Tab');await p.keyboard.press('Shift+Tab');await p.keyboard.press('Shift+Tab');
    assert.equal(await p.locator(':focus').getAttribute('placeholder'),'0x…');
    await p.keyboard.type(B);await p.keyboard.press('Tab');await p.keyboard.press('ArrowUp');await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.keyboard.press('Tab');
    assert.match(await p.locator(':focus').innerText(),/Create switch/);
    await p.screenshot({path:fileURLToPath(new URL('keyboard-focus.png',evidence)),fullPage:false});
    await p.keyboard.press('Enter');await confirmed(p,'Create switch');assert.equal(keyboardChain.sends.at(-1).functionName,'create');await p.context().close();
  });
  await check('RPC failures visibly disable actions; bounded log queries shrink and recover',async()=>{
    const failureChain=new MockChain();failureChain.rangeLimit=100n;const p=await open(failureChain);await connect(p);
    assert(failureChain.rpcCalls.filter(x=>x.method==='eth_getLogs').some(x=>BigInt(x.params[0].toBlock)-BigInt(x.params[0].fromBlock)+1n<=100n));
    failureChain.failReads=true;await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByRole('alert').filter({hasText:'Unable to refresh live state'}).waitFor();assert.equal(await p.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);
    failureChain.failReads=false;await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.create-card button[type=submit]').matches(':disabled'));await p.context().close();
  });
  await check('account and chain changes clear wallet data and disable writes',async()=>{
    chain.account=C;await page.evaluate(account=>window.__walletEvent('accountsChanged',[account]),C);await page.waitForFunction(()=>document.querySelector('.wallet-address')?.getAttribute('title')==='0x3333333333333333333333333333333333333333');
    await page.getByRole('article',{name:'Switch 1',exact:true}).waitFor();assert.equal(await page.getByRole('article',{name:'Switch 1',exact:true}).getByRole('button',{name:'Check in',exact:true}).count(),0);
    chain.chain='0x1';await page.evaluate(()=>window.__walletEvent('chainChanged','0x1'));await page.getByRole('button',{name:'Switch to Sepolia'}).waitFor();assert.equal(await page.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByRole('button',{name:'Connect wallet'}).waitFor();assert.equal(await page.getByRole('article').count(),0);
  });
  await check('missing deployed code blocks transaction readiness',async()=>{
    const bad=new MockChain();bad.missingCode=true;
    const p=await browser.newPage();await attachMock(p,bad);await p.goto(url);await p.getByRole('alert').filter({hasText:'No deployed code found'}).waitFor();assert.equal(await p.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);await p.close();
  });
  await check('ABI tampering is detected before RPC transaction readiness',async()=>{
    const p=await browser.newPage();await p.route('**/abi/LaunchToken.json',route=>route.fulfill({contentType:'application/json',body:'[]'}));await p.goto(url);await p.getByRole('alert').filter({hasText:'ABI verification failed'}).waitFor();assert.equal(await p.getByRole('button',{name:'Create switch',exact:true}).isDisabled(),true);await p.close();
  });
  await check('no browser exceptions or console errors in successful flows',async()=>assert.deepEqual(errors,[]));
} catch(error){
  if(page){await page.screenshot({path:fileURLToPath(new URL('failure.png',evidence)),fullPage:true});console.error((await page.locator('body').innerText()).slice(-9000));}
  throw error;
} finally {
  await writeFile(new URL('browser-results.json',evidence),JSON.stringify({recordedAt:new Date().toISOString(),basePath:'/ipfs/heartbeat/',browser:'Chromium 141 via Playwright 1.56.1',checks,consoleErrors:errors,transactions:'All mocked. No live transaction was signed or broadcast.'},null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
