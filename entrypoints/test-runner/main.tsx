import {useEffect, useState} from 'react';
import {browser} from 'wxt/browser';
import {createRoot} from 'react-dom/client';
import {Activity, ArrowUpRight, Bot, CheckCircle2, Download, FileCode2,
  Globe2, Layers2, Play, Radar, Search, ShieldCheck, Square, Sparkles,
  BellRing, Clock3, Hourglass, CalendarClock, SlidersHorizontal, RotateCcw,
  PanelLeft} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {Input} from '../../components/beui/input';
import {Switch} from '../../components/beui/switch';
import {
  AnimatedSidebar, AnimatedSidebarContent, AnimatedSidebarFooter,
  AnimatedSidebarGroup, AnimatedSidebarGroupContent, AnimatedSidebarGroupLabel,
  AnimatedSidebarInset, AnimatedSidebarMenu, AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem, AnimatedSidebarProvider, AnimatedSidebarRail,
  AnimatedSidebarTrigger,
} from '../../components/beui/animated-sidebar';
import {LegacyBoundSelect, SelectField} from '../../components/SelectField';
import {RadioGroup, RadioGroupItem} from '../../components/beui/radio';
import {BouncyAccordion} from '../../components/beui/bouncy-accordion';
import {initializeAuditRunner} from './logic';
import {COMPLETION_NOTIFICATION_KEY} from '../../lib/audit-notifications';
import {
  AUDIT_CONFIG_EVENT, AUDIT_CONFIG_STORAGE_KEY, DEFAULT_AUDIT_CONFIG,
  normalizeAuditConfig, normalizeExpectedLanguages, type AuditValidationConfig,
} from '../../lib/audit-config';
import {BackToTop} from '../../components/BackToTop';
import '../../assets/beui.css';
import './style.css';

