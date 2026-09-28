import {useMemo, useState, type FormEvent} from 'react';
import {Button} from './beui/button';
import {Input} from './beui/input';
import {SelectField} from './SelectField';

interface ResourceTemplateFormProps {
  placeholders: readonly string[];
  languages: readonly string[];
  onResolve: (values: Record<string,string>) => string | null;
  onNavigate: (destination: string) => void;
}

export function ResourceTemplateForm({
  placeholders,languages,onResolve,onNavigate,
}:ResourceTemplateFormProps){
  const initial=useMemo(()=>{
    const values:Record<string,string>={};
    for(const placeholder of placeholders){
      values[placeholder]=placeholder==='lang'?(languages[0]??'en'):'';
    }
    return values;
  },[placeholders,languages]);
  const [values,setValues]=useState<Record<string,string>>(initial);
  const [error,setError]=useState('');

  const update=(key:string,value:string)=>{
    setValues(current=>({...current,[key]:value}));
    setError('');
  };

  const submit=(event:FormEvent)=>{
    event.preventDefault();
    const normalized=Object.fromEntries(
      Object.entries(values).map(([key,value])=>[key,value.trim()]),
    );
    if(placeholders.some(key=>!normalized[key])){
      setError('Fill in every template variable with a valid value.');
      return;
    }
    const destination=onResolve(normalized);
    if(!destination){
      setError('Fill in every template variable with a valid value.');
      return;
    }
    onNavigate(destination);
  };

  return (
    <form className="resource-form beui-resource-form" onSubmit={submit}>
      {placeholders.map(placeholder=>(
        placeholder==='lang'&&languages.length ? (
          <SelectField key={placeholder} label={placeholder.toUpperCase()}
            value={values[placeholder]??languages[0]??'en'}
            onValueChange={value=>update(placeholder,value)}
            options={languages.map(language=>({value:language,label:language}))}
            className="resource-lang-select"/>
        ) : (
          <Input key={placeholder} label={placeholder.toUpperCase()}
            value={values[placeholder]??''}
            onChange={value=>update(placeholder,value)}
            required maxLength={180}
            placeholder={placeholder==='sku'?'Product SKU':
              placeholder==='shard'?'Number from feed index':placeholder}/>
        )
      ))}
      <Button type="submit" size="sm" className="resource-resolve-button">
        Resolve &amp; view
      </Button>
      {error?<small className="error" role="alert">{error}</small>:null}
    </form>
  );
}
