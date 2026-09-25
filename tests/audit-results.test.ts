import {describe,expect,it} from 'vitest';
import {isAuditComplete,selectFindings} from '../lib/audit-results';
describe('live audit results and completion',()=>{
  const findings=[
    {id:'PCL-1',level:'pass' as const,summary:'Healthy'},
    {id:'PCL-2',level:'warning' as const,summary:'Check translation',url:'https://example.com/de'},
    {id:'PCL-3',level:'fail' as const,summary:'SKU mismatch',detail:'SKU 1234 de-8'},
  ];
  it('requires the terminal stage and disallows interrupted runs',()=>{
    expect(isAuditComplete(100,false,findings)).toBe(true);
    expect(isAuditComplete(75,false,findings)).toBe(false);
    expect(isAuditComplete(100,true,findings)).toBe(false);
    expect(isAuditComplete(100,false,[...findings,{id:'SEO-RUN-ERROR',level:'fail',summary:'Crash'}])).toBe(false);
  });
  it('supports filtering, finding prioritization and text search',()=>{
    const many=Array.from({length:600},(_,i)=>({id:'PASS-'+i,level:'pass' as const,summary:'OK'}));
    const results=selectFindings([...many, ...findings],'all','',5,'severity');
    expect(results.visible[0]?.id).toBe('PCL-3');
    expect(results.matched).toBe(603);
    expect(selectFindings([...many,...findings],'issues','',5).matched).toBe(2);
    expect(selectFindings(findings,'all','de-8').visible.map(f=>f.id)).toEqual(['PCL-3']);
    expect(selectFindings(findings,'warning','').visible.map(f=>f.id)).toEqual(['PCL-2']);
  });
  it('defaults to newest first even when the newest event is a PASS',()=>{
    const run=[
      {id:'early-failure',level:'fail' as const,summary:'Bad first shard'},
      {id:'middle-warning',level:'warning' as const,summary:'Metadata warning'},
      {id:'latest-success',level:'pass' as const,summary:'Newest file checked'},
    ];
    expect(selectFindings(run,'all','').visible.map(x=>x.id))
      .toEqual(['latest-success','middle-warning','early-failure']);
    expect(selectFindings(run,'all','',250,'oldest').visible.map(x=>x.id))
      .toEqual(['early-failure','middle-warning','latest-success']);
    expect(selectFindings(run,'all','',250,'severity').visible.map(x=>x.id))
      .toEqual(['early-failure','middle-warning','latest-success']);
    expect(selectFindings(run,'issues','',250,'newest').visible.map(x=>x.id))
      .toEqual(['middle-warning','early-failure']);
  });
  it('new findings must remain visible beyond the old 250-row render cap',()=>{
    const items=Array.from({length:700},(_,i)=>({
      id:'CHECK-'+i,level:'pass' as const,summary:'Completed '+i,
    }));
    const results=selectFindings(items,'all','',250);
    expect(results.matched).toBe(700);
    expect(results.visible).toHaveLength(250);
    expect(results.visible[0]?.id).toBe('CHECK-699');
    expect(results.visible.at(-1)?.id).toBe('CHECK-450');
    expect(selectFindings(items,'all','',250,'oldest').visible[0]?.id).toBe('CHECK-0');
  });
});
