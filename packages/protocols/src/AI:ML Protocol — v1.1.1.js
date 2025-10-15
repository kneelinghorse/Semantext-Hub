/*
 * AI/ML Protocol — v1.1.1 (stand-alone)
 * Minimal, self-describing ML model manifest + helpers
 *
 * Goals
 * - Mirror protocol family ergonomics: manifest + validate + query + diff + generate
 * - Add essentials: lifecycle, governance, training/eval metadata, cross-links
 * - Zero deps; stays lightweight
 */

// ————————————————————————————————————————————————————————————————
// Utilities
// ————————————————————————————————————————————————————————————————
function jsonCanon(v){ if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(jsonCanon).join(',')+']';
  const k=Object.keys(v).sort(); return '{'+k.map(x=>JSON.stringify(x)+':'+jsonCanon(v[x])).join(',')+'}'; }
function dget(o,p){ if(!p) return o; const parts=String(p).replace(/\[(\d+)\]/g,'.$1').split('.'); let cur=o; for(const k of parts){ if(cur==null) return; cur=cur[k]; } return cur; }
function dset(o,p,v){ const parts=String(p).split('.'); let cur=o; while(parts.length>1){ const k=parts.shift(); if(!(k in cur)||typeof cur[k]!=='object') cur[k]={}; cur=cur[k]; } cur[parts[0]]=v; }
const clone=x=>JSON.parse(JSON.stringify(x));
function hash(v){ const str=jsonCanon(v); let h=BigInt('0xcbf29ce484222325'); const p=BigInt('0x100000001b3'); for(let i=0;i<str.length;i++){ h^=BigInt(str.charCodeAt(i)); h=(h*p)&BigInt('0xFFFFFFFFFFFFFFFF'); } return 'fnv1a64-'+h.toString(16).padStart(16,'0'); }
const isURN=s=>typeof s==='string' && /^urn:proto:[a-z]+:[a-zA-Z0-9._-]+@[\d.]+/.test(s);

// ————————————————————————————————————————————————————————————————
// Manifest Shape
// ————————————————————————————————————————————————————————————————
/**
 * @typedef {Object} ModelManifest
 * @property {Object} model {id,name,type,version,framework}
 * @property {{status:'defined'|'training'|'deployed'|'serving'|'retired'}} [model.lifecycle]
 * @property {Object} training {data_urns:string[], method:string, hyperparams:Object}
 * @property {Object} evaluation {metrics:Object<string,number>, thresholds:Object<string,number>}
 * @property {Object} serving {endpoint?:string, batch?:boolean, latency_sla?:string}
 * @property {Object} governance {fairness?:string, bias?:string, pii?:boolean, compliance?:string[]}
 * @property {Object} relationships {consumes_events?:string[], produces_events?:string[], infra_host?:string}
 * @property {Object} contextCapabilities {tools?:Array<{name:string, inputSchema?:Object, outputSchema?:Object, urn?:string}>, resources?:Array<{uri:string, name?:string, mimeType?:string, urn?:string}>, prompts?:Array<{name:string, arguments?:Array<any>, urn?:string}>, sampling?:{enabled?:boolean, maxTokens?:number}}
 * @property {Object} metadata {owner?:string,tags?:string[]}
 */

// ————————————————————————————————————————————————————————————————
// Validator Registry
// ————————————————————————————————————————————————————————————————
const Validators=new Map();
function registerValidator(n,fn){ Validators.set(n,fn); }
function runValidators(m,sel=[]){ const names=sel.length?sel:Array.from(Validators.keys());
  const results=names.map(n=>({name:n,...(Validators.get(n)?.(m)||{ok:true})}));
  return {ok:results.every(r=>r.ok),results}; }

