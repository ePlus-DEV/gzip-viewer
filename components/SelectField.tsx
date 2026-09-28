import {useEffect, useRef, useState} from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './beui/select';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  label?: string;
  value?: string;
  defaultValue?: string;
  options: readonly SelectOption[];
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  controlId?: string;
}

export function SelectField({
  label,value,defaultValue,options,onValueChange,placeholder,className,disabled,controlId,
}:SelectFieldProps){
  const controlled=value!==undefined;
  const [internal,setInternal]=useState(defaultValue??options[0]?.value??'');
  const current=controlled ? (value??'') : internal;
  const change=(next:string)=>{
    if(!controlled)setInternal(next);
    onValueChange?.(next);
  };
  return (
    <div className={'beui-select-field '+(className??'')} data-control-id={controlId}>
      {label ? <span className="beui-select-label">{label}</span> : null}
      <Select value={current} onValueChange={change} disabled={disabled}>
        <SelectTrigger className="beui-select-trigger" ariaLabel={label}>
          <SelectValue placeholder={placeholder}/>
        </SelectTrigger>
        <SelectContent className="beui-select-content">
          {options.map(option=>(
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface LegacyBoundSelectProps {
  id: string;
  label?: string;
  defaultValue: string;
  options: readonly SelectOption[];
  className?: string;
  ariaLabel?: string;
  controlId?: string;
}

/**
 * Keeps the existing DOM audit engine API while rendering the actual control
 * with beUI. The native select is hidden and serves only as a compatibility
 * bridge for legacy querySelector/value/change code.
 */
export function LegacyBoundSelect({
  id,label,defaultValue,options:initialOptions,className,ariaLabel,controlId,
}:LegacyBoundSelectProps){
  const nativeRef=useRef<HTMLSelectElement>(null);
  const [options,setOptions]=useState<SelectOption[]>([...initialOptions]);
  const [nativeOptions,setNativeOptions]=useState<SelectOption[]>([...initialOptions]);
  const [value,setValue]=useState(defaultValue);

  useEffect(()=>{
    const native=nativeRef.current;
    if(!native)return;
    const sync=()=>{
      const next=[...native.options].map(option=>({
        value:option.value,
        label:option.textContent??option.label,
        disabled:option.disabled,
      }));
      setOptions(next);
      setNativeOptions(next);
      setValue(native.value || next[0]?.value || '');
    };
    const observer=new MutationObserver(sync);
    observer.observe(native,{
      childList:true,subtree:true,attributes:true,
      attributeFilter:['disabled','label','selected','value'],
    });
    native.addEventListener('change',sync);
    sync();
    return ()=>{
      observer.disconnect();
      native.removeEventListener('change',sync);
    };
  },[]);

  function change(next:string){
    const native=nativeRef.current;
    if(!native)return;
    native.value=next;
    setValue(next);
    native.dispatchEvent(new Event('change',{bubbles:true}));
  }

  return (
    <div className={'beui-select-field '+(className??'')} data-control-id={controlId??id}>
      {label ? <span className="beui-select-label">{label}</span> : null}
      <select ref={nativeRef} id={id} defaultValue={defaultValue}
        className="beui-native-select-bridge" aria-hidden="true" tabIndex={-1}>
        {nativeOptions.map(option=>(
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Select value={value} onValueChange={change}>
        <SelectTrigger className="beui-select-trigger" ariaLabel={ariaLabel??label}>
          <SelectValue/>
        </SelectTrigger>
        <SelectContent className="beui-select-content">
          {options.map(option=>(
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
