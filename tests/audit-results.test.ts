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
  it('surfaces failures before hundreds of passes and supports search',()=>{
    const many=Array.from({length:600},(_,i)=>({id:'PASS-'+i,level:'pass' as const,summary:'OK'}));
    const results=selectFindings([...many, ...findings],'all','',5);
    expect(results.visible[0]?.id).toBe('PCL-3');
    expect(results.matched).toBe(603);
    expect(selectFindings([...many,...findings],'issues','',5).matched).toBe(2);
    expect(selectFindings(findings,'all','de-8').visible.map(f=>f.id)).toEqual(['PCL-3']);
    expect(selectFindings(findings,'warning','').visible.map(f=>f.id)).toEqual(['PCL-2']);
  });
});