registerValidator('core.shape',m=>{
  const issues=[]; if(!m?.model?.id) issues.push({path:'model.id',msg:'required',level:'error'});
  if(!m?.model?.name) issues.push({path:'model.name',msg:'required',level:'error'});
  if(!['defined','training','deployed','serving','retired'].includes(m?.model?.lifecycle?.status||'defined'))
    issues.push({path:'model.lifecycle.status',msg:'invalid status',level:'error'});
  if(!Array.isArray(m?.training?.data_urns)||m.training.data_urns.length===0)
    issues.push({path:'training.data_urns',msg:'at least one training dataset URN required',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('evaluation.thresholds',m=>{
  const issues=[]; const mets=m?.evaluation?.metrics||{}; const th=m?.evaluation?.thresholds||{};
  for(const [k,v] of Object.entries(th)){ if(mets[k]!=null && mets[k]<v) issues.push({path:`evaluation.metrics.${k}`,msg:`metric '${k}' below threshold ${v}`,level:'warn'}); }
  return {ok:issues.length===0,issues};
});

registerValidator('governance.policy',m=>{
  const issues=[]; if(m.governance?.pii && !m.governance?.fairness) issues.push({path:'governance.fairness',msg:'PII models should declare fairness policy',level:'warn'});
  return {ok:issues.length===0,issues};
});

registerValidator('context.capabilities', m => {
  const issues=[]; const cc=m?.contextCapabilities; if(!cc) return {ok:true};
  for(const [i,t] of (cc.tools||[]).entries()) if(!t.name) issues.push({path:`contextCapabilities.tools[${i}].name`, msg:'name required', level:'error'});
  for(const [i,r] of (cc.resources||[]).entries()) if(!r.uri) issues.push({path:`contextCapabilities.resources[${i}].uri`, msg:'uri required', level:'error'});
  return { ok:issues.length===0, issues };
});

// ————————————————————————————————————————————————————————————————
// Query + Diff
// ————————————————————————————————————————————————————————————————
function query(m,expr){ const [rawPath,op,...rest]=String(expr).split(':'); const rhs=rest.join(':'); if(!rawPath||!op) return false;
  const lhs=dget(m,rawPath.replace(/\[(\d+)\]/g,'.$1')); switch(op){
    case ':=:': return String(lhs)===rhs; case 'contains': return String(lhs??'').includes(rhs);
    case '>': return Number(lhs)>Number(rhs); case '<': return Number(lhs)<Number(rhs);
    case '>=': return Number(lhs)>=Number(rhs); case '<=': return Number(lhs)<=Number(rhs);
    default: return false; } }

function normalize(m){ const n=clone(m||{}); n.sig_hash=hash({id:n.model?.id,type:n.model?.type,fw:n.model?.framework,train:n.training,eval:n.evaluation,context:n.contextCapabilities}); n.gov_hash=hash(n.governance||{}); return n; }
function diff(a,b){ const A=normalize(a),B=normalize(b); const changes=[]; (function walk(p,va,vb){ if(JSON.stringify(va)===JSON.stringify(vb)) return;
  const isObj=v=>v&&typeof v==='object'; if(!isObj(va)||!isObj(vb)){ changes.push({path:p,from:va,to:vb}); return; }
  const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(p?`${p}.${k}`:k,va?.[k],vb?.[k]); })('',A,B);
  const breaking=[],significant=[]; for(const c of changes){ if(c.path==='sig_hash') breaking.push({...c,reason:'model signature changed'}); if(c.path==='gov_hash') significant.push({...c,reason:'governance changed'}); }
  return {changes,breaking,significant}; }

// ————————————————————————————————————————————————————————————————
// Generators
// ————————————————————————————————————————————————————————————————
function generateTrainingPipeline(m){
  return `# Training pipeline for ${m.model?.name}
datasets: ${m.training?.data_urns?.join(', ')}
method: ${m.training?.method}
hyperparams: ${JSON.stringify(m.training?.hyperparams||{})}`;
}
function generateEvalTests(m){ const tests=[]; for(const [k,v] of Object.entries(m?.evaluation?.thresholds||{})){ tests.push({name:`metric:${k}`,expect:`>=${v}`,actual:m.evaluation?.metrics?.[k]}); } return tests; }
function generateLineage(m){ const lines=['graph TD','  subgraph Model']; const id=s=>String(s||'').replace(/[^a-zA-Z0-9_]/g,'_'); const me=id(m.model?.id||'model'); lines.push(`  ${me}[[${m.model?.name}]]`);
  for(const u of (m.training?.data_urns||[])){ lines.push(`  "${u}" --> ${me}`); } for(const e of (m.relationships?.produces_events||[])){ lines.push(`  ${me} --> "${e}"`); }
  lines.push('  end'); return lines.join('\n'); }

// ————————————————————————————————————————————————————————————————
// Cross-protocol helpers
// ————————————————————————————————————————————————————————————————
function crossCheckWithData(modelManifest,dataManifest){ const issues=[]; for(const u of (modelManifest.training?.data_urns||[])){ if(!isURN(u)) issues.push({msg:`invalid training data URN: ${u}`,level:'error'}); } return {ok:issues.length===0,issues}; }
function crossCheckWithEvent(modelManifest,eventManifest){ const issues=[]; for(const e of (modelManifest.relationships?.consumes_events||[])){ if(!eventManifest?.event?.name===e) issues.push({msg:`model expects event '${e}' not found`,level:'warn'}); } return {ok:issues.length===0,issues}; }
function crossCheckWithInfra(modelManifest,infraManifest){ const issues=[]; if(modelManifest.model?.type==='deep-learning' && infraManifest?.specification?.vm?.gpu!==true) issues.push({msg:'DL model requires GPU infra',level:'warn'}); return {ok:issues.length===0,issues}; }

// ————————————————————————————————————————————————————————————————
// Protocol Factory
// ————————————————————————————————————————————————————————————————
function createAIProtocol(manifestInput={}){
  const manifest=normalize(manifestInput);
  return Object.freeze({
    manifest:()=>clone(manifest),
    validate:(names=[])=>runValidators(manifest,names),
    match:(expr)=>query(manifest,expr),
    diff:(other)=>diff(manifest,other?.manifest?other.manifest():other),
    generateTrainingPipeline:()=>generateTrainingPipeline(manifest),
    generateEvalTests:()=>generateEvalTests(manifest),
    generateLineage:()=>generateLineage(manifest),
    crossCheckWithData:(d)=>crossCheckWithData(manifest,d),
    crossCheckWithEvent:(e)=>crossCheckWithEvent(manifest,e),
    crossCheckWithInfra:(i)=>crossCheckWithInfra(manifest,i),
    set:(p,v)=>{const m=clone(manifest); dset(m,p,v); return createAIProtocol(m);}
  });
}

function createAICatalog(protocols=[]){
  const items=protocols; const asManifests=()=>items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({id:m.model?.id,...runValidators(m,names)})); }
  return Object.freeze({items,find,validateAll});
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————
module.exports={
  createAIProtocol,
  createAICatalog,
  registerValidator,
  Validators,
  generateTrainingPipeline,
  generateEvalTests,
  generateLineage,
  crossCheckWithData,
  crossCheckWithEvent,
  crossCheckWithInfra
};
