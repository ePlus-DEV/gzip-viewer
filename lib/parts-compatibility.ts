import {httpUrl, isRecord, type Issue} from './feed';

export interface CompatibilityFile { url:string; make:string; page:number }
export interface CompatibilityIndexAudit {
  schemaVersion:string|null; updatedAt:string|null; totalModels:number|null;
  files:CompatibilityFile[]; issues:Issue[];
}
export interface CompatibilityFitment {
  yearStatus:'known'|'unknown'|'invalid'; yearStart:number|null; yearEnd:number|null;
  fitmentInfo:string|null; compatibleSkus:string[];
}
export interface CompatibilityVehicle {
  modelCode:string; make:string; model:string; engineCc:number|null;
  fitments:CompatibilityFitment[];
}
export interface CompatibilityShardAudit {
  schemaVersion:string|null; type:string|null; manufacturer:string|null;
  vehicleCount:number|null; page:number|null; updatedAt:string|null;
  vehicles:CompatibilityVehicle[]; fitmentCount:number; compatibleSkuRefs:number;
  uniqueCompatibleSkus:string[]; issues:Issue[];
}
export type CompatibilityDocumentKind='index'|'shard'|null;

const textValue=(v:unknown):string|null=>typeof v==='string'&&v.trim()?v.trim():null;
const nonNegative=(v:unknown):number|null=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null;
const positive=(v:unknown):number|null=>Number.isSafeInteger(v)&&Number(v)>0?Number(v):null;
const timestamp=(v:unknown):string|null=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?v:null;
function versionIssue(v:string|null, issues:Issue[]):void {
  if(!v) issues.push({severity:'error',message:'schema_version is missing or invalid.'});
  else if(v!=='1.0') issues.push({severity:'warning',message:'Unrecognized schema_version '+v+'; validator targets 1.0.'});
}
export function compatibilityDocumentKind(value:unknown):CompatibilityDocumentKind {
  if(!isRecord(value)) return null;
  if(value.type==='parts-compatibility'&&Array.isArray(value.vehicles)) return 'shard';
  if(Array.isArray(value.files)&&Object.hasOwn(value,'total_models')) return 'index';
  return null;
}
export function auditCompatibilityIndex(value:unknown, source:string):CompatibilityIndexAudit {
  const issues:Issue[]=[];
  const result:CompatibilityIndexAudit={schemaVersion:null,updatedAt:null,totalModels:null,files:[],issues};
  if(!isRecord(value)){issues.push({severity:'error',message:'Compatibility index must be a JSON object.'});return result;}
  result.schemaVersion=textValue(value.schema_version); versionIssue(result.schemaVersion,issues);
  result.updatedAt=timestamp(value.updated_at);
  if(!result.updatedAt) issues.push({severity:'error',message:'updated_at is missing or is not a valid timestamp.'});
  result.totalModels=nonNegative(value.total_models);
  if(result.totalModels===null) issues.push({severity:'error',message:'total_models must be a non-negative integer.'});
  if(!Array.isArray(value.files)){issues.push({severity:'error',message:'files must be an array.'});return result;}
  const urls=new Set<string>(), makePages=new Set<string>();
  value.files.forEach((raw,i)=>{
    const label='File #'+(i+1);
    if(!isRecord(raw)){issues.push({severity:'error',message:label+' must be an object.'});return;}
    const make=textValue(raw.make), page=positive(raw.page);
    if(!make) issues.push({severity:'error',message:label+' make is missing.'});
    if(page===null) issues.push({severity:'error',message:label+' page must be a positive integer.'});
    let url:URL|null=null;
    if(typeof raw.url!=='string'||!raw.url.trim()) issues.push({severity:'error',message:label+' URL is missing.'});
    else try{url=httpUrl(raw.url,source);}catch{issues.push({severity:'error',message:label+' URL must be HTTP(S).'});}
    if(!url)return;
    if(urls.has(url.href)) issues.push({severity:'error',message:'Duplicate compatibility file URL: '+url.href});
    urls.add(url.href);
    if(!/\.json(?:\.gz)?$/i.test(url.pathname)) issues.push({severity:'warning',message:label+' URL does not look like JSON/GZIP JSON.'});
    if(make&&page!==null){
      const key=make.toUpperCase()+':'+page;
      if(makePages.has(key)) issues.push({severity:'error',message:'Duplicate make/page entry: '+make+' page '+page+'.'});
      makePages.add(key); result.files.push({url:url.href,make,page});
    }
  });
  if(result.totalModels===0&&result.files.length) issues.push({severity:'warning',message:'total_models is 0 while compatibility files are published.'});
  return result;
}
export function auditCompatibilityShard(value:unknown):CompatibilityShardAudit {
  const issues:Issue[]=[];
  const result:CompatibilityShardAudit={schemaVersion:null,type:null,manufacturer:null,vehicleCount:null,page:null,updatedAt:null,vehicles:[],fitmentCount:0,compatibleSkuRefs:0,uniqueCompatibleSkus:[],issues};
  if(!isRecord(value)){issues.push({severity:'error',message:'Compatibility shard must be a JSON object.'});return result;}
  result.schemaVersion=textValue(value.schema_version); versionIssue(result.schemaVersion,issues);
  result.type=textValue(value.type);
  if(result.type!=='parts-compatibility') issues.push({severity:'error',message:'type must be "parts-compatibility".'});
  result.manufacturer=textValue(value.manufacturer);
  if(!result.manufacturer) issues.push({severity:'error',message:'manufacturer is missing.'});
  result.vehicleCount=nonNegative(value.vehicle_count);
  if(result.vehicleCount===null) issues.push({severity:'error',message:'vehicle_count must be a non-negative integer.'});
  result.page=positive(value.page);
  if(result.page===null) issues.push({severity:'error',message:'page must be a positive integer.'});
  result.updatedAt=timestamp(value.updated_at);
  if(!result.updatedAt) issues.push({severity:'error',message:'updated_at is missing or invalid.'});
  if(!Array.isArray(value.vehicles)){issues.push({severity:'error',message:'vehicles must be an array.'});return result;}
  const models=new Set<string>(), allSkus=new Set<string>();
  value.vehicles.forEach((rawVehicle,vi)=>{
    const label='Vehicle #'+(vi+1);
    if(!isRecord(rawVehicle)){issues.push({severity:'error',message:label+' must be an object.'});return;}
    const meta=isRecord(rawVehicle.vehicle)?rawVehicle.vehicle:null;
    if(!meta){issues.push({severity:'error',message:label+' vehicle metadata is missing.'});return;}
    const modelCode=meta.model_code==null?'':String(meta.model_code).trim();
    const make=textValue(meta.make)??'', model=textValue(meta.model)??'';
    const engineCc=Number.isFinite(Number(meta.engine_cc))&&meta.engine_cc!==null&&meta.engine_cc!==''?Number(meta.engine_cc):null;
    if(!modelCode) issues.push({severity:'error',message:label+' model_code is missing.'});
    else {if(models.has(modelCode)) issues.push({severity:'error',message:'Duplicate model_code: '+modelCode+'.'});models.add(modelCode);}
    if(!make) issues.push({severity:'error',message:label+' make is missing.'});
    if(result.manufacturer&&make&&make.toUpperCase()!==result.manufacturer.toUpperCase()) issues.push({severity:'error',message:label+' make '+make+' differs from manufacturer '+result.manufacturer+'.'});
    if(!model) issues.push({severity:'error',message:label+' model is missing.'});
    if(engineCc===null||engineCc<0) issues.push({severity:'warning',message:label+' engine_cc is missing or invalid.'});
    const fitments:CompatibilityFitment[]=[];
    if(!Array.isArray(rawVehicle.fitments)) issues.push({severity:'error',message:label+' fitments must be an array.'});
    else rawVehicle.fitments.forEach((rawFitment,fi)=>{
      const fl=label+' fitment #'+(fi+1);
      if(!isRecord(rawFitment)){issues.push({severity:'error',message:fl+' must be an object.'});return;}
      const rs=textValue(rawFitment.year_status);
      const yearStatus:CompatibilityFitment['yearStatus']=rs==='known'||rs==='unknown'?rs:'invalid';
      if(yearStatus==='invalid') issues.push({severity:'error',message:fl+' year_status must be known or unknown.'});
      const yearStart=Number.isSafeInteger(rawFitment.year_start)?Number(rawFitment.year_start):null;
      const yearEnd=Number.isSafeInteger(rawFitment.year_end)?Number(rawFitment.year_end):null;
      if(yearStatus==='known'){
        if(yearStart===null||yearEnd===null) issues.push({severity:'error',message:fl+' known year_status requires year_start and year_end.'});
        else if(yearStart>yearEnd) issues.push({severity:'error',message:fl+' year_start is after year_end.'});
      } else if(yearStatus==='unknown'&&(yearStart!==null||yearEnd!==null)) issues.push({severity:'warning',message:fl+' has unknown year_status but also declares a year range.'});
      const fitmentInfo=rawFitment.fitment_info===undefined?null:typeof rawFitment.fitment_info==='string'?rawFitment.fitment_info:null;
      if(rawFitment.fitment_info!==undefined&&fitmentInfo===null) issues.push({severity:'warning',message:fl+' fitment_info should be a string when present.'});
      const compatibleSkus:string[]=[];
      if(!Array.isArray(rawFitment.compatible_skus)) issues.push({severity:'error',message:fl+' compatible_skus must be an array.'});
      else {
        const local=new Set<string>();
        for(const rawSku of rawFitment.compatible_skus){
          const sku=rawSku==null?'':String(rawSku).trim();
          if(!sku){issues.push({severity:'error',message:fl+' contains an empty SKU.'});continue;}
          if(local.has(sku)) issues.push({severity:'warning',message:fl+' contains duplicate SKU '+sku+'.'});
          local.add(sku); compatibleSkus.push(sku); allSkus.add(sku); result.compatibleSkuRefs++;
        }
        if(!compatibleSkus.length) issues.push({severity:'warning',message:fl+' has no compatible SKUs.'});
      }
      result.fitmentCount++; fitments.push({yearStatus,yearStart,yearEnd,fitmentInfo,compatibleSkus});
    });
    result.vehicles.push({modelCode,make,model,engineCc,fitments});
  });
  if(result.vehicleCount!==null&&result.vehicleCount!==value.vehicles.length) issues.push({severity:'error',message:'vehicle_count ('+result.vehicleCount+') differs from vehicles array length ('+value.vehicles.length+').'});
  result.uniqueCompatibleSkus=[...allSkus];
  return result;
}
export function compatibilityMetadataIssues(shard:CompatibilityShardAudit,file:CompatibilityFile):Issue[]{
  const issues:Issue[]=[];
  if(shard.manufacturer&&shard.manufacturer.toUpperCase()!==file.make.toUpperCase()) issues.push({severity:'error',message:'Shard manufacturer '+shard.manufacturer+' does not match index make '+file.make+'.'});
  if(shard.page!==null&&shard.page!==file.page) issues.push({severity:'error',message:'Shard page '+shard.page+' does not match index page '+file.page+'.'});
  return issues;
}
