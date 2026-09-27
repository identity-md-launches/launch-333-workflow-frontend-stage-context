import { encodeAbiParameters, isAddress, parseUnits, zeroAddress, type Address } from 'viem';
import type { Config } from './config.ts';
export const DAY = 86400n;
export type SwitchInfo = { id: bigint; depositor: Address; beneficiary: Address; balance: bigint; period: bigint; lastPing: bigint; closed: boolean; timeLeft: bigint };
export const same = (a: string, b?: string) => a.toLowerCase() === b?.toLowerCase();
export function addressInput(value: string, differentFrom?: string): Address {
  if (!isAddress(value) || same(value, zeroAddress)) throw Error('Enter a valid, nonzero Ethereum address.');
  if (same(value, differentFrom)) throw Error('Choose a beneficiary different from the depositor.');
  return value;
}
export function amountInput(value: string, decimals: number, allowZero = false) {
  if (!/^\d+(\.\d+)?$/.test(value) || (value.split('.')[1]?.length ?? 0) > decimals) throw Error(`Enter an amount with at most ${decimals} decimal places.`);
  const amount = parseUnits(value, decimals);
  if (amount < 0n || (!allowZero && amount === 0n)) throw Error('Enter an amount greater than zero.');
  return amount;
}
export function periodInput(value: string) {
  if (!/^\d+$/.test(value)) throw Error('Enter a whole number of seconds.');
  const period = BigInt(value);
  if (period < DAY || period > 365n * DAY) throw Error('Choose between 86,400 and 31,536,000 seconds (1–365 days).');
  return period;
}
export function eligibility(info: SwitchInfo, account: string, now: bigint, recovery: bigint) {
  const lapsed = now >= info.lastPing + info.period;
  return { lapsed, active: !info.closed && !lapsed && same(info.depositor, account),
    claim: !info.closed && lapsed && same(info.beneficiary, account),
    reclaim: !info.closed && now >= info.lastPing + info.period + recovery && same(info.depositor, account) };
}
export function slippageBps(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw Error('Enter slippage from 0.01% to 5%, with up to two decimal places.');
  const bps = Math.round(Number(value) * 100);
  if (bps < 1 || bps > 500) throw Error('Choose slippage from 0.01% to 5%.');
  return BigInt(bps);
}
export function poolKey(config: Config) {
  const { pool } = config.deployment;
  const currencies = [pool.pairedCurrency, config.token.address].sort((a,b)=>BigInt(a) < BigInt(b) ? -1 : 1);
  return { currency0: currencies[0], currency1: currencies[1], fee: pool.fee, tickSpacing: pool.tickSpacing, hooks: zeroAddress };
}
const keyComponents = [{name:'currency0',type:'address'}, {name:'currency1',type:'address'}, {name:'fee',type:'uint24'}, {name:'tickSpacing',type:'int24'}, {name:'hooks',type:'address'}] as const;
export function swapEncoding(config: Config, buy: boolean, amount: bigint, minimum: bigint, deadline: bigint) {
  if (amount <= 0n || amount >= 2n ** 128n || minimum <= 0n || minimum >= 2n ** 128n) throw Error('Swap amounts must fit uint128 and be greater than zero.');
  const key = poolKey(config);
  const input = buy ? config.deployment.pool.pairedCurrency : config.token.address;
  const output = buy ? config.token.address : config.deployment.pool.pairedCurrency;
  const swap = encodeAbiParameters([{ type:'tuple', components:[{name:'poolKey',type:'tuple',components:keyComponents}, {name:'zeroForOne',type:'bool'}, {name:'amountIn',type:'uint128'}, {name:'amountOutMinimum',type:'uint128'}, {name:'hookData',type:'bytes'}]}], [{poolKey:key, zeroForOne:same(input,key.currency0), amountIn:amount, amountOutMinimum:minimum, hookData:'0x'}]);
  const settle = encodeAbiParameters([{type:'address'},{type:'uint256'}], [input,amount]);
  const take = encodeAbiParameters([{type:'address'},{type:'uint256'}], [output,minimum]);
  return { commands: '0x10' as const, inputs: [encodeAbiParameters([{type:'bytes'},{type:'bytes[]'}], ['0x060c0f',[swap,settle,take]])], deadline, value: same(input,zeroAddress) ? amount : 0n };
}
export function errorText(error: unknown): string {
  const fixes: Record<string,string> = {
    AlreadyLapsed: 'This switch has lapsed. Refresh to see claim or recovery options.',
    NotLapsed: 'The switch is still active. Wait until its lapse time and refresh.',
    RecoveryNotAvailable: 'Recovery opens 365 days after lapse. Wait and refresh.',
    UnauthorizedDepositor: 'Only the depositor can do this. Check your connected account.',
    UnauthorizedBeneficiary: 'Only the current beneficiary can claim. Refresh the switch.',
    ClosedSwitch: 'This switch is already closed. Refresh your switches.',
    UnknownSwitch: 'This switch was not found. Refresh the switch list.',
    InvalidBeneficiary: 'Use a nonzero beneficiary different from the depositor.',
    InvalidPeriod: 'Choose a period between 1 and 365 days.',
    InvalidAmount: 'Check the amount and available balance, then retry.',
    InvalidRecipient: 'Enter a nonzero recipient address.',
    EtherTransferFailed: 'The recipient rejected ETH. Choose another recipient where supported.',
    ERC20InsufficientBalance: 'The source wallet has insufficient BEAT. Lower the amount.',
    ERC20InsufficientAllowance: 'The spender needs a larger allowance. Review approvals.',
  };
  type Detail = {code?:number;name?:string;shortMessage?:string;message?:string;reason?:string;data?:{errorName?:string}|string;cause?:unknown};
  let node=error as Detail;
  let reason='';
  for(let depth=0;node&&depth<12;depth++,node=node.cause as Detail){
    if(node.code===4001||/user rejected|user denied/i.test(node.message??'')) return 'Request declined in your wallet. Nothing was submitted. You can try again.';
    if(typeof node.data==='object'&&node.data?.errorName){const name=node.data.errorName;reason=`${name}: ${fixes[name]??'The contract rejected this action. Refresh state and review the inputs.'}`;}
    else if(!reason&&node.reason)reason=`${node.reason}. Refresh state and review the inputs.`;
    else if(!reason&&typeof node.data==='string'&&node.data!=='0x')reason=`Contract revert data: ${node.data}. Refresh state and review the inputs.`;
  }
  if(reason)return reason;
  const e=error as Detail;
  return e?.shortMessage || e?.message || 'Unable to complete this request. Check your connection and try again.';
}
export function timeLabel(seconds: bigint) {
  if (seconds <= 0n) return 'Lapsed';
  if (seconds >= DAY) return `${seconds / DAY}d ${(seconds % DAY) / 3600n}h left`;
  if (seconds >= 3600n) return `${seconds / 3600n}h ${(seconds % 3600n) / 60n}m left`;
  return `${seconds / 60n}m ${seconds % 60n}s left`;
}
