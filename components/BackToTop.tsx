import {useEffect, useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {Button} from './beui/button';
import {shouldShowBackToTop} from '../lib/audit-timing';

export function BackToTop() {
  const [visible, setVisible] = useState(() => shouldShowBackToTop(window.scrollY));
  useEffect(() => {
    const sync = () => setVisible(shouldShowBackToTop(window.scrollY));
    window.addEventListener('scroll', sync, {passive: true});
    sync();
    return () => window.removeEventListener('scroll', sync);
  }, []);

  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="primary"
      size="icon"
      className="back-to-top fixed bottom-6 right-6 z-50 h-11 w-11 rounded-xl shadow-lg"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })}
    >
      <ArrowUp size={19} aria-hidden="true"/>
    </Button>
  );
}
