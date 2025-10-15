/*
 * Observability Protocol — v1.1.1 (stand-alone)
 * Minimal, self-describing observability manifest + helpers
 *
 * Goals
 * - Mirror the family: manifest + validate + query + diff + generate
 * - Keep it tiny; add only essentials: signals, pipelines, SLOs, alerting, runbooks
 * - Cross-protocol URNs to wire obs to API/Data/Event/UI/Workflow/Infra/Device/AI/IAM
 * - Zero dependencies; no external wiring
 */

// ————————————————————————————————————————————————————————————————
// Utilities (shared style)
// ————————————————————————————————————————————————————————————————
function jsonCanon(v){ if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(jsonCanon).join(',')+']';
  const k=Object.keys(v).sort(); return '{'+k.map(x=>JSON.stringify(x)+':'+jsonCanon(v[x])).join(',')+'}'; }
function dget(o,p){ if(!p) return o; const parts=String(p).replace(/\[(\d+)\]/g,'.$1').split('.'); let cur=o; for(const k of parts){ if(cur==null) return; cur=cur[k]; } return cur; }
function dset(o,p,v){ const parts=String(p).split('.'); let cur=o; while(parts.length>1){ const k=parts.shift(); if(!(k in cur)||typeof cur[k]!=='object') cur[k]={}; cur=cur[k]; } cur[parts[0]]=v; }
const clone=x=>JSON.parse(JSON.stringify(x));
function hash(v){ const s=jsonCanon(v); let h=BigInt('0xcbf29ce484222325'); const p=BigInt('0x100000001b3'); for(let i=0;i<s.length;i++){ h^=BigInt(s.charCodeAt(i)); h=(h*p)&BigInt('0xFFFFFFFFFFFFFFFF'); } return 'fnv1a64-'+h.toString(16).padStart(16,'0'); }
const isURN = s => typeof s==='string' && /^urn:proto:(api|data|event|ui|workflow|infra|device|ai|iam|metric|integration|testing|docs|obs|agent):[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);

// ————————————————————————————————————————————————————————————————
// Manifest shape (informative JSDoc)
// ————————————————————————————————————————————————————————————————
/**
 * @typedef {Object} ObservabilityManifest
 *
 * @property {Object} observability
 * @property {string} observability.service                  // logical service/app name
 * @property {string} [observability.team]                   // owner/team
 * @property {{status:'defined'|'enabled'|'paused'|'deprecated'}} [observability.lifecycle]
 *
 * @property {Object} signals
 * @property {{receivers?:Object, processors?:Object, exporters?:Object}} [signals.otel] // OTel pipeline parts
 * @property {{scrape_targets?:string[], rules_pack?:string}} [signals.metrics]          // Prometheus-like
 * @property {{sources?:string[], sampling?:string}} [signals.traces]
 * @property {{paths?:string[], redact?:string[]}} [signals.logs]
 * @property {{checks?:Array<{name:string,url:string,interval?:string,expected?:number}>}} [signals.synthetics]
 *
 * @property {Object} health
 * @property {{endpoint?:string, interval?:string, checks?:Array<Object>}} [health.liveness]
 * @property {{endpoint?:string, checks?:Array<Object>, checks_from_protocols?:Array<{protocol:string,id:string,check:string}>}} [health.readiness]
 *
 * @property {Object} slos
 * @property {Array<{id:string, objective:string, target:number, window:string, indicator:{kind:'latency'|'availability'|'error_rate', source?:string}}>} [slos.objectives]
 *
 * @property {Object} alerting
 * @property {Array<{id:string, expr:string, for?:string, severity:'low'|'medium'|'high'|'critical', labels?:Object, annotations?:Object}>} [alerting.rules]
 * @property {{pager?:string, slack?:string, email?:string}} [alerting.routing]
 *
 * @property {Object} debugging
 * @property {Object<string,{linked_alert:string, steps:Array<{action:string,params:Object}>}>} [debugging.playbooks] // v1.1 playbooks → runbooks
 *
 * @property {Array<{name:string, trigger:Object, correlates_with:Array<Object>, hypothesis:string}>} [correlations]  // v1.1 correlations
 *
 * @property {Object} governance
 * @property {{classification?:'internal'|'confidential'|'pii'}} [governance.policy]
 *
 * @property {Object} relationships
 * @property {string[]} [relationships.targets]              // URNs for systems this obs covers (APIs, datasets, infra, etc.)
 *
 * @property {Object} metadata
 * @property {string} [metadata.owner]
 * @property {string[]} [metadata.tags]
 */

