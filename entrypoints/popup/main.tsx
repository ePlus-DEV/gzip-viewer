import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {browser} from 'wxt/browser';
import {ArrowRight, ArrowUpRight, Bot, CheckCircle2, ChevronDown, Database, FileJson2,
  Globe2, History, Layers2, Play, Radar, Search, ShieldCheck, Sparkles, BellRing} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {Input} from '../../components/beui/input';
import {Switch} from '../../components/beui/switch';
import {httpUrl} from '../../lib/feed';
import type {AuditMode, TestScope} from '../../lib/audit-modes';
import {COMPLETION_NOTIFICATION_KEY} from '../../lib/audit-notifications';
import {auditEntryUrl, auditLaunchUrl} from '../../lib/audit-launch';
import '../../assets/beui.css';
import './style.css';

function App() {
  const [site, setSite] = useState('');
  const [mode, setMode] = useState<AuditMode>('aeo');
  const [scope, setScope] = useState<TestScope>('quick');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      browser.storage.local.get(['lastUrl','auditMode','auditScope',COMPLETION_NOTIFICATION_KEY]),
      browser.tabs.query({active: true, currentWindow: true}),
    ]).then(([saved, tabs]) => {
      if (!alive) return;
      const selectedMode: AuditMode = saved.auditMode === 'seo' ? 'seo' : 'aeo';
      const active = tabs[0]?.url;
      const source = typeof active === 'string' && /^https?:\/\//i.test(active)
        ? active : typeof saved.lastUrl === 'string' ? saved.lastUrl : '';
      if (source) {
        try { setSite(auditEntryUrl(source, selectedMode)); }
        catch { setSite(source); }
      }
      if (typeof saved.lastUrl === 'string') setLastUrl(saved.lastUrl);
      setMode(selectedMode);
      if (saved.auditScope === 'quick' || saved.auditScope === 'full') setScope(saved.auditScope);
      setNotifyOnComplete(saved[COMPLETION_NOTIFICATION_KEY] === true);
    }).catch(() => { if (alive) setError('Unable to read saved preferences. Enter a URL to continue.'); });
    return () => { alive = false; };
  }, []);

  function normalizeTarget(value: string, nextMode: AuditMode = mode): string {
    if (!value.trim()) return value;
    try { return auditEntryUrl(value, nextMode); }
    catch { return value; }
  }

  function changeMode(nextMode: AuditMode) {
    setMode(nextMode);
    setSite(current => normalizeTarget(current, nextMode));
  }

  async function changeNotifications(enabled: boolean) {
    try {
      await browser.storage.local.set({[COMPLETION_NOTIFICATION_KEY]: enabled});
      setNotifyOnComplete(enabled);
      setError('');
    } catch {
      setError('Could not save the notification setting.');
    }
  }

  async function open(kind: 'audit'|'explore'|'direct', saved?: string) {
    let parsed: URL;
    try { parsed = httpUrl((saved ?? site).trim()); }
    catch { setError('Enter a valid HTTP(S) website URL.'); return; }
    const documentUrl = auditEntryUrl(parsed.href, mode);
    setBusy(true);
    setError('');
    try {
      await browser.storage.local.set({lastUrl: documentUrl, auditMode: mode, auditScope: scope});
      const destination = kind === 'audit'
        ? auditLaunchUrl(browser.runtime.getURL('/test-runner.html'), documentUrl, mode, scope)
        : browser.runtime.getURL('/viewer.html') + '?url=' +
          encodeURIComponent(kind === 'direct' ? parsed.href : documentUrl);
      await browser.tabs.create({url: destination});
      window.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cannot open the extension tab.');
      setBusy(false);
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-top">
        <div className="brand-lockup">
          <div className="brand-symbol"><img src="/icon-48.png" width={40} height={40} alt=""/></div>
          <div><strong>SEO <span>&amp;</span> AEO Auditor</strong><small>Website quality workspace</small></div>
        </div>
        <AnimatedBadge status="info" size="sm" showIcon={false}>v1.9.3</AnimatedBadge>
      </header>

      <section className="popup-hero">
        <div className="hero-eyebrow"><Sparkles size={13}/> PERFORMANCE &amp; DISCOVERY</div>
        <h1>Your audit. <span>One workspace.</span></h1>
        <p>Inspect discovery files, trace product data and ship trustworthy search experiences.</p>
      </section>

      <section className="popup-section">
        <div className="section-caption"><span>Choose your audit</span><span>01 / 03</span></div>
        <div className="mode-options" role="radiogroup" aria-label="Audit mode">
          {(['aeo','seo'] as const).map(value => {
            const SelectedIcon = value === 'aeo' ? Bot : Search;
            return (
              <Button type="button" variant="ghost" size="md" role="radio" aria-checked={mode === value} key={value}
                className={'mode-option ' + (mode === value ? 'selected' : '')}
                onClick={() => changeMode(value)}>
                <span className={'mode-icon ' + value}><SelectedIcon size={20}/></span>
                <span className="mode-copy"><strong>{value.toUpperCase()} Audit</strong>
                  <small>{value === 'aeo' ? 'LLMS, agents & product feeds' : 'Sitemaps, indexing & schema'}</small>
                </span>
                {mode === value && <CheckCircle2 className="selected-icon" size={18}/>}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="popup-section">
        <div className="section-caption"><label htmlFor="site">Audit entry point</label><span>02 / 03</span></div>
        <Input id="site" type="url" inputMode="url" autoComplete="url" value={site}
          onChange={setSite} onBlur={() => setSite(current => normalizeTarget(current))}
          placeholder={mode === 'aeo' ? 'https://example.com/llms.txt' : 'https://example.com/robots.txt'}
          onKeyDown={event => {
            if(event.key === 'Enter') {
              setSite(current => normalizeTarget(current));
              void open('audit');
            }
          }}
          leftIcon={<Globe2 size={18}/>} className="popup-site-input"
          classNames={{field:"website-field",input:"popup-site-text"}}/>
        <div className="source-hint"><FileJson2 size={13}/>
          Same entry point used by the full audit dashboard
        </div>
      </section>

      <section className="popup-section">
        <div className="section-caption"><span>Test coverage</span><span>03 / 03</span></div>
        <div className="scope-segments" role="radiogroup" aria-label="Test coverage">
          <Button type="button" variant="ghost" size="sm" role="radio" aria-checked={scope === 'quick'}
            className={scope === 'quick' ? 'selected' : ''} onClick={() => setScope('quick')}>
            ⚡ Quick scan
          </Button>
          <Button type="button" variant="ghost" size="sm" role="radio" aria-checked={scope === 'full'}
            className={scope === 'full' ? 'selected' : ''} onClick={() => setScope('full')}>
            ◈ Full audit
          </Button>
        </div>
        <p className="scope-note">{scope === 'quick'
          ? 'Representative links and product samples for a fast review.'
          : 'Deep discovery with explicit coverage limits and NOT RUN reporting.'}</p>
      </section>

      <div className="popup-notification-setting">
        <span className="popup-notification-icon"><BellRing size={17}/></span>
        <span className="popup-notification-copy">
          <strong>Notify when finished</strong>
          <small>Desktop summary when your scan completes</small>
        </span>
        <Switch checked={notifyOnComplete} ariaLabel="Notify me when the audit finishes"
          onCheckedChange={value=>{void changeNotifications(value);}}/>
      </div>

      {error && <p role="alert" className="popup-error">{error}</p>}
      <div className="popup-actions">
        <Button size="lg" ripple disabled={busy}
          className="w-full rounded-xl justify-center" onClick={() => void open('audit')}>
          <Play size={16} fill="currentColor"/> {busy ? 'Opening…' : 'Run ' + mode.toUpperCase() + ' Tests'}
          <ArrowRight size={17} className="ml-auto"/>
        </Button>
        <Button variant="outline" size="md" disabled={busy}
          className="w-full rounded-xl justify-center" onClick={() => void open('explore')}>
          <Layers2 size={16}/> Explore resources <ArrowUpRight size={13}/>
        </Button>
      </div>

      <Button type="button" size="sm" variant="ghost" aria-expanded={advanced} className="advanced-trigger"
        onClick={() => setAdvanced(value => !value)}>
        More options <ChevronDown size={14} className={advanced ? 'rotated' : ''}/>
      </Button>
      {advanced && <div className="advanced-actions">
        <Button type="button" size="sm" variant="ghost" onClick={() => void open('direct')}>Open exact URL <ArrowUpRight size={12}/></Button>
        <Button type="button" size="sm" variant="ghost" disabled={!lastUrl} onClick={() => void open('direct', lastUrl || undefined)}>
          <History size={13}/> Last opened
        </Button>
      </div>}

      <footer className="popup-footer">
        <span><ShieldCheck size={14}/> Local browser analysis</span>
        <span><Database size={14}/> No third-party uploads</span>
      </footer>
    </main>
  );
}
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<App/>);
