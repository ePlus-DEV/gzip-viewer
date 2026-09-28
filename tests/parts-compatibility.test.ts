import {describe,expect,it} from 'vitest';
import {auditCompatibilityIndex,auditCompatibilityShard,compatibilityDocumentKind,compatibilityMetadataIssues} from '../lib/parts-compatibility';

describe('parts compatibility v2 index',()=>{
  const index={schema_version:'1.0',updated_at:'2026-09-28T04:08:05Z',total_models:659,files:[
    {url:'https://example.com/feeds/parts-compatibility-honda.json.gz',make:'HONDA',page:1},
  ]};
  it('reads manufacturer/page files without assuming language shards',()=>{
    expect(compatibilityDocumentKind(index)).toBe('index');
    const a=auditCompatibilityIndex(index,'https://example.com/feeds/parts-compatibility.json.gz');
    expect(a.issues).toEqual([]); expect(a.totalModels).toBe(659);
    expect(a.files[0]).toEqual({url:'https://example.com/feeds/parts-compatibility-honda.json.gz',make:'HONDA',page:1});
  });
  it('detects duplicate make/page and unsafe URLs',()=>{
    const a=auditCompatibilityIndex({...index,files:[index.files[0],{url:'https://example.com/honda-2.json.gz',make:'HONDA',page:1},{url:'javascript:bad',make:'YAMAHA',page:1}]},'https://example.com/feeds/parts-compatibility.json.gz');
    expect(a.issues.some(x=>x.message.includes('Duplicate make/page'))).toBe(true);
    expect(a.issues.some(x=>x.message.includes('HTTP(S)'))).toBe(true);
  });
});

describe('parts compatibility manufacturer shard',()=>{
  const shard={schema_version:'1.0',type:'parts-compatibility',manufacturer:'HONDA',vehicle_count:2,page:1,updated_at:'2026-09-28T04:08:05Z',vehicles:[
    {vehicle:{model_code:'286',make:'HONDA',model:'RVF750',engine_cc:750},fitments:[
      {year_status:'unknown',fitment_info:'94-95 520 Convert.',compatible_skus:['20397336','20397414']},
      {year_status:'known',year_start:2019,year_end:2021,fitment_info:'2019-2021',compatible_skus:['50000279939']},
    ]},
    {vehicle:{model_code:'6056',make:'HONDA',model:'DAX70 (ST70)',engine_cc:70},fitments:[{year_status:'unknown',compatible_skus:['24105458']}]},
  ]};
  it('validates nested vehicle/fitment/SKU data',()=>{
    expect(compatibilityDocumentKind(shard)).toBe('shard');
    const a=auditCompatibilityShard(shard);
    expect(a.issues).toEqual([]); expect(a.vehicles).toHaveLength(2);
    expect(a.fitmentCount).toBe(3); expect(a.compatibleSkuRefs).toBe(4);
    expect(a.uniqueCompatibleSkus).toEqual(['20397336','20397414','50000279939','24105458']);
  });
  it('checks count, manufacturer/page and known year ranges',()=>{
    const a=auditCompatibilityShard({...shard,vehicle_count:9,vehicles:[{vehicle:{model_code:'286',make:'YAMAHA',model:'RVF750',engine_cc:750},fitments:[{year_status:'known',year_start:2022,year_end:2020,compatible_skus:['1']}]}]});
    expect(a.issues.some(x=>x.message.includes('vehicle_count'))).toBe(true);
    expect(a.issues.some(x=>x.message.includes('differs from manufacturer'))).toBe(true);
    expect(a.issues.some(x=>x.message.includes('year_start is after'))).toBe(true);
    expect(compatibilityMetadataIssues(a,{url:'https://example.com/honda.json.gz',make:'HONDA',page:2}).some(x=>x.message.includes('page'))).toBe(true);
  });
});
