import {useEffect, useMemo, useRef, useState} from 'react';
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
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectField({
  label,value,options,onValueChange,placeholder,className,disabled,
}:SelectFieldProps){
  return (
    <div className={'beui-select-field '+(className??'')}>
      {label ? <span className="beui-select-label">{label}</span> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="beui-select-trigger">
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
}

/**
 * Keeps the existing DOM audit engine API while rendering the actual control
 * with beUI. The native select is hidden and serves only as a compatibility
 * bridge for legacy querySelector/value/change code.
 */
export function LegacyBoundSelect({
  id,label,defaultValue,options:initialOptions,className,ariaLabel,
}:LegacyBoundSelectProps){
  const nativeRef=useRef<HTMLSelectElement>(null);
  const [options,setOptions]=useState<SelectOption[]>([...initialOptions]);
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

  const nativeOptions=useMemo(()=>initialOptions,[initialOptions]);

  function change(next:string){
    const native=nativeRef.current;
    if(!native)return;
    native.value=next;
    setValue(next);
    native.dispatchEvent(new Event('change',{bubbles:true}));
  }

  return (
    <div className={'beui-select-field '+(className??'')}>
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
