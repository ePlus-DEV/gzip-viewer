export type FindingLevel='pass'|'fail'|'warning'|'blocked'|'not-run';
export interface FindingLike{ id:string; level:FindingLevel; summary:string; detail?:string; url?:string }
export type Filter='all'|'issues'|'fail'|'warning'|'blocked'|'not-run'|'pass';
export type FindingSort='newest'|'oldest'|'severity';
const priority: Record<FindingLevel,number> = {
  fail:0, blocked:1, warning:2, 'not-run':3, pass:4,
};

export function isAuditComplete(progress:number,stopped:boolean,findings:readonly FindingLike[]):boolean{
  return progress>=100 && !stopped && !findings.some(f=>/(?:^|-)RUN-ERROR$/.test(f.id));
}
export function selectFindings<T extends FindingLike>(
  findings:readonly T[],filter:Filter,query:string,max=250,sort:FindingSort='newest',
):{visible:T[];matched:number}{
  const needle=query.trim().toLocaleLowerCase();
  const indexed=findings.map((item,index)=>({item,index})).filter(({item})=>{
    if(filter==='issues'&&item.level==='pass')return false;
    if(filter!=='all'&&filter!=='issues'&&item.level!==filter)return false;
    return !needle || [item.id,item.summary,item.detail,item.url].some(part=>
      part?.toLocaleLowerCase().includes(needle));
  });
  // Source array is append-only execution order. Most recent findings should
  // appear first while auditing; users may explicitly select severity/oldest.
  if(sort==='oldest') indexed.sort((a,b)=>a.index-b.index);
  else if(sort==='severity') indexed.sort((a,b)=>
    priority[a.item.level]-priority[b.item.level] || b.index-a.index);
  else indexed.sort((a,b)=>b.index-a.index);
  return {visible:indexed.slice(0,max).map(x=>x.item),matched:indexed.length};
}
