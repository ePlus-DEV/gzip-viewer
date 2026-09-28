import {useCallback, useEffect, useState} from 'react';
import {browser} from 'wxt/browser';
import type {ThemeMode} from './theme-toggle';

function commitTheme(theme:ThemeMode){
  document.documentElement.dataset.theme=theme;
  document.documentElement.classList.toggle('dark',theme==='dark');
}

export function useTheme(){
  const [theme,setTheme]=useState<ThemeMode>(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  useEffect(()=>{
    let alive=true;
    void browser.storage.local.get('theme').then(saved=>{
      if(!alive)return;
      const stored=saved.theme==='dark'||saved.theme==='light'?saved.theme:null;
      const next:ThemeMode=stored??(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
      setTheme(next); commitTheme(next);
    }).catch(()=>{});
    return()=>{alive=false;};
  },[]);
  const changeTheme=useCallback((next:ThemeMode)=>{
    setTheme(next); commitTheme(next); void browser.storage.local.set({theme:next});
  },[]);
  return {theme,changeTheme};
}
