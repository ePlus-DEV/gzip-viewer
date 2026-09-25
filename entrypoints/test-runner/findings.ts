import {browser} from 'wxt/browser';
import {httpUrl} from '../../lib/feed';
import {selectFindings, type Filter, type FindingLike} from '../../lib/audit-results';

export function createFindingList(
  container:HTMLElement,
  filter:HTMLSelectElement,
  query:HTMLInputElement,
  summary:HTMLElement,
  limit=250,
) {
  let source:readonly FindingLike[]=[];
  let pending=false;

  function rerender():void {
    const {visible,matched}=selectFindings(source,filter.value as Filter,query.value,limit);
    summary.textContent=visible.length===matched
      ? matched+' matching checks'
      : 'Showing '+visible.length+' / '+matched+' checks. Narrow the filter or search to see more.';
    const fragment=document.createDocumentFragment();
    for(const item of visible){
      const card=document.createElement('article');card.className='test';
      const header=document.createElement('div');header.className='headline';
      const badge=document.createElement('span');badge.className='status '+item.level;
      badge.textContent=item.level.toUpperCase();
      const id=document.createElement('span');id.className='id';id.textContent=item.id;
      const title=document.createElement('strong');title.textContent=item.summary;
      header.append(badge,id,title);card.append(header);
      if(item.detail){
        const explanation=document.createElement('span');
        explanation.className='detail';explanation.textContent=item.detail.slice(0,900);
        card.append(explanation);
      }
      if(item.url){
        try{
          const uri=httpUrl(item.url);
          const link=document.createElement('a');
          link.href=browser.runtime.getURL('/viewer.html')+'?url='+encodeURIComponent(uri.href);
          link.target='_blank';link.rel='noopener noreferrer';
          link.textContent='Inspect resource ↗';card.append(link);
        }catch{/* Invalid audit links stay as text in the report. */}
      }
      fragment.append(card);
    }
    container.replaceChildren(fragment);
  }

  function schedule(items:readonly FindingLike[]):void{
    source=items;
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{pending=false;rerender();});
  }
  filter.addEventListener('change',rerender);
  query.addEventListener('input',rerender);
  return {schedule,rerender};
}
