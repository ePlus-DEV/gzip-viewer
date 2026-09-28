"use client";
// Adapted from beUI Theme Toggle: https://beui.dev/components/motion/theme-toggle

import {Moon, Sun} from "lucide-react";
import {motion, useReducedMotion} from "motion/react";
import {useCallback} from "react";

export type ThemeMode = "light" | "dark";

interface ThemeToggleProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  className?: string;
}

export function ThemeToggle({theme,onThemeChange,className=""}:ThemeToggleProps){
  const reduce=useReducedMotion();
  const dark=theme==="dark";

  const toggle=useCallback((event:React.MouseEvent<HTMLButtonElement>)=>{
    const next:ThemeMode=dark?"light":"dark";
    const doc=document as Document & {startViewTransition?: (cb:()=>void)=>{ready:Promise<void>}};
    if(reduce || !doc.startViewTransition){
      onThemeChange(next);
      return;
    }
    const {clientX:x,clientY:y}=event;
    const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
    const transition=doc.startViewTransition(()=>onThemeChange(next));
    void transition.ready.then(()=>{
      document.documentElement.animate(
        {clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},
        {duration:420,easing:"cubic-bezier(.16,1,.3,1)",pseudoElement:"::view-transition-new(root)"}
      );
    }).catch(()=>{});
  },[dark,onThemeChange,reduce]);

  return <motion.button type="button" aria-label={dark?"Use light mode":"Use dark mode"}
    title={dark?"Light mode":"Dark mode"} onClick={toggle}
    whileTap={reduce?undefined:{scale:.9}}
    className={`beui-theme-toggle ${className}`}>
    <motion.span key={theme} initial={reduce?false:{opacity:0,rotate:dark?-35:35,scale:.65}}
      animate={{opacity:1,rotate:0,scale:1}} transition={{type:"spring",stiffness:430,damping:28}}>
      {dark?<Sun size={17}/>:<Moon size={17}/>}
    </motion.span>
  </motion.button>;
}