// ————————————————————————————————————————————————————————————————
// Validator registry (pluggable, zero-deps)
// ————————————————————————————————————————————————————————————————
const Validators=new Map();
function registerValidator(name, fn){ Validators.set(name, fn); }
function runValidators(m, selected=[]){
  const names = selected.length ? selected : Array.from(Validators.keys());
  const results = names.map(n => ({ name:n, ...(Validators.get(n)?.(m)||{ok:true}) }));
  return { ok: results.every(r=>r.ok), results };
}

// Built-ins — aligned with suite
registerValidator('core.shape', (m)=>{
  const issues=[];
  if(!m?.observability?.service) issues.push({path:'observability.service', msg:'service required', level:'error'});
  if(!m?.signals) issues.push({path:'signals', msg:'signals section required', level:'error'});
  return { ok: issues.length===0, issues };
});

registerValidator('urns.links', (m)=>{
  const issues=[];
  for(const [i,u] of (m?.relationships?.targets||[]).entries()){
    if(!isURN(u)) issues.push({path:`relationships.targets[${i}]`, msg:'invalid URN', level:'error'});
  }
  return { ok: issues.length===0, issues };
});

registerValidator('alerting.rules', (m)=>{
  const issues=[];
  for(const [i,r] of (m?.alerting?.rules||[]).entries()){
    if(!r.id || !r.expr) issues.push({path:`alerting.rules[${i}]`, msg:'id & expr required', level:'error'});
    if(!['low','medium','high','critical'].includes(r.severity)) issues.push({path:`alerting.rules[${i}].severity`, msg:'invalid severity', level:'error'});
  }
  return { ok: issues.length===0, issues };
});

registerValidator('slos.objectives', (m)=>{
  const issues=[];
  for(const [i,s] of (m?.slos?.objectives||[]).entries()){
    if(!s.id || !s.objective || !(s.target>=0 && s.target<=100)) issues.push({path:`slos.objectives[${i}]`, msg:'id/objective required; target 0..100', level:'error'});
    if(!['latency','availability','error_rate'].includes(s?.indicator?.kind)) issues.push({path:`slos.objectives[${i}].indicator.kind`, msg:'invalid indicator', level:'error'});
  }
  return { ok: issues.length===0, issues };
});

registerValidator('governance.logs_pii', (m)=>{
  const issues=[];
  const piiish = (m?.signals?.logs?.redact||[]).some(x=>/email|ssn|address|phone|user_id/i.test(x));
  if(piiish && m?.governance?.policy?.classification!=='pii'){
    issues.push({ path:'governance.policy.classification', msg:'redaction suggests PII; classification should be "pii"', level:'warn' });
  }
  return { ok: issues.length===0, issues };
});

// ————————————————————————————————————————————————————————————————
// Query language (:=: contains > < >= <=) + conveniences
// ————————————————————————————————————————————————————————————————
function query(manifest, expr){
  const [rawPath,op,...rest]=String(expr).split(':'); const rhs=rest.join(':'); if(!rawPath||!op) return false;
  if(rawPath==='relationships.targets' && op==='contains') return (manifest.relationships?.targets||[]).some(u=>u.includes(rhs));
  if(rawPath==='alerting.rules' && op==='contains') return (manifest.alerting?.rules||[]).some(r=>`${r.id}:${r.expr}`.includes(rhs));
  const lhs=dget(manifest, rawPath.replace(/\[(\d+)\]/g, '.$1'));
  switch(op){
    case ':=:': return String(lhs)===rhs;
    case 'contains': return String(lhs??'').includes(rhs);
    case '>': return Number(lhs)>Number(rhs);
    case '<': return Number(lhs)<Number(rhs);
    case '>=': return Number(lhs)>=Number(rhs);
    case '<=': return Number(lhs)<=Number(rhs);
    default: return false;
  }
}

// ————————————————————————————————————————————————————————————————
// Normalize + Diff (structural + heuristics)
// ————————————————————————————————————————————————————————————————
function normalize(m){
  const n=clone(m||{});
  n.pipe_hash   = hash(n.signals||{});
  n.health_hash = hash(n.health||{});
  n.slo_hash    = hash(n.slos||{});
  n.alert_hash  = hash(n.alerting||{});
  n.pb_hash     = hash(n.debugging?.playbooks||{});
  n.link_hash   = hash(n.relationships||{});
  return n;
}

