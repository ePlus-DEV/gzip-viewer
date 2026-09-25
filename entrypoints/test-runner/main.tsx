import {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity, ArrowUpRight, Bot, CheckCircle2, Download, FileCode2,
  Globe2, Layers2, Play, Radar, Search, ShieldCheck, Square, Sparkles} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {initializeAuditRunner} from './logic';
import '../../assets/beui.css';
import './style.css';

function App() {
  useEffect(() => { initializeAuditRunner(); }, []);
  return (
    <div className="audit-shell">
      <header className="audit-header">
        <div className="audit-logo"><span className="logo-mark"><Radar size={22}/></span>
          <span><strong>SEO <em>&amp;</em> AEO Auditor</strong><small>Website quality workspace</small></span>
        </div>
        <div className="audit-header-actions">
          <AnimatedBadge status="info" size="sm" showIcon={false}>beUI powered</AnimatedBadge>
          <a id="browse" className="explore-nav" href="#" aria-label="Open resource explorer in the extension">
            <Layers2 size={16}/> Resource Explorer <ArrowUpRight size={14}/>
          </a>
        </div>
      </header>

      <div className="audit-layout">
        <aside className="audit-sidebar">
          <div className="sidebar-title">WORKSPACE</div>
          <div className="sidebar-active"><Activity size={16}/> Audit dashboard</div>
          <div className="sidebar-feature"><Globe2 size={16}/> Website resources</div>
          <div className="sidebar-divider"/>
          <div className="sidebar-title">ABOUT THIS AUDIT</div>
          <p>Every check includes a result, a reference and a path back to its source.</p>
          <div className="sidebar-info"><ShieldCheck size={17}/>
            <span>Site data is fetched using your current Chrome session. No external uploads.</span>
          </div>
          <div className="sidebar-credit">SEO &amp; AEO Auditor <span>v1.6</span></div>
        </aside>

        <main className="audit-content">
          <div className="page-eyebrow"><Sparkles size={14}/> AUDIT WORKSPACE</div>
          <div className="page-head">
            <div><h1>Website audit</h1>
              <p>Choose an audit mode, set your scope and run live checks right in Chrome.</p>
            </div>
            <AnimatedBadge status="success" size="md">Ready to audit</AnimatedBadge>
          </div>

          <section className="panel configuration-panel" aria-labelledby="mode-heading">
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
            <label htmlFor="site" className="input-label">Website URL</label>
            <div className="url-field"><Globe2 size={17}/>
              <input id="site" type="url" placeholder="https://example.com" autoComplete="url" required/>
            </div>
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
              <Button id="run" size="lg" className="rounded-xl audit-run"><Play size={16} fill="currentColor"/> Run Tests</Button>
              <Button id="stop" variant="outline" size="lg" className="rounded-xl" disabled>
                <Square size={15}/> Stop
              </Button>
              <Button id="export" variant="outline" size="lg" className="rounded-xl" disabled>
                <Download size={16}/> Export JSON
              </Button>
            </div>
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
            <div className="totals">
              <div className="stat passed"><strong id="passed">0</strong><span>PASS</span></div>
              <div className="stat failed"><strong id="failed">0</strong><span>FAIL</span></div>
              <div className="stat warnings"><strong id="warnings">0</strong><span>WARNING</span></div>
              <div className="stat blocked"><strong id="blocked">0</strong><span>BLOCKED</span></div>
              <div className="stat notrun"><strong id="notrun">0</strong><span>NOT RUN</span></div>
            </div>
            <div id="findings" className="findings"/>
          </section>
        </main>
      </div>
    </div>
  );
}
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<App/>);
