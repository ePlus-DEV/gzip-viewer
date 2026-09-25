import {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft, ChevronRight, Compass, House, Layers3, Play, Radar, RotateCw, Search} from 'lucide-react';
import {Button} from '../../components/beui/button';
import {AnimatedBadge} from '../../components/beui/animated-badge';
import {Input} from '../../components/beui/input';
import {initializeViewer} from './logic';
import {BackToTop} from '../../components/BackToTop';
import '../../assets/beui.css';
import './style.css';

function Explorer() {
  useEffect(() => { initializeViewer(); }, []);
  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-brand">
          <span className="viewer-logo"><img src="/icon-48.png" alt="" width={38} height={38}/></span>
          <span><strong>SEO <em>&amp;</em> AEO Auditor</strong><small>Resource Explorer</small></span>
          <AnimatedBadge status="neutral" size="sm" showIcon={false}>Browse</AnimatedBadge>
        </div>
        <div className="viewer-controls">
          <Input id="search" type="search" placeholder="Search records, URLs or shards…"
            aria-label="Search resources" leftIcon={<Search size={17}/>}
            className="viewer-search" classNames={{field:"search-field",input:"viewer-search-input"}}/>
          <select id="limit" aria-label="Result display limit" defaultValue="500">
            <option value="100">100 results</option>
            <option value="500">500 results</option>
            <option value="1000">1,000 results</option>
            <option value="5000">5,000 results</option>
            <option value="0">All results</option>
          </select>
          <Button id="reload" variant="outline" className="rounded-lg viewer-action" size="sm">
            <RotateCw size={15}/> Reload
          </Button>
          <Button id="runTests" size="sm" className="rounded-lg viewer-action">
            <Play size={14} fill="currentColor"/> Run Tests
          </Button>
        </div>
      </header>
      <nav id="navigation" aria-label="Document navigation">
        <Button id="back" variant="ghost" size="sm" className="rounded-lg" disabled>
          <ArrowLeft size={15}/> Back
        </Button>
        <Button id="home" variant="ghost" size="sm" className="rounded-lg" disabled>
          <House size={15}/> Home
        </Button>
        <span className="breadcrumb-divider"/>
        <div id="breadcrumbs" aria-label="Breadcrumbs"><Compass size={15}/></div>
      </nav>
      <div id="explorer">
        <aside id="outline" aria-label="Resource tree">
          <div className="sidebar-label"><Layers3 size={16}/> RESOURCE TREE</div>
          <div id="tree"/>
          <div className="sidebar-help">
            <ChevronRight size={15}/> Select any link to explore related feeds, sitemaps or products. Use Back to return.
          </div>
        </aside>
        <div id="content">
          <div className="document-head">
            <div><div className="section-kicker">RESOURCE INSPECTOR</div>
              <h1>Resource inspector <span id="mode"/></h1>
            </div>
          </div>
          <div id="source"/>
          <div id="status" role="status" aria-live="polite">Loading document…</div>
          <section id="summary" aria-label="Document summary"/>
          <main id="items"/>
        </div>
      </div>
      <BackToTop/>
    </div>
  );
}
const root = document.getElementById('app');
if (root) createRoot(root).render(<Explorer/>);
