/*
 * Testing/Quality Protocol — v1.1.1 (stand-alone)
 * Minimal, self-describing test/quality manifest + helpers
 *
 * Goals
 * - Mirror family ergonomics: manifest + validate + query + diff + generate
 * - Keep it tiny; add essentials only: scenarios, data/mocks, retries, quality gates, flakiness
 * - Cross-protocol URNs (API/Data/Event/UI/Workflow/Infra) for protocol-aware tests
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
const isURN=s=>typeof s==='string' && /^urn:proto:[a-z]+:[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);

// ————————————————————————————————————————————————————————————————
// Manifest shape (informative JSDoc)
// ————————————————————————————————————————————————————————————————
/**
 * @typedef {Object} TestingManifest
 * @property {Object} test
 * @property {string} test.id
 * @property {string} test.name
 * @property {'unit'|'component'|'integration'|'contract'|'e2e'|'performance'|'load'|'chaos'} test.type
 * @property {{status:'defined'|'ready'|'running'|'degraded'|'deprecated'}} [test.lifecycle]
 * @property {string} [test.target_urn]           // e.g., urn:proto:api:billing@1.1.1#/v1/invoices
 *
 * @property {Object} quality_gates               // minimal gates to “ship”
 * @property {{minimum?:number}} [quality_gates.coverage]              // %
 * @property {{p95_latency?:number}} [quality_gates.performance]       // ms
 * @property {{success_rate?:number}} [quality_gates.reliability]      // %
 *
 * @property {Array<{
 *   id:string, name:string, priority?:'low'|'medium'|'high'|'critical',
 *   given?:any, when?:any, then?:any,
 *   binds?:{ api?:string, event?:string, data?:string, ui?:string, workflow?:string },
 *   history?:{ last_5_runs?:('pass'|'fail')[], flakiness_score?:number }
 * }>} scenarios
 *
 * @property {Object} data
 * @property {{[alias:string]:{urn:string, source_path?:string}}} [data.generators] // URN + path to schema
 * @property {{[alias:string]:{urn:string, source_path?:string}}} [data.mocks]
 *
 * @property {Object} execution
 * @property {{strategy:'static'|'adaptive', max_static_retries?:number, flaky_test_retries?:number}} [execution.retries]
 * @property {{timeout?:string, ci_matrix?:string[]}} [execution.params]
 *
 * @property {Object} governance
 * @property {{classification?:'internal'|'confidential'|'pii'}} [governance.policy]
 *
 * @property {Object} relationships
 * @property {string[]} [relationships.depends_on]     // other test URNs or ids
 * @property {string[]} [relationships.infra_hosts]     // infra runner URNs
 *
 * @property {Object} [metadata]
 * @property {string} [metadata.owner]
 * @property {string[]} [metadata.tags]
 */

// ————————————————————————————————————————————————————————————————
// Validator registry (pluggable)
// ————————————————————————————————————————————————————————————————
const Validators=new Map();
function registerValidator(n,fn){ Validators.set(n,fn); }
function runValidators(m,sel=[]){
  const names=sel.length?sel:Array.from(Validators.keys());
  const results=names.map(n=>({name:n,...(Validators.get(n)?.(m)||{ok:true})}));
  return { ok:results.every(r=>r.ok), results };
}

