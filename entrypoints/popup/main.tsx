import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {browser} from 'wxt/browser';
import {ArrowRight, ArrowUpRight, Bot, CheckCircle2, ChevronDown, Database, FileJson2,
  Globe2, History, Layers2, Play, Radar, Search, ShieldCheck, Sparkles, BellRing} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {httpUrl} from '../../lib/feed';
import type {AuditMode, TestScope} from '../../lib/audit-modes';
import {COMPLETION_NOTIFICATION_KEY} from '../../lib/audit-notifications';
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
      const active = tabs[0]?.url;
      setSite(typeof active === 'string' && /^https?:\/\//i.test(active)
        ? active : typeof saved.lastUrl === 'string' ? saved.lastUrl : '');
      if (typeof saved.lastUrl === 'string') setLastUrl(saved.lastUrl);
      if (saved.auditMode === 'aeo' || saved.auditMode === 'seo') setMode(saved.auditMode);
      if (saved.auditScope === 'quick' || saved.auditScope === 'full') setScope(saved.auditScope);
      setNotifyOnComplete(saved[COMPLETION_NOTIFICATION_KEY] === true);
    }).catch(() => { if (alive) setError('Unable to read saved preferences. Enter a URL to continue.'); });
    return () => { alive = false; };
  }, []);

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
    const documentUrl = new URL(mode === 'aeo' ? '/llms.txt' : '/robots.txt', parsed.origin).href;
    setBusy(true);
    setError('');
    try {
      await browser.storage.local.set({lastUrl: parsed.href, auditMode: mode, auditScope: scope});
      const params = new URLSearchParams();
      const destination = kind === 'audit' ? '/test-runner.html' : '/viewer.html';
      params.set('url', kind === 'direct' ? parsed.href : documentUrl);
      if (kind === 'audit') {
        params.set('mode', mode);
        params.set('scope', scope);
      }
      await browser.tabs.create({url: browser.runtime.getURL(destination) + '?' + params.toString()});
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
          <div className="brand-symbol"><Radar size={21} strokeWidth={2.2}/></div>
          <div><strong>SEO <span>&amp;</span> AEO Auditor</strong><small>Website quality workspace</small></div>
        </div>
        <AnimatedBadge status="info" size="sm" showIcon={false}>v1.8</AnimatedBadge>
      </header>

      <section className="popup-hero">
        <div className="hero-eyebrow"><Sparkles size={13}/> PERFORMANCE &amp; DISCOVERY</div>
        <h1>Audit with clarity.</h1>
        <p>Discover, validate and compare your website’s search and AI-facing data.</p>
      </section>

      <section className="popup-section">
        <div className="section-caption"><span>Choose your audit</span><span>01 / 03</span></div>
        <div className="mode-options" role="radiogroup" aria-label="Audit mode">
          {(['aeo','seo'] as const).map(value => {
            const SelectedIcon = value === 'aeo' ? Bot : Search;
            return (
              <button type="button" role="radio" aria-checked={mode === value} key={value}
                className={'mode-option ' + (mode === value ? 'selected' : '')}
                onClick={() => setMode(value)}>
                <span className={'mode-icon ' + value}><SelectedIcon size={20}/></span>
                <span className="mode-copy"><strong>{value.toUpperCase()} Audit</strong>
                  <small>{value === 'aeo' ? 'LLMS, agents & product feeds' : 'Sitemaps, indexing & schema'}</small>
                </span>
                {mode === value && <CheckCircle2 className="selected-icon" size={18}/>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-section">
        <div className="section-caption"><label htmlFor="site">Target website</label><span>02 / 03</span></div>
        <div className="website-field"><Globe2 size={18}/>
          <input id="site" type="url" inputMode="url" autoComplete="url" value={site}
            onChange={event => setSite(event.target.value)} placeholder="https://example.com"
            onKeyDown={event => {if (event.key === 'Enter') void open('audit');}}/>
        </div>
        <div className="source-hint"><FileJson2 size={13}/>
          Starts at {mode === 'aeo' ? '/llms.txt' : '/robots.txt'}
        </div>
      </section>

      <section className="popup-section">
        <div className="section-caption"><span>Test coverage</span><span>03 / 03</span></div>
        <div className="scope-segments" role="radiogroup" aria-label="Test coverage">
          <button type="button" role="radio" aria-checked={scope === 'quick'}
            className={scope === 'quick' ? 'selected' : ''} onClick={() => setScope('quick')}>
            ⚡ Quick scan
          </button>
          <button type="button" role="radio" aria-checked={scope === 'full'}
            className={scope === 'full' ? 'selected' : ''} onClick={() => setScope('full')}>
            ◈ Full audit
          </button>
        </div>
        <p className="scope-note">{scope === 'quick'
          ? 'Representative links and product samples for a fast review.'
          : 'Deep discovery with explicit coverage limits and NOT RUN reporting.'}</p>
      </section>

      <label className="popup-notification-setting">
        <span className="popup-notification-icon"><BellRing size={17}/></span>
        <span className="popup-notification-copy">
          <strong>Notify when finished</strong>
          <small>Show a desktop alert with the audit results</small>
        </span>
        <input type="checkbox" role="switch" checked={notifyOnComplete}
          aria-label="Notify me when the audit finishes"
          onChange={event => { void changeNotifications(event.target.checked); }}/>
        <span className="popup-notification-track" aria-hidden="true"><span/></span>
      </label>

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

      <button type="button" aria-expanded={advanced} className="advanced-trigger"
        onClick={() => setAdvanced(value => !value)}>
        More options <ChevronDown size={14} className={advanced ? 'rotated' : ''}/>
      </button>
      {advanced && <div className="advanced-actions">
        <button type="button" onClick={() => void open('direct')}>Open exact URL <ArrowUpRight size={12}/></button>
        <button type="button" disabled={!lastUrl} onClick={() => void open('direct', lastUrl || undefined)}>
          <History size={13}/> Last opened
        </button>
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