function diff(a,b){
  const A=normalize(a), B=normalize(b); const changes=[];
  (function walk(p,va,vb){
    if(JSON.stringify(va)===JSON.stringify(vb)) return;
    const isObj=v=>v&&typeof v==='object';
    if(!isObj(va)||!isObj(vb)){ changes.push({path:p, from:va, to:vb}); return; }
    const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]);
    for(const k of keys) walk(p?`${p}.${k}`:k, va?.[k], vb?.[k]);
  })('',A,B);
  const breaking=[], significant=[];
  for(const c of changes){
    if(c.path==='pipe_hash') breaking.push({...c, reason:'signal pipeline changed'});
    if(c.path==='slo_hash') significant.push({...c, reason:'SLOs changed'});
    if(c.path==='alert_hash') significant.push({...c, reason:'alerting changed'});
    if(c.path==='health_hash') significant.push({...c, reason:'health checks changed'});
    if(c.path==='pb_hash') significant.push({...c, reason:'runbooks/playbooks changed'});
    if(c.path==='link_hash') significant.push({...c, reason:'observability coverage links changed'});
  }
  return { changes, breaking, significant };
}

// ————————————————————————————————————————————————————————————————
// Generators (OTel/Prom/Grafana; runbooks; health checks; visuals)
// ————————————————————————————————————————————————————————————————
function generateOTelConfig(m){
  const r=m.signals?.otel?.receivers||{}, p=m.signals?.otel?.processors||{}, e=m.signals?.otel?.exporters||{};
  return {
    service:{ pipelines:{
      traces:{ receivers:Object.keys(r), processors:Object.keys(p), exporters:Object.keys(e) },
      metrics:{ receivers:Object.keys(r), processors:Object.keys(p), exporters:Object.keys(e) },
      logs:{ receivers:Object.keys(r), processors:Object.keys(p), exporters:Object.keys(e) }
    }},
    receivers:r, processors:p, exporters:e
  };
}

function generatePrometheusRules(m){
  const rules=(m.alerting?.rules||[]).map(r=>({
    alert:r.id, expr:r.expr, for:r.for||'1m', labels:{severity:r.severity,...(r.labels||{})}, annotations:r.annotations||{}
  }));
  return { groups:[{ name:`${m.observability?.service}-rules`, rules }] };
}

function generateGrafanaDashboard(m){
  return {
    title:`${m.observability?.service} Overview`,
    panels:[
      { type:'graph', title:'Latency (p95)', target:'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))' },
      { type:'graph', title:'Error Rate', target:'rate(http_requests_total{status=~"5.."}[5m])' },
      { type:'graph', title:'Throughput', target:'sum(rate(http_requests_total[1m]))' }
    ]
  };
}

// v1.1: turn playbooks into runbooks (markdown)
function generateRunbookMarkdown(manifest){
  const playbooks = manifest.debugging?.playbooks || {};
  let markdown = `# Runbooks: ${manifest.observability?.service}\n\n`;
  for (const [name, pb] of Object.entries(playbooks)){
    markdown += `## ${name}\n- Linked alert: \`${pb.linked_alert}\`\n\n### Steps\n`;
    (pb.steps||[]).forEach((step,i)=>{
      markdown += `${i+1}. **${step.action}**\n   - Params: \`${JSON.stringify(step.params)}\`\n   - [ ] Done\n`;
    });
    markdown += `\n---\n`;
  }
  return markdown;
}

// v1.1: protocol-aware health checks
function generateHealthChecks(manifest, registry=null){
  const generated=[];
  if(registry){
    for(const pc of (manifest.health?.readiness?.checks_from_protocols||[])){
      const dep = registry.get?.(pc.protocol, pc.id);
      if(!dep) continue;
      if(pc.protocol==='infra' && pc.check==='connectivity'){
        const endpoint = dep.specification?.endpoint || dep.networking?.dns;
        generated.push({ type:'tcp_ping', target:endpoint, timeout:'5s', description:`Connectivity to infra: ${pc.id}` });
      }
      if(pc.protocol==='api' && pc.check==='ping_endpoint'){
        const base = dep.interface?.baseUrl || dep.interface?.base_url;
        generated.push({ type:'http_get', target:String(base).replace(/\/$/,'')+'/health', expected_status:200, description:`API health: ${pc.id}` });
      }
    }
  }
  return {
    liveness: manifest.health?.liveness || { endpoint:'/health/live', interval:'30s' },
    readiness: manifest.health?.readiness || { endpoint:'/health/ready' },
    checks: [ ...(manifest.health?.readiness?.checks||[]), ...generated ]
  };
}