// Built-ins (aligned w/ family)
registerValidator('core.shape',m=>{
  const issues=[];
  if(!m?.test?.id) issues.push({path:'test.id',msg:'required',level:'error'});
  if(!m?.test?.name) issues.push({path:'test.name',msg:'required',level:'error'});
  if(!['unit','component','integration','contract','e2e','performance','load','chaos'].includes(m?.test?.type))
    issues.push({path:'test.type',msg:'invalid',level:'error'});
  if(!Array.isArray(m?.scenarios)||m.scenarios.length===0)
    issues.push({path:'scenarios',msg:'at least one scenario required',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('urns.form',m=>{
  const issues=[];
  if(m?.test?.target_urn && !isURN(m.test.target_urn)) issues.push({path:'test.target_urn',msg:'invalid URN',level:'error'});
  for(const [alias,g] of Object.entries(m?.data?.generators||{})) if(!isURN(g.urn)) issues.push({path:`data.generators.${alias}.urn`,msg:'invalid URN',level:'error'});
  for(const [alias,g] of Object.entries(m?.data?.mocks||{})) if(!isURN(g.urn)) issues.push({path:`data.mocks.${alias}.urn`,msg:'invalid URN',level:'error'});
  for(const [i,s] of (m.scenarios||[]).entries()){
    for(const [k,u] of Object.entries(s.binds||{})) if(u && !isURN(u)) issues.push({path:`scenarios[${i}].binds.${k}`,msg:'invalid URN',level:'error'});
  }
  return {ok:issues.length===0,issues};
});

registerValidator('quality.gates',m=>{
  const issues=[];
  const cov=m?.quality_gates?.coverage?.minimum;
  const p95=m?.quality_gates?.performance?.p95_latency;
  const rel=m?.quality_gates?.reliability?.success_rate;
  if(cov!=null && !(cov>=0 && cov<=100)) issues.push({path:'quality_gates.coverage.minimum',msg:'0..100',level:'error'});
  if(p95!=null && !(p95>=0)) issues.push({path:'quality_gates.performance.p95_latency',msg:'>=0 ms',level:'error'});
  if(rel!=null && !(rel>=0 && rel<=100)) issues.push({path:'quality_gates.reliability.success_rate',msg:'0..100',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('execution.retries',m=>{
  const issues=[]; const r=m?.execution?.retries;
  if(!r) return {ok:true};
  if(!['static','adaptive'].includes(r.strategy)) issues.push({path:'execution.retries.strategy',msg:'invalid',level:'error'});
  if(r.strategy==='static' && !(r.max_static_retries>=0)) issues.push({path:'execution.retries.max_static_retries',msg:'>=0',level:'error'});
  if(r.strategy==='adaptive' && !(r.flaky_test_retries>=0)) issues.push({path:'execution.retries.flaky_test_retries',msg:'>=0',level:'error'});
  return {ok:issues.length===0,issues};
});

registerValidator('flakiness.history',m=>{
  const issues=[];
  for(const [i,s] of (m.scenarios||[]).entries()){
    if(s.history){
      const arr=s.history.last_5_runs||[];
      if(!Array.isArray(arr) || arr.some(x=>!['pass','fail'].includes(x))) issues.push({path:`scenarios[${i}].history.last_5_runs`,msg:'array of pass|fail',level:'error'});
      const fs=s.history.flakiness_score;
      if(fs!=null && !(fs>=0 && fs<=1)) issues.push({path:`scenarios[${i}].history.flakiness_score`,msg:'0..1',level:'error'});
    }
  }
  return {ok:issues.length===0,issues};
});

registerValidator('governance.pii_policy',m=>{
  const issues=[];
  // Heuristic: if any generator/mock URN looks PII-ish, require classification=pii
  const anyPII = [...Object.values(m?.data?.generators||{}), ...Object.values(m?.data?.mocks||{})]
    .some(x => /#(email|ssn|address|phone|user_id)\b/i.test(x?.urn||''));
  if(anyPII && m?.governance?.policy?.classification!=='pii')
    issues.push({path:'governance.policy.classification',msg:'PII-like fields present → classification should be "pii"',level:'warn'});
  return {ok:issues.length===0,issues};
});

// ————————————————————————————————————————————————————————————————
// Query language (:=: contains > < >= <=) + conveniences
// ————————————————————————————————————————————————————————————————
function query(manifest, expr){
  const [rawPath,op,...rest]=String(expr).split(':'); const rhs=rest.join(':'); if(!rawPath||!op) return false;
  // conveniences
  if(rawPath==='scenarios' && op==='contains') return (manifest.scenarios||[]).some(s => (s.name||'').includes(rhs) || (s.priority||'').includes(rhs));
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
  n.sig_hash = hash({ type:n.test?.type, target:n.test?.target_urn, gates:n.quality_gates });
  n.scn_hash = hash((n.scenarios||[]).map(s => ({id:s.id, name:s.name, binds:s.binds})));
  n.data_hash = hash(n.data||{});
  n.exec_hash = hash(n.execution||{});
  n.gov_hash  = hash(n.governance||{});
  return n;
}
function diff(a,b){
  const A=normalize(a), B=normalize(b); const changes=[];
  (function walk(p,va,vb){
    if(JSON.stringify(va)===JSON.stringify(vb)) return;
    const isObj=v=>v&&typeof v==='object';
    if(!isObj(va)||!isObj(vb)){ changes.push({path:p,from:va,to:vb}); return; }
    const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(p?`${p}.${k}`:k, va?.[k], vb?.[k]);
  })('', A, B);
  const breaking=[], significant=[];
  for(const c of changes){
    if(c.path==='sig_hash') breaking.push({...c, reason:'test signature changed (type/target/gates)'});
    if(c.path==='scn_hash') significant.push({...c, reason:'scenarios changed'});
    if(c.path==='data_hash') significant.push({...c, reason:'data generators/mocks changed'});
    if(c.path==='exec_hash') significant.push({...c, reason:'execution config changed'});
    if(c.path==='gov_hash')  significant.push({...c, reason:'governance changed'});
  }
  return { changes, breaking, significant };
}

// ————————————————————————————————————————————————————————————————
// Generators (suites, plans, fixtures, visuals)
// ————————————————————————————————————————————————————————————————
function generateTestSuite(manifest, framework='jest'){
  const m=manifest;
  if(framework==='jest'){
    return `/**
 * Auto-generated Jest suite: ${m.test?.name}
 */
describe('${m.test?.name}', () => {
${(m.scenarios||[]).map(s=>`  test('${s.name}', async () => {
    // GIVEN
    const ctx = ${JSON.stringify(s.given||{})};
    // WHEN
    // TODO: invoke system under test using binds (e.g., fetch API, emit event)
    // THEN
    expect(true).toBe(true); // replace with assertions for: ${JSON.stringify(s.then||{})}
  });`).join('\n')}
});`;
  }
  if(framework==='cypress'){
    return `/**
 * Auto-generated Cypress suite: ${m.test?.name}
 */
describe('${m.test?.name}', () => {
${(m.scenarios||[]).map(s=>`  it('${s.name}', () => {
    // GIVEN ${JSON.stringify(s.given||{})}
    // WHEN ${JSON.stringify(s.when||{})}
    // THEN ${JSON.stringify(s.then||{})}
  });`).join('\n')}
});`;
  }
  return `// Framework '${framework}' not implemented`;
}

function generateTestPlan(manifest, format='markdown'){
  const m=manifest;
  if(format==='markdown'){
    const cov=m.quality_gates?.coverage?.minimum??'N/A';
    const p95=m.quality_gates?.performance?.p95_latency??'N/A';
    const rel=m.quality_gates?.reliability?.success_rate??'N/A';
    return `# Test Plan: ${m.test?.name}

- **Suite ID**: \`${m.test?.id}\`
- **Type**: ${m.test?.type}
- **Target**: \`${m.test?.target_urn||'N/A'}\`

## Quality Gates
| Gate | Threshold |
|---|---|
| Coverage | ${cov}% |
| P95 Latency | ${p95} ms |
| Reliability | ${rel}% |

## Scenarios (${(m.scenarios||[]).length})
${(m.scenarios||[]).map(s=>`### ${s.priority?`[${s.priority.toUpperCase()}] `:''}${s.name}
- Given: \`${JSON.stringify(s.given||{})}\`
- When: \`${JSON.stringify(s.when||{})}\`
- Then: \`${JSON.stringify(s.then||{})}\`
- Binds: \`${JSON.stringify(s.binds||{})}\`
- Flakiness: ${s.history?.flakiness_score??'N/A'} (last5=${JSON.stringify(s.history?.last_5_runs||[])})
`).join('\n')}
`; }
  return JSON.stringify(manifest,null,2);
}

function generateFixture(manifest, alias, protocolRegistry){
  const g = manifest?.data?.generators?.[alias] || manifest?.data?.mocks?.[alias];
  if(!g) throw new Error(`No generator/mock named '${alias}'`);
  if(!isURN(g.urn)) throw new Error(`Invalid URN for '${alias}'`);
  // Fetch the source manifest (zero-deps; caller provides registry with get(urn))
  const src = protocolRegistry?.get?.(g.urn);
  const schema = g.source_path ? dget(src, g.source_path) : (src?.schema || src?.validation || {});
  const out={};
  const props = schema?.properties||{};
  for(const [k,p] of Object.entries(props)){
    if(p.type==='string') out[k]='sample_string';
    else if(p.type==='number') out[k]=123;
    else if(p.type==='boolean') out[k]=true;
    else out[k]=null;
  }
  return out;
}

function generateMermaid(manifest){
  const lines=['graph TD','  subgraph Testing'];
  const id=s=>String(s||'').replace(/[^a-zA-Z0-9_]/g,'_');
  const me=id(manifest.test?.id||'suite');
  lines.push(`  ${me}[[${manifest.test?.name||'suite'}]]`);
  if(manifest.test?.target_urn) lines.push(`  "${manifest.test.target_urn}" --> ${me}`);
  for(const s of (manifest.scenarios||[])){
    const sn=id(s.id||s.name); lines.push(`  ${me} --> ${sn}[${s.name}]`);
    for(const u of Object.values(s.binds||{})) if(u) lines.push(`  "${u}" --> ${sn}`);
  }
  lines.push('  end'); return lines.join('\n');
}

// ————————————————————————————————————————————————————————————————
// Analysis helpers (flakiness & gates)
// ————————————————————————————————————————————————————————————————
function analyzeFlakiness(manifest){
  const out=[];
  for(const s of (manifest.scenarios||[])){
    const arr=s.history?.last_5_runs||[];
    const fails=arr.filter(x=>x==='fail').length;
    const score=arr.length? Math.min(1, fails/arr.length) : 0;
    out.push({ id:s.id, name:s.name, flakiness_score: s.history?.flakiness_score??score });
  }
  return out;
}
function checkQualityGates(manifest, results={coverage:100,p95:0,success:100}){
  const gates=manifest.quality_gates||{};
  const okCov = gates.coverage?.minimum==null || results.coverage>=gates.coverage.minimum;
  const okP95 = gates.performance?.p95_latency==null || results.p95<=gates.performance.p95_latency;
  const okRel = gates.reliability?.success_rate==null || results.success>=gates.reliability.success_rate;
  return { ok: okCov && okP95 && okRel, details:{ okCov, okP95, okRel } };
}

// ————————————————————————————————————————————————————————————————
// Cross-protocol helpers (callers pass other manifests)
// ————————————————————————————————————————————————————————————————
function crossCheckWithAPI(testManifest, apiManifest){
  const issues=[];
  if(testManifest.test?.target_urn?.includes('proto:api') && !(apiManifest?.interface?.endpoints||[]).length)
    issues.push({msg:'API manifest has no endpoints for target', level:'warn'});
  return { ok: issues.length===0, issues };
}
function crossCheckWithData(testManifest, dataManifest){
  const issues=[];
  // Warn if generating fields not in data schema
  const fields = new Set(Object.keys(dataManifest?.schema?.fields||{}));
  for(const g of Object.values(testManifest?.data?.generators||{})){
    const frag=(g.source_path||'').split('.').pop();
    if(frag && !fields.has(frag)) issues.push({msg:`generator path not in data schema: ${frag}`, level:'warn'});
  }
  return { ok: issues.length===0, issues };
}
function crossCheckWithEvent(testManifest, eventManifest){
  const issues=[];
  const props = Object.keys(eventManifest?.schema?.payload?.properties||{});
  for(const s of (testManifest.scenarios||[])){
    if(s.binds?.event && s.binds.event.includes('#payload.')){
      const key = s.binds.event.split('#payload.')[1];
      if(props.length && !props.includes(key)) issues.push({msg:`scenario binds unknown event field: ${key}`, level:'warn'});
    }
  }
  return { ok: issues.length===0, issues };
}

// ————————————————————————————————————————————————————————————————
// Protocol + Catalog factories
// ————————————————————————————————————————————————————————————————
function createTestingProtocol(manifestInput={}){
  const manifest=normalize(manifestInput);
  return Object.freeze({
    manifest:()=>clone(manifest),
    validate:(names=[])=>runValidators(manifest,names),
    match:(expr)=>query(manifest,expr),
    diff:(other)=>diff(manifest, other?.manifest?other.manifest():other),
    // generators
    generateTestSuite:(framework)=>generateTestSuite(manifest,framework),
    generateTestPlan:(format)=>generateTestPlan(manifest,format),
    generateFixture:(alias,reg)=>generateFixture(manifest,alias,reg),
    generateMermaid:()=>generateMermaid(manifest),
    // analysis
    analyzeFlakiness:()=>analyzeFlakiness(manifest),
    checkQualityGates:(results)=>checkQualityGates(manifest,results),
    // cross-checks
    crossCheckWithAPI:(apiManifest)=>crossCheckWithAPI(manifest,apiManifest),
    crossCheckWithData:(dataManifest)=>crossCheckWithData(manifest,dataManifest),
    crossCheckWithEvent:(eventManifest)=>crossCheckWithEvent(manifest,eventManifest),
    // mutation
    set:(path,val)=>{ const m=clone(manifest); dset(m,path,val); return createTestingProtocol(m); }
  });
}

function createTestingCatalog(protocols=[]){
  const items=protocols; const asManifests=()=>items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({ id:m.test?.id, ...runValidators(m,names) })); }
  function flakinessReport(){ return asManifests().map(m=>({ id:m.test?.id, cases: analyzeFlakiness(m) })); }
  return Object.freeze({ items, find, validateAll, flakinessReport });
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————
module.exports = {
  createTestingProtocol,
  createTestingCatalog,
  registerValidator,
  Validators,
  // low-level helpers
  query, normalize, diff,
  generateTestSuite, generateTestPlan, generateFixture, generateMermaid,
  analyzeFlakiness, checkQualityGates,
  crossCheckWithAPI, crossCheckWithData, crossCheckWithEvent,
};
