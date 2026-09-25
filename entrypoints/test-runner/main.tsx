import {useEffect, useState} from 'react';
import {browser} from 'wxt/browser';
import {createRoot} from 'react-dom/client';
import {Activity, ArrowUpRight, Bot, CheckCircle2, Download, FileCode2,
  Globe2, Layers2, Play, Radar, Search, ShieldCheck, Square, Sparkles,
  BellRing, Clock3, Hourglass, CalendarClock} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {Input} from '../../components/beui/input';
import {Switch} from '../../components/beui/switch';
import {initializeAuditRunner} from './logic';
import {COMPLETION_NOTIFICATION_KEY} from '../../lib/audit-notifications';
import {BackToTop} from '../../components/BackToTop';
import '../../assets/beui.css';
import './style.css';

function App() {
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const initialSite = new URLSearchParams(location.search).get('url') || '';
  const [site, setSite] = useState(initialSite);
  const [startupError, setStartupError] = useState('');
  const [runState,setRunState] = useState({running:false,hasReport:false});
  useEffect(()=>{
    const handler=(event:Event)=> {
      const update=(event as CustomEvent<{running:boolean;hasReport:boolean}>).detail;
      if(update) setRunState(update);
    };
    window.addEventListener('audit:run-state',handler);
    return ()=>window.removeEventListener('audit:run-state',handler);
  },[]);
  useEffect(() => {
    try {initializeAuditRunner();}
    catch (reason) {
      const details=reason instanceof Error?reason.message:String(reason);
      setStartupError('Unable to initialize the audit: '+details);
    }
  }, []);
  useEffect(() => {
    if(initialSite)return;
    let alive=true;
    void browser.storage.local.get('lastUrl').then(result=>{
      if(alive&&typeof result.lastUrl==='string') {
        setSite(current=>current||(result.lastUrl as string));
      }
    }).catch(()=>{});
    return ()=>{alive=false;};
  }, [initialSite]);
  useEffect(() => {
    let alive = true;
    const sync = (changes: Record<string, {newValue?: unknown}>, area: string) => {
      if (alive && area === 'local' && changes[COMPLETION_NOTIFICATION_KEY]) {
        setNotifyOnComplete(changes[COMPLETION_NOTIFICATION_KEY]!.newValue === true);
      }
    };
    browser.storage.onChanged.addListener(sync);
    void browser.storage.local.get(COMPLETION_NOTIFICATION_KEY).then(stored => {
      if (alive) setNotifyOnComplete(stored[COMPLETION_NOTIFICATION_KEY] === true);
    }).catch(() => {
      if (alive) setPreferenceError('Cannot read notification preferences.');
    });
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(sync);
    };
  }, []);
  async function changeNotifications(enabled: boolean) {
    try {
      await browser.storage.local.set({[COMPLETION_NOTIFICATION_KEY]: enabled});
      setNotifyOnComplete(enabled);
      setPreferenceError('');
    } catch {
      setPreferenceError('Could not save the notification setting. Please try again.');
    }
  }
  return (
    <div className="audit-shell">
      <header className="audit-header">
        <div className="audit-logo"><span className="logo-mark"><img src="/icon-48.png" width={39} height={39} alt=""/></span>
          <span><strong>SEO <em>&amp;</em> AEO Auditor</strong><small>Website quality workspace</small></span>
        </div>
        <div className="audit-header-actions">
          <AnimatedBadge status="info" size="sm" showIcon={false}>LOCAL AUDIT</AnimatedBadge>
          <a id="browse" className="explore-nav" href="#" aria-label="Open resource explorer in the extension">
            <Layers2 size={16}/> Resource Explorer <ArrowUpRight size={14}/>
          </a>
        </div>
      </header>

      <div className="audit-layout">
        <aside className="audit-sidebar">
          <div className="sidebar-title">WORKSPACE</div>
          <a className="sidebar-active" href="#audit-config"><Activity size={16}/> Audit dashboard</a>
          <a className="sidebar-feature" id="sidebar-browse" href="#audit-config"><Globe2 size={16}/> Website resources</a>
          <div className="sidebar-divider"/>
          <div className="sidebar-title">ABOUT THIS AUDIT</div>
          <p>Every check includes a result, a reference and a path back to its source.</p>
          <div className="sidebar-info"><ShieldCheck size={17}/>
            <span>Site data is fetched using your current Chrome session. No external uploads.</span>
          </div>
          <div className="sidebar-credit">SEO &amp; AEO Auditor <span>v1.9.3</span></div>
        </aside>

        <main className="audit-content">
          <div className="page-eyebrow"><Sparkles size={14}/> AUDIT WORKSPACE</div>
          <div className="page-head">
            <div><h1>Site intelligence <span className="hero-accent">workspace.</span></h1>
              <p>Explore crawlability and AI discovery, compare product feeds, and isolate data issues.</p>
            </div>
            <AnimatedBadge status="info" size="md">AUDIT CONSOLE</AnimatedBadge>
          </div>

          {startupError && <div className="startup-error" role="alert">{startupError}</div>}
          <section className="panel configuration-panel" id="audit-config" aria-labelledby="mode-heading">
            <div className="panel-heading"><div className="heading-icon"><Bot size={19}/></div>
              <div><h2 id="mode-heading">Choose an audit</h2><p>Two specialized suites, one reporting workspace.</p></div>
              <span className="step-count">STEP 01</span>
            </div>
            <fieldset id="audit-modes" className="mode-cards">
              <legend className="sr-only">Audit mode</legend>
              <label className="mode-card selected">
                <input type="radio" name="audit-mode" value="aeo" defaultChecked/>
                <span className="card-icon aeo"><Bot size={21}/></span>
                <span className="mode-desc"><strong>AEO Audit</strong>
                  <small>LLMS, agent instructions, product feed and multilingual data</small>
                  <span className="mode-tags">llms.txt · agents.md · JSONL.GZ</span>
                </span>
                <span className="mode-check"><CheckCircle2 size={18}/></span>
              </label>
              <label className="mode-card">
                <input type="radio" name="audit-mode" value="seo"/>
                <span className="card-icon seo"><Search size={21}/></span>
                <span className="mode-desc"><strong>SEO Audit</strong>
                  <small>Technical indexing, sitemap health and product metadata</small>
                  <span className="mode-tags">robots.txt · XML · JSON-LD</span>
                </span>
                <span className="mode-check"><CheckCircle2 size={18}/></span>
              </label>
            </fieldset>
            <p id="mode-description" className="mode-description">Start at llms.txt and cross-check linked feeds and localized products.</p>

            <div className="form-divider"/>
            <div className="panel-heading compact"><div className="heading-icon"><Globe2 size={19}/></div>
              <div><h2>Target and scope</h2><p>Select any website that your browser can access.</p></div>
              <span className="step-count">STEP 02</span>
            </div>
            <label htmlFor="site" className="input-label">Audit entry point</label>
            <Input id="site" type="url" value={site} onChange={setSite}
              autoComplete="url" placeholder="https://example.com"
              leftIcon={<Globe2 size={17}/>} className="audit-site-input"
              classNames={{field:"url-field",input:"audit-site-text"}} required/>
            <div className="settings">
              <label htmlFor="scope">Scan scope
                <select id="scope">
                  <option value="quick">⚡ Quick — representative sample</option>
                  <option value="full">◈ Full — published resources (safety caps)</option>
                </select>
              </label>
              <label htmlFor="reference" className="aeo-only">Reference language
                <select id="reference"><option value="en">en (default)</option></select>
              </label>
              <label htmlFor="links" className="aeo-only">Links from llms.txt
                <select id="links">
                  <option value="15">First 15 links</option>
                  <option value="50">First 50 links</option>
                  <option value="0">All published links</option>
                </select>
              </label>
            </div>
            <details className="checklist"><summary><FileCode2 size={16}/>
              Checks in <span id="checklist-mode">AEO</span> mode</summary>
              <ul id="mode-checks"/>
            </details>
            <div className="run-toolbar">
              <Button id="run" size="lg" disabled={runState.running} className="rounded-xl audit-run"><Play size={16} fill="currentColor"/> Run Tests</Button>
              <Button id="stop" variant="outline" size="lg" className="rounded-xl" disabled={!runState.running}>
                <Square size={15}/> Stop
              </Button>
              <Button id="export" variant="outline" size="lg" className="rounded-xl" disabled={!runState.hasReport || runState.running}>
                <Download size={16}/> Export JSON
              </Button>
            </div>
            <div className="notification-setting">
              <span className="notification-setting-icon"><BellRing size={19}/></span>
              <span className="notification-setting-copy">
                <strong>Notify when audit finishes</strong>
                <small>Optional desktop notification, even when the tab is in the background.</small>
              </span>
              <div className="notification-switch">
                <Switch checked={notifyOnComplete} ariaLabel="Notify me when the audit finishes"
                  onCheckedChange={enabled=>{void changeNotifications(enabled);}}/>
                <strong>{notifyOnComplete ? 'On' : 'Off'}</strong>
              </div>
            </div>
            {preferenceError && <p className="notification-setting-error" role="alert">{preferenceError}</p>}
            <p id="notification-status" className="notification-delivery-status" role="status" aria-live="polite"/>
            <p className="audit-note"><ShieldCheck size={15}/>
              Full AEO may download large feeds. Full SEO checks up to 500 page URLs and reports skipped coverage as NOT RUN.</p>
          </section>

          <section className="panel results-panel" id="result" aria-label="Audit results" aria-live="polite">
            <div className="panel-heading result-header"><div className="heading-icon"><Activity size={19}/></div>
              <div><h2>Audit results <small id="summary"/></h2>
                <p>Every finding shows what was checked and where.</p>
              </div><span className="live-pill">LIVE</span>
            </div>
            <progress id="progress" max="100" value="0"/>
            <p id="activity">Ready. Choose a mode and press Run Tests.</p>
            <div className="time-metrics" role="group" aria-label="Audit timing">
              <div className="time-metric">
                <span className="time-caption"><Clock3 size={16}/><span id="duration-label">Time elapsed</span></span>
                <strong id="elapsed" className="time-value">00:00:00</strong>
              </div>
              <div className="time-metric">
                <span className="time-caption"><Hourglass size={16}/><span id="remaining-label">Estimated remaining</span></span>
                <strong id="remaining" className="time-value">Not started</strong>
              </div>
              <div className="time-metric">
                <span className="time-caption"><CalendarClock size={16}/><span id="finish-label">Expected finish</span></span>
                <strong id="finish-at" className="time-value">—</strong>
              </div>
            </div>
            <p id="timing-note" className="timing-note">ETA appears after two comparable units.</p>
            <div className="totals">
              <div className="stat passed"><strong id="passed">0</strong><span>PASS</span></div>
              <div className="stat failed"><strong id="failed">0</strong><span>FAIL</span></div>
              <div className="stat warnings"><strong id="warnings">0</strong><span>WARNING</span></div>
              <div className="stat blocked"><strong id="blocked">0</strong><span>BLOCKED</span></div>
              <div className="stat notrun"><strong id="notrun">0</strong><span>NOT RUN</span></div>
            </div>
            <div className="results-toolbar">
              <div className="results-toolbar-heading">
                <strong>Live findings</strong>
                <span id="results-visible">0 matching checks</span>
              </div>
              <div className="results-toolbar-actions">
                <label htmlFor="result-filter" className="sr-only">Filter audit results</label>
                <select id="result-filter" defaultValue="all" aria-label="Result severity">
                  <option value="all">All statuses</option>
                  <option value="issues">Issues only</option>
                  <option value="fail">FAIL</option>
                  <option value="warning">WARNING</option>
                  <option value="blocked">BLOCKED</option>
                  <option value="not-run">NOT RUN</option>
                  <option value="pass">PASS</option>
                </select>
                <label htmlFor="result-sort" className="sr-only">Sort findings</label>
                <select id="result-sort" defaultValue="newest" aria-label="Sort findings">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="severity">Failures first</option>
                </select>
                <Input id="result-query" type="search" placeholder="Search SKU, URL or test ID"
                  leftIcon={<Search size={16}/>} className="results-search"
                  classNames={{field:"results-search-field",input:"results-search-text"}}/>
              </div>
            </div>
            <div id="findings" className="findings"/>
          </section>
        </main>
      </div>
      <BackToTop/>
    </div>
  );
}
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<App/>);
