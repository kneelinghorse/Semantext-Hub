/*
 * Infrastructure Protocol — v1.1.1 (stand-alone)
 * Universal infrastructure manifests for cloud resources, containers, networking, and scaling
 * Enhancements: URN identity, governance, cross-protocol checks, lineage/mermaid generators
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
const isURN = s => typeof s==='string' && /^urn:proto:[a-z]+:[a-zA-Z0-9._-]+@[\d.]+/.test(s);

// ————————————————————————————————————————————————————————————————
// Manifest Shape
// ————————————————————————————————————————————————————————————————
/**
 * @typedef {Object} InfrastructureManifest
 * @property {Object} resource {id, name, type, provider, region}
 * @property {Object} [specification] {container, vm, network, storage, scaling}
 * @property {Object} [workload] {hosts_protocol, hosts_urn, deployment_artifact}
 * @property {Object} [state_management] {current_status,last_deployment_id,last_deployed_at,drift_detection}
 * @property {Object} [governance] {classification:'internal'|'confidential'|'pii', compliance:['soc2','hipaa'], retention_days:number}
 * @property {Object} [dependencies] {infrastructure:string[], downstream:string[]}
 * @property {Object} [metadata] {owner,tags,version}
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
  const issues=[]; if(!m?.resource?.id) issues.push({path:'resource.id',msg:'required',level:'error'});
  if(!m?.resource?.type) issues.push({path:'resource.type',msg:'required',level:'error'});
  if(!m?.resource?.provider) issues.push({path:'resource.provider',msg:'required',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('workload.binding',m=>{
  const issues=[]; if(m.workload){
    if(m.workload.hosts_protocol&&!m.workload.hosts_urn) issues.push({path:'workload.hosts_urn',msg:'required if hosts_protocol given',level:'error'});
    if(m.workload.hosts_urn&&!isURN(m.workload.hosts_urn)) issues.push({path:'workload.hosts_urn',msg:'invalid URN',level:'error'});
  }
  return {ok:issues.length===0,issues};
});

registerValidator('state.lifecycle',m=>{
  const issues=[]; const s=m?.state_management?.current_status;
  if(s&&!['defined','provisioning','running','updating','degraded','terminating'].includes(s))
    issues.push({path:'state_management.current_status',msg:'invalid status',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('governance.policy',m=>{
  const issues=[]; if(m.governance){
    if(m.governance.classification==='pii'&&m.specification?.network?.exposure==='public')
      issues.push({path:'governance.classification',msg:'PII infra should not be public',level:'warn'});
  }
  return {ok:issues.length===0,issues};
});

// ————————————————————————————————————————————————————————————————
// Normalize + Diff
// ————————————————————————————————————————————————————————————————
function normalize(m){
  const n=clone(m||{}); n.sig_hash=hash({id:n.resource?.id,type:n.resource?.type,prov:n.resource?.provider,region:n.resource?.region,spec:n.specification});
  n.state_hash=hash(n.state_management||{}); n.gov_hash=hash(n.governance||{});
  return n;
}
function diff(a,b){
  const A=normalize(a),B=normalize(b); const changes=[]; const breaking=[],significant=[];
  (function walk(p,va,vb){ if(JSON.stringify(va)===JSON.stringify(vb)) return;
    const isObj=v=>v&&typeof v==='object'; if(!isObj(va)||!isObj(vb)){ changes.push({path:p,from:va,to:vb}); return; }
    const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(p?`${p}.${k}`:k,va?.[k],vb?.[k]); })('',A,B);
  for(const c of changes){
    if(c.path==='sig_hash') breaking.push({...c,reason:'infra signature changed'});
    if(c.path==='state_hash') significant.push({...c,reason:'state changed'});
    if(c.path==='gov_hash') significant.push({...c,reason:'governance changed'});
  }
  return {changes,breaking,significant};
}

// ————————————————————————————————————————————————————————————————
// Generators
// ————————————————————————————————————————————————————————————————
function generateMermaid(manifests){
  const lines=['graph TD','  subgraph Infra'];
  const id=s=>String(s||'').replace(/[^a-zA-Z0-9_]/g,'_');
  for(const m of manifests){ const r=id(m.resource?.id||'res'); lines.push(`  ${r}[${m.resource?.name||m.resource?.id}]`);
    if(m.workload?.hosts_urn) lines.push(`  ${r} --> "${m.workload.hosts_urn}"`);
  }
  lines.push('  end'); return lines.join('\n');
}
function generateCostReport(manifests){
  return manifests.map(m=>({id:m.resource?.id,type:m.resource?.type,est_cost:m.specification?.cost_estimate||'unknown'}));
}

// ————————————————————————————————————————————————————————————————
// Protocol + Stack Factories
// ————————————————————————————————————————————————————————————————
function createInfrastructureProtocol(manifestInput={}){
  const manifest=normalize(manifestInput);
  return Object.freeze({
    manifest:()=>clone(manifest),
    validate:(names=[])=>runValidators(manifest,names),
    diff:(other)=>diff(manifest,other?.manifest?other.manifest():other),
    generateMermaid:()=>generateMermaid([manifest]),
    generateCostReport:()=>generateCostReport([manifest]),
    set:(p,v)=>{const m=clone(manifest); dset(m,p,v); return createInfrastructureProtocol(m);}
  });
}

function createInfrastructureStack(manifests=[]){
  const resources=manifests.map(m=>createInfrastructureProtocol(m));
  const getDeploymentOrder=()=>resources.map(r=>r.manifest().resource.id); // naive
  return Object.freeze({
    resources,getDeploymentOrder,
    validateAll:(names=[])=>resources.map(r=>({id:r.manifest().resource.id,...r.validate(names)})),
    generateMermaidAll:()=>generateMermaid(resources.map(r=>r.manifest())),
    generateCostReportAll:()=>generateCostReport(resources.map(r=>r.manifest())),
    findHostingInfrastructure:(urn)=>resources.filter(r=>r.manifest().workload?.hosts_urn===urn)
  });
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————
module.exports={
  createInfrastructureProtocol,
  createInfrastructureStack,
  registerValidator,
  Validators,
  diff,
  generateMermaid,
  generateCostReport
};