function App() {
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const params = new URLSearchParams(location.search);
  const initialSite = params.get('url') || '';
  const initialMode = params.get('mode') === 'seo' ? 'seo' : 'aeo';
  const [site, setSite] = useState(initialSite);
  const [auditModeUi,setAuditModeUi] = useState<'aeo'|'seo'>(initialMode);
  const [startupError, setStartupError] = useState('');
  const [runState,setRunState] = useState({running:false,hasReport:false});
  const [validationConfig,setValidationConfig] = useState<AuditValidationConfig>(DEFAULT_AUDIT_CONFIG);
  const [expectedLanguagesText,setExpectedLanguagesText] = useState('');
  const [validationError,setValidationError] = useState('');
  useEffect(()=>{
    const handler=(event:Event)=> {
      const update=(event as CustomEvent<{running:boolean;hasReport:boolean}>).detail;
      if(update) setRunState(update);
    };
    window.addEventListener('audit:run-state',handler);
    return ()=>window.removeEventListener('audit:run-state',handler);
  },[]);
  useEffect(() => {
    let alive=true;
    void browser.storage.local.get(AUDIT_CONFIG_STORAGE_KEY).then(stored=>{
      if(!alive)return;
      const next=normalizeAuditConfig(stored[AUDIT_CONFIG_STORAGE_KEY]);
      setValidationConfig(next);
      setExpectedLanguagesText(next.expectedLanguages.join(', '));
      window.dispatchEvent(new CustomEvent(AUDIT_CONFIG_EVENT,{detail:next}));
    }).catch(()=>{
      if(alive)setValidationError('Cannot read saved validation settings.');
    });
    return ()=>{alive=false;};
  },[]);
  function saveValidationConfig(next: AuditValidationConfig) {
    const normalized=normalizeAuditConfig(next);
    setValidationConfig(normalized);
    window.dispatchEvent(new CustomEvent(AUDIT_CONFIG_EVENT,{detail:normalized}));
    void browser.storage.local.set({[AUDIT_CONFIG_STORAGE_KEY]:normalized})
      .then(()=>setValidationError(''))
      .catch(()=>setValidationError('Could not save validation settings.'));
  }
  function updateAeo<K extends keyof AuditValidationConfig['aeo']>(
    key:K,value:AuditValidationConfig['aeo'][K],
  ){
    saveValidationConfig({...validationConfig,aeo:{...validationConfig.aeo,[key]:value}});
  }
  function updateSeo<K extends keyof AuditValidationConfig['seo']>(
    key:K,value:AuditValidationConfig['seo'][K],
  ){
    saveValidationConfig({...validationConfig,seo:{...validationConfig.seo,[key]:value}});
  }
  function resetValidationConfig(){
    setExpectedLanguagesText('');
    saveValidationConfig(DEFAULT_AUDIT_CONFIG);
  }
  useEffect(()=>{
    const radios=Array.from(document.querySelectorAll<HTMLInputElement>(
      '.beui-native-radio-bridge input[name="audit-mode"]',
    ));
    const sync=()=>{
      const checked=radios.find(input=>input.checked)?.value;
      if(checked==='aeo'||checked==='seo')setAuditModeUi(checked);
    };
    radios.forEach(input=>input.addEventListener('change',sync));
    sync();
    return ()=>radios.forEach(input=>input.removeEventListener('change',sync));
  },[]);
  function changeAuditMode(next:'aeo'|'seo'){
    setAuditModeUi(next);
    const input=document.querySelector<HTMLInputElement>(
      '.beui-native-radio-bridge input[name="audit-mode"][value="'+next+'"]',
    );
    if(input){
      input.checked=true;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
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

      <AnimatedSidebarProvider className="audit-layout">
        <AnimatedSidebar ariaLabel="Audit workspace" collapsible="icon"
          className="audit-beui-sidebar" panelClassName="audit-sidebar-panel">
          <AnimatedSidebarContent className="audit-sidebar-content">
            <AnimatedSidebarGroup>
              <AnimatedSidebarGroupLabel>Workspace</AnimatedSidebarGroupLabel>
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  <AnimatedSidebarMenuItem>
                    <AnimatedSidebarMenuButton href="#audit-config" isActive
                      icon={<Activity size={17}/>}>Audit dashboard</AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                  <AnimatedSidebarMenuItem>
                    <span id="sidebar-browse-slot">
                      <AnimatedSidebarMenuButton href="#audit-config"
                        icon={<Globe2 size={17}/>}>Website resources</AnimatedSidebarMenuButton>
                    </span>
                  </AnimatedSidebarMenuItem>
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
            <AnimatedSidebarGroup className="sidebar-about-group">
              <AnimatedSidebarGroupLabel>About this audit</AnimatedSidebarGroupLabel>
              <AnimatedSidebarGroupContent className="sidebar-about-copy">
                <p>Every check includes a result, a reference and a path back to its source.</p>
                <div className="sidebar-info"><ShieldCheck size={17}/>
                  <span>Site data is fetched using your current Chrome session. No external uploads.</span>
                </div>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          </AnimatedSidebarContent>
          <AnimatedSidebarFooter className="audit-sidebar-footer">
            <span className="sidebar-version-mark">SA</span>
            <span className="sidebar-version-copy">SEO &amp; AEO Auditor <small>v1.12.0</small></span>
          </AnimatedSidebarFooter>
          <AnimatedSidebarRail/>
        </AnimatedSidebar>

        <AnimatedSidebarInset className="audit-content audit-inset">
          <div className="workspace-mobile-trigger">
            <AnimatedSidebarTrigger aria-label="Open workspace navigation"><PanelLeft size={16}/></AnimatedSidebarTrigger>
            <span>Workspace</span>
          </div>
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
            <div id="audit-modes">
              <div className="beui-native-radio-bridge" aria-hidden="true">
                <input type="radio" name="audit-mode" value="aeo" defaultChecked={initialMode==='aeo'} tabIndex={-1}/>
                <input type="radio" name="audit-mode" value="seo" defaultChecked={initialMode==='seo'} tabIndex={-1}/>
              </div>
              <RadioGroup value={auditModeUi} onValueChange={value=>changeAuditMode(value as 'aeo'|'seo')}
                orientation="horizontal" className="mode-cards">
                <RadioGroupItem value="aeo" className="mode-card"
                  label={<>
                    <span className="card-icon aeo"><Bot size={21}/></span>
                    <span className="mode-desc"><strong>AEO Audit</strong>
                      <small>LLMS, agent instructions, product feed and multilingual data</small>
                      <span className="mode-tags">llms.txt · agents.md · JSONL.GZ</span>
                    </span>
                  </>}/>
                <RadioGroupItem value="seo" className="mode-card"
                  label={<>
                    <span className="card-icon seo"><Search size={21}/></span>
                    <span className="mode-desc"><strong>SEO Audit</strong>
                      <small>Technical indexing, sitemap health and product metadata</small>
                      <span className="mode-tags">robots.txt · XML · JSON-LD</span>
                    </span>
                  </>}/>
              </RadioGroup>
            </div>
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
              <LegacyBoundSelect id="scope" label="Scan scope" defaultValue="quick"
                options={[
                  {value:'quick',label:'⚡ Quick — representative sample'},
                  {value:'full',label:'◈ Full — published resources (safety caps)'},
                ]}/>
              <LegacyBoundSelect id="reference" label="Reference language" defaultValue="en"
                className="aeo-only" options={[{value:'en',label:'en (default)'}]}/>
              <LegacyBoundSelect id="links" label="Links from llms.txt" defaultValue="15"
                className="aeo-only" options={[
                  {value:'15',label:'First 15 links'},
                  {value:'50',label:'First 50 links'},
                  {value:'0',label:'All published links'},
                ]}/>
            </div>
            <BouncyAccordion
              items={[{
                id:'checks',
                icon:<FileCode2 size={16}/>,
                title:<span>Checks in <span id="checklist-mode">AEO</span> mode</span>,
                description:<ul id="mode-checks"/>,
              }]}
              className="checklist beui-accordion"
              classNames={{item:'checklist-item',trigger:'checklist-trigger',description:'checklist-description'}}
            />
            <BouncyAccordion
              items={[{
                id:'validation',
                icon:<SlidersHorizontal size={16}/>,
                title:<span className="validation-accordion-title"><strong>Validation settings</strong><small>Saved locally and included in exported reports.</small></span>,
                description:<div className="validation-config-body">
                <div className="validation-config-head">
                  <div>
                    <strong>Policy overrides</strong>
                    <small>Leave expected languages empty to auto-detect published languages.</small>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="validation-reset"
                    onClick={resetValidationConfig}><RotateCcw size={14}/> Reset defaults</Button>
                </div>
                <div className="validation-grid shared-validation">
                  <Input id="expected-languages" label="Expected languages"
                    value={expectedLanguagesText}
                    onChange={value=>setExpectedLanguagesText(value)}
                    onBlur={()=>{
                      const languages=normalizeExpectedLanguages(expectedLanguagesText);
                      setExpectedLanguagesText(languages.join(', '));
                      saveValidationConfig({...validationConfig,expectedLanguages:languages});
                    }}
                    placeholder="en, de, fr, it"/>
                </div>

                <div className="validation-mode-block aeo-only">
                  <div className="validation-mode-title"><Bot size={16}/><span>AEO validation</span></div>
                  <div className="validation-grid">
                    <Input id="aeo-freshness" type="number" min="0" max="720"
                      label="Feed freshness (hours)"
                      value={String(validationConfig.aeo.feedFreshnessHours)}
                      onChange={value=>updateAeo('feedFreshnessHours',Number(value))}/>
                    <Input id="aeo-max-shard" type="number" min="1000" max="500000"
                      label="Max records / shard"
                      value={String(validationConfig.aeo.maxRecordsPerShard)}
                      onChange={value=>updateAeo('maxRecordsPerShard',Number(value))}/>
                    <SelectField label="GTIN policy" value={validationConfig.aeo.gtinPolicy}
                      onValueChange={value=>updateAeo('gtinPolicy',value as AuditValidationConfig['aeo']['gtinPolicy'])}
                      options={[
                        {value:'eligible',label:'Eligible products only'},
                        {value:'all',label:'All products'},
                        {value:'off',label:'Do not validate GTIN'},
                      ]}/>
                    <SelectField label="Parts compatibility" value={validationConfig.aeo.partsCompatibility}
                      onValueChange={value=>updateAeo('partsCompatibility',value as AuditValidationConfig['aeo']['partsCompatibility'])}
                      options={[
                        {value:'required',label:'Required'},
                        {value:'recommended',label:'Recommended'},
                        {value:'off',label:'Disabled'},
                      ]}/>
                  </div>
                  <p className="validation-help">Set freshness to 0 to disable age checks. Quick mode still samples compatibility files; Full mode can prove complete SKU coverage.</p>
                </div>

                <div className="validation-mode-block seo-only hidden">
                  <div className="validation-mode-title"><Search size={16}/><span>SEO validation</span></div>
                  <div className="validation-grid">
                    <Input id="seo-quick-pages" type="number" min="1" max="200"
                      label="Quick page cap"
                      value={String(validationConfig.seo.quickPageLimit)}
                      onChange={value=>updateSeo('quickPageLimit',Number(value))}/>
                    <Input id="seo-full-pages" type="number" min="1" max="5000"
                      label="Full page cap"
                      value={String(validationConfig.seo.fullPageLimit)}
                      onChange={value=>updateSeo('fullPageLimit',Number(value))}/>
                    <Input id="seo-lastmod-days" type="number" min="0" max="3650"
                      label="Sitemap lastmod age (days)"
                      value={String(validationConfig.seo.sitemapLastmodMaxAgeDays)}
                      onChange={value=>updateSeo('sitemapLastmodMaxAgeDays',Number(value))}/>
                    {([
                      ['canonical','Canonical'],
                      ['meta','Title + meta description'],
                      ['hreflang','hreflang'],
                      ['productJsonLd','Product JSON-LD'],
                    ] as const).map(([key,label])=>(
                      <SelectField key={key} label={label} value={validationConfig.seo[key]}
                        onValueChange={value=>updateSeo(key,value as AuditValidationConfig['seo'][typeof key])}
                        options={[
                          {value:'required',label:'Required → FAIL'},
                          {value:'recommended',label:'Recommended → WARNING'},
                          {value:'off',label:'Disabled'},
                        ]}/>
                    ))}
                  </div>
                  <p className="validation-help">Sitemap lastmod age is optional; 0 disables it. Expected languages are also used to validate hreflang coverage.</p>
                </div>
                {validationError && <p className="notification-setting-error" role="alert">{validationError}</p>}
              </div>,
              }]}
              className="validation-config beui-accordion"
              classNames={{item:'validation-accordion-item',trigger:'validation-accordion-trigger',description:'validation-accordion-description'}}
            />
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
                <LegacyBoundSelect id="result-filter" defaultValue="all"
                  ariaLabel="Result severity" className="result-select"
                  options={[
                    {value:'all',label:'All statuses'},
                    {value:'issues',label:'Issues only'},
                    {value:'fail',label:'FAIL'},
                    {value:'warning',label:'WARNING'},
                    {value:'blocked',label:'BLOCKED'},
                    {value:'not-run',label:'NOT RUN'},
                    {value:'pass',label:'PASS'},
                  ]}/>
                <LegacyBoundSelect id="result-sort" defaultValue="newest"
                  ariaLabel="Sort findings" className="result-select"
                  options={[
                    {value:'newest',label:'Newest first'},
                    {value:'oldest',label:'Oldest first'},
                    {value:'severity',label:'Failures first'},
                  ]}/>
                <Input id="result-query" type="search" placeholder="Search SKU, URL or test ID"
                  leftIcon={<Search size={16}/>} className="results-search"
                  classNames={{field:"results-search-field",input:"results-search-text"}}/>
              </div>
            </div>
            <div id="findings" className="findings"/>
          </section>
        </AnimatedSidebarInset>
      </AnimatedSidebarProvider>
      <BackToTop/>
    </div>
  );
}
const mount = document.getElementById('app');
if (mount) createRoot(mount).render(<App/>);
