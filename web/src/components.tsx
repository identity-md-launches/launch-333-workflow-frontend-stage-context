import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { formatUnits } from 'viem';
import { errorText } from './logic.ts';
export function Pulse({large=false}:{large?:boolean}) {
  return <svg className={large?'pulse large':'pulse'} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M4 25h10l5-13 9 25 5-12h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export function Field({label,hint,...props}: React.InputHTMLAttributes<HTMLInputElement> & {label:string;hint?:string}) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-describedby={hint?`${id}-hint`:undefined}/>{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
export function Form({children,onSubmit,className='',disabled=false}:{children:ReactNode;onSubmit:()=>Promise<unknown>|unknown;className?:string;disabled?:boolean}) {
  const [error,setError] = useState('');
  const id = useId();
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(disabled)return;setError('');
    const form = e.currentTarget;
    try{await onSubmit();}catch(err){setError(errorText(err));requestAnimationFrame(()=>form.querySelector<HTMLElement>('[data-form-error]')?.focus());}
  }
  return <form className={className} onSubmit={e=>void submit(e)} aria-describedby={error?id:undefined}>
    <fieldset disabled={disabled}>{children}</fieldset>
    {error && <p className="error" role="alert" id={id} tabIndex={-1} data-form-error>{error}</p>}
  </form>;
}
export function Amount({value,decimals=18,unit='ETH'}:{value:bigint;decimals?:number;unit?:string}) {
  const exact = formatUnits(value,decimals);
  return <span className="number">{exact} <span className="unit">{unit}</span></span>;
}
export function External({href,children}:{href:string;children:ReactNode}) {return <a href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;}