// Visual: service → linked targets (Mermaid)
function generateServiceMap(manifest){
  const lines=['graph TD','  subgraph Observability'];
  const id=s=>String(s||'').replace(/[^a-zA-Z0-9_]/g,'_');
  const me=id(manifest.observability?.service||'service');
  lines.push(`  ${me}[[${manifest.observability?.service||'service'}]]`);
  for(const u of (manifest.relationships?.targets||[])){ lines.push(`  ${me} --> "${u}"`); }
  lines.push('  end'); return lines.join('\n');
}

// Convenience: alert matrix by severity
function generateAlertMatrix(manifest){
  const matrix={ low:[], medium:[], high:[], critical:[] };
  for(const r of (manifest.alerting?.rules||[])) matrix[r.severity]?.push({ id:r.id, expr:r.expr, for:r.for||'1m' });
  return matrix;
}

// ————————————————————————————————————————————————————————————————
// Cross-protocol helpers (callers pass other manifests)
// ————————————————————————————————————————————————————————————————
function crossCheckWithAPI(obs, api){
  const issues=[];
  if(obs.relationships?.targets?.some(u=>u.includes('proto:api')) && !(api?.interface?.endpoints||[]).length)
    issues.push({msg:'API has no endpoints but is linked by observability', level:'warn'});
  return { ok:issues.length===0, issues };
}
function crossCheckWithData(obs, data){
  const issues=[];
  const hasPII = Object.values(data?.schema?.fields||{}).some(f=>f.pii===true);
  if(hasPII && !(obs.signals?.logs?.redact||[]).length)
    issues.push({msg:'PII dataset linked but no log redaction configured', level:'warn'});
  return { ok:issues.length===0, issues };
}
function crossCheckWithInfra(obs, infra){
  const issues=[];
  if(infra?.specification?.network?.exposure==='public' && !(obs.signals?.synthetics?.checks||[]).length)
    issues.push({msg:'Public endpoint without synthetic checks', level:'warn'});
  return { ok:issues.length===0, issues };
}

// ————————————————————————————————————————————————————————————————
// Protocol + Catalog factories
// ————————————————————————————————————————————————————————————————
function createObservabilityProtocol(manifestInput={}){
  const manifest = normalize(manifestInput);
  return Object.freeze({
    manifest:()=>clone(manifest),
    validate:(names=[])=>runValidators(manifest,names),
    match:(expr)=>query(manifest,expr),
    diff:(other)=>diff(manifest, other?.manifest? other.manifest(): other),
    // generators
    generateOTelConfig:()=>generateOTelConfig(manifest),
    generatePrometheusRules:()=>generatePrometheusRules(manifest),
    generateGrafanaDashboard:()=>generateGrafanaDashboard(manifest),
    generateRunbookMarkdown:()=>generateRunbookMarkdown(manifest),
    generateHealthChecks:(registry)=>generateHealthChecks(manifest, registry),
    generateServiceMap:()=>generateServiceMap(manifest),
    generateAlertMatrix:()=>generateAlertMatrix(manifest),
    // cross-checks
    crossCheckWithAPI:(apiManifest)=>crossCheckWithAPI(manifest, apiManifest),
    crossCheckWithData:(dataManifest)=>crossCheckWithData(manifest, dataManifest),
    crossCheckWithInfra:(infraManifest)=>crossCheckWithInfra(manifest, infraManifest),
    // mutation
    set:(path,val)=>{ const m=clone(manifest); dset(m,path,val); return createObservabilityProtocol(m); }
  });
}

function createObservabilityCatalog(protocols=[]){
  const items=protocols; const asManifests=()=>items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({ service:m.observability?.service, ...runValidators(m,names) })); }
  function healthPlan(registry){ const out={}; for(const p of items){ const m=p.manifest(); out[m.observability?.service]=p.generateHealthChecks(registry); } return out; }
  function sloBurnRateReport(){
    const rpt=[]; for(const m of asManifests()){ for(const s of (m.slos?.objectives||[])){ if(s.indicator?.kind==='error_rate' && s.target<99) rpt.push({ service:m.observability?.service, slo:s.id, target:s.target, note:'low SLO target' }); } }
    return rpt;
  }
  return Object.freeze({ items, find, validateAll, healthPlan, sloBurnRateReport });
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————
module.exports = {
  createObservabilityProtocol,
  createObservabilityCatalog,
  registerValidator,
  Validators,
  // low-level helpers
  query, normalize, diff,
  generateOTelConfig, generatePrometheusRules, generateGrafanaDashboard,
  generateRunbookMarkdown, generateHealthChecks, generateServiceMap, generateAlertMatrix,
  crossCheckWithAPI, crossCheckWithData, crossCheckWithInfra,
};
