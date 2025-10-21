/*
 * Release/Deployment Protocol — v1.1.1 (stand-alone)
 * Minimal, self-describing release & deployment manifest + helpers
 *
 * Goals
 * - Mirror family ergonomics: manifest + validate + query + diff + generate
 * - Keep it tiny; add essentials only: strategies, waves, gates, rollback, comms, changeset
 * - Cross-protocol URNs for explicit impact & guardrails (API/Data/Event/UI/WF/Infra/Obs/AI/IAM)
 * - Zero dependencies; no external wiring
 *
 * Notes
 * - v1.1.1 consolidates v1.1.0 upgrades (auto-rollback triggers, changeset, release notes, blast radius)
 *   and adds suite-aligned validator/query/diff/generator patterns.
 */

// ————————————————————————————————————————————————————————————————
// Utilities (shared style across the suite)
// ————————————————————————————————————————————————————————————————
function jsonCanon(v){ if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(jsonCanon).join(',')+']';
  const k=Object.keys(v).sort(); return '{'+k.map(x=>JSON.stringify(x)+':'+jsonCanon(v[x])).join(',')+'}'; }
function dget(o,p){ if(!p) return o; const parts=String(p).replace(/\[(\d+)\]/g,'.$1').split('.'); let cur=o; for(const k of parts){ if(cur==null) return; cur=cur[k]; } return cur; }
function dset(o,p,v){ const parts=String(p).split('.'); let cur=o; while(parts.length>1){ const k=parts.shift(); if(!(k in cur)||typeof cur[k]!=='object') cur[k]={}; cur=cur[k]; } cur[parts[0]]=v; }
const clone=x=>JSON.parse(JSON.stringify(x));
function hash(v){ const s=jsonCanon(v); let h=BigInt('0xcbf29ce484222325'); const p=BigInt('0x100000001b3'); for(let i=0;i<s.length;i++){ h^=BigInt(s.charCodeAt(i)); h=(h*p)&BigInt('0xFFFFFFFFFFFFFFFF'); } return 'fnv1a64-'+h.toString(16).padStart(16,'0'); }
const isURN = s => typeof s==='string' && /^urn:proto:(api|data|event|ui|workflow|infra|device|ai|iam|metric|integration|testing|docs|obs|config|release|agent):[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);

/**
 * @typedef {Object} SignatureEnvelope
 * @property {'identity-access.signing.v1'} spec
 * @property {string} protected
 * @property {string} payload
 * @property {{alg:'sha-256', value:string}} hash
 * @property {string} signature
 * @property {{alg:'EdDSA'|'ES256', kid:string, typ:string, canonical:string, digest:string, iat:string, exp?:string, [key:string]:any}} [header]
 */

// ————————————————————————————————————————————————————————————————
// Manifest shape (informative JSDoc)
// ————————————————————————————————————————————————————————————————
/**
 * @typedef {Object} ReleaseManifest
 *
 * @property {Object} release
 * @property {string} release.version
 * @property {{status:'planned'|'in_progress'|'completed'|'failed'|'rolled_back', created_at?:string, started_at?:string, completed_at?:string}} [release.lifecycle]
 * @property {string} [release.commit_sha]
 * @property {string} [release.window]         // e.g., '2025-10-01T02:00Z..2025-10-01T03:00Z'
 * @property {SignatureEnvelope[]} [release.attestations]
 *
 * @property {{status:'pending'|'verified'|'failed', verifiedAt?:string, summary?:string, signers?:string[], sessionIds?:string[], artifacts?:Array<{name:string, sha256:string, keyId?:string, algorithm?:string}>, attestations?:SignatureEnvelope[]}} [promotion]
 *
 * @property {Object} strategy                 // how to roll out
 * @property {'all_at_once'|'blue_green'|'canary'|'rolling'} strategy.type
 * @property {{traffic_split?:Array<{percent:number, duration:string}>}} [strategy.canary]
 * @property {{batch_size?:number, pause_between?:string}} [strategy.rolling]
 * @property {{primary_env?:string, secondary_env?:string}} [strategy.blue_green]
 *
 * @property {Array<{name:string, targets:string[]}>} [waves]  // deployment waves/groups (targets are URNs)
 *
 * @property {Object} gates
 * @property {{required_approvals?:number, approvers?:string[]}} [gates.change_control]
 * @property {{p95_latency_ms?:number, error_rate_pct?:number, availability_pct?:number}} [gates.slo]
 * @property {{tests?:string[], min_pass_rate?:number}} [gates.testing]  // refer to Testing Protocol ids/URNs
 * @property {{checklist?:string[]}} [gates.preflight]
 *
 * @property {Object} rollback
 * @property {{type:'manual'|'auto'|'hybrid'}} rollback.mode
 * @property {{metric_id:string, threshold:number, direction:'above'|'below'}}[] [rollback.triggers] // v1.1 (from v1.1.0) :contentReference[oaicite:1]{index=1}
 *
 * @property {Array<{protocol:string, id:string, from_version:string, to_version:string}>} [changeset] // v1.1 (from v1.1.0) :contentReference[oaicite:2]{index=2}
 *
 * @property {Object} comms
 * @property {{slack?:string[], email?:string[], pager?:string[]}} [comms.channels]
 * @property {{pre?:string[], post?:string[], incident?:string[]}} [comms.templates] // message templates/ids
 *
 * @property {Object} relationships
 * @property {string[]} [relationships.targets]            // URNs explicitly covered by this release
 * @property {string[]} [relationships.observability]      // Obs manifests that guard this rollout
 *
 * @property {Object} metadata
 * @property {string} [metadata.owner]
 * @property {string[]} [metadata.tags]
 * @property {{type:'breaking'|'feature'|'fix'|'perf', description:string, ticket?:string}[]} [metadata.changelog] // v1.1 (from v1.1.0) :contentReference[oaicite:3]{index=3}
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

// Built-ins (aligned to suite style)
registerValidator('core.shape',(m)=>{
  const issues=[];
  if(!m?.release?.version) issues.push({path:'release.version',msg:'required',level:'error'});
  if(!m?.strategy?.type || !['all_at_once','blue_green','canary','rolling'].includes(m.strategy.type))
    issues.push({path:'strategy.type',msg:'invalid',level:'error'});
  return { ok: issues.length===0, issues };
});

registerValidator('waves.targets',(m)=>{
  const issues=[];
  for(const [i,w] of (m?.waves||[]).entries()){
    if(!Array.isArray(w.targets) || !w.targets.length) issues.push({path:`waves[${i}].targets`,msg:'at least one target',level:'error'});
    for(const [j,u] of (w.targets||[]).entries()){ if(!isURN(u)) issues.push({path:`waves[${i}].targets[${j}]`,msg:'invalid URN',level:'error'}); }
  }
  return { ok: issues.length===0, issues };
});

registerValidator('gates.slo',(m)=>{
  const issues=[]; const g=m?.gates?.slo||{};
  if(g.p95_latency_ms!=null && g.p95_latency_ms<0) issues.push({path:'gates.slo.p95_latency_ms',msg:'>=0',level:'error'});
  if(g.error_rate_pct!=null && !(g.error_rate_pct>=0 && g.error_rate_pct<=100)) issues.push({path:'gates.slo.error_rate_pct',msg:'0..100',level:'error'});
  if(g.availability_pct!=null && !(g.availability_pct>=0 && g.availability_pct<=100)) issues.push({path:'gates.slo.availability_pct',msg:'0..100',level:'error'});
  return { ok: issues.length===0, issues };
});

registerValidator('rollback.triggers',(m)=>{
  const issues=[]; for(const [i,t] of (m?.rollback?.triggers||[]).entries()){
    if(!t.metric_id || typeof t.threshold!=='number' || !['above','below'].includes(t.direction))
      issues.push({path:`rollback.triggers[${i}]`,msg:'metric_id/threshold/direction required',level:'error'});
  }
  return { ok: issues.length===0, issues };
});

registerValidator('release.attestations',(m)=>{
  const attestations = m?.release?.attestations;
  const issues=[];
  if (attestations == null) return { ok:true, issues };
  if (!Array.isArray(attestations)){
    issues.push({ path:'release.attestations', msg:'attestations must be an array', level:'error' });
    return { ok:false, issues };
  }
  for (const [index, sig] of attestations.entries()){
    if (!sig || typeof sig !== 'object'){
      issues.push({ path:`release.attestations[${index}]`, msg:'attestation must be an object', level:'error' });
    } else if (sig.spec !== 'identity-access.signing.v1'){
      issues.push({ path:`release.attestations[${index}].spec`, msg:'attestation must declare identity-access.signing.v1', level:'error' });
    }
  }
  return { ok: issues.length===0, issues };
});

registerValidator('promotion',(m)=>{
  const promotion = m?.promotion;
  const issues=[];
  if (promotion == null) return { ok:true, issues };
  const allowedStatus = new Set(['pending','verified','failed']);
  if (promotion.status && !allowedStatus.has(promotion.status)){
    issues.push({ path:'promotion.status', msg:'promotion.status must be pending|verified|failed', level:'error' });
  }
  if (promotion.signers != null){
    if (!Array.isArray(promotion.signers)){
      issues.push({ path:'promotion.signers', msg:'signers must be an array of strings', level:'error' });
    } else {
      promotion.signers.forEach((value,index)=>{
        if (typeof value !== 'string' || !value.trim()){
          issues.push({ path:`promotion.signers[${index}]`, msg:'signer must be a non-empty string', level:'error' });
        }
      });
    }
  }
  if (promotion.sessionIds != null){
    if (!Array.isArray(promotion.sessionIds)){
      issues.push({ path:'promotion.sessionIds', msg:'sessionIds must be an array of strings', level:'error' });
    } else {
      promotion.sessionIds.forEach((value,index)=>{
        if (typeof value !== 'string' || !value.trim()){
          issues.push({ path:`promotion.sessionIds[${index}]`, msg:'sessionId must be a non-empty string', level:'error' });
        }
      });
    }
  }
  if (promotion.artifacts != null){
    if (!Array.isArray(promotion.artifacts)){
      issues.push({ path:'promotion.artifacts', msg:'artifacts must be an array', level:'error' });
    } else {
      promotion.artifacts.forEach((entry,index)=>{
        if (!entry || typeof entry !== 'object'){
          issues.push({ path:`promotion.artifacts[${index}]`, msg:'artifact entry must be an object', level:'error' });
        } else {
          if (typeof entry.name !== 'string' || !entry.name.trim()){
            issues.push({ path:`promotion.artifacts[${index}].name`, msg:'artifact.name must be a non-empty string', level:'error' });
          }
          if (typeof entry.sha256 !== 'string' || !entry.sha256.trim()){
            issues.push({ path:`promotion.artifacts[${index}].sha256`, msg:'artifact.sha256 must be a non-empty string', level:'error' });
          }
        }
      });
    }
  }
  if (promotion.attestations != null){
    if (!Array.isArray(promotion.attestations)){
      issues.push({ path:'promotion.attestations', msg:'promotion.attestations must be an array', level:'error' });
    } else {
      promotion.attestations.forEach((sig,index)=>{
        if (!sig || typeof sig !== 'object'){
          issues.push({ path:`promotion.attestations[${index}]`, msg:'attestation must be an object', level:'error' });
        } else if (sig.spec !== 'identity-access.signing.v1'){
          issues.push({ path:`promotion.attestations[${index}].spec`, msg:'attestation must declare identity-access.signing.v1', level:'error' });
        }
      });
    }
  }
  return { ok: issues.length===0, issues };
});

registerValidator('relationships.targets',(m)=>{
  const issues=[]; for(const [i,u] of (m?.relationships?.targets||[]).entries()){ if(!isURN(u)) issues.push({path:`relationships.targets[${i}]`,msg:'invalid URN',level:'error'}); }
  for(const [i,u] of (m?.relationships?.observability||[]).entries()){ if(!isURN(u)) issues.push({path:`relationships.observability[${i}]`,msg:'invalid URN',level:'error'}); }
  return { ok: issues.length===0, issues };
});

// ————————————————————————————————————————————————————————————————
// Query language (:=: contains > < >= <=) + conveniences
// ————————————————————————————————————————————————————————————————
function query(manifest, expr){
  const [rawPath,op,...rest]=String(expr).split(':'); const rhs=rest.join(':'); if(!rawPath||!op) return false;
  if(rawPath==='waves' && op==='contains') return (manifest.waves||[]).some(w=>String(w.name||'').includes(rhs));
  if(rawPath==='relationships.targets' && op==='contains') return (manifest.relationships?.targets||[]).some(u=>u.includes(rhs));
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
  n.strategy_hash  = hash(n.strategy||{});
  n.waves_hash     = hash(n.waves||[]);
  n.gates_hash     = hash(n.gates||{});
  n.rollback_hash  = hash(n.rollback||{});
  n.changeset_hash = hash(n.changeset||[]);
  n.promotion_hash = hash(n.promotion||{});
  n.attestations_hash = hash(n.release?.attestations||[]);
  n.link_hash      = hash(n.relationships||{});
  n.comms_hash     = hash(n.comms||{});
  return n;
}
function diff(a,b){
  const A=normalize(a), B=normalize(b); const changes=[];
  (function walk(p,va,vb){
    if(JSON.stringify(va)===JSON.stringify(vb)) return;
    const isObj=v=>v&&typeof v==='object';
    if(!isObj(va)||!isObj(vb)){ changes.push({path:p,from:va,to:vb}); return; }
    const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(p?`${p}.${k}`:k, va?.[k], vb?.[k]);
  })('',A,B);
  const breaking=[], significant=[];
  for(const c of changes){
    if(c.path==='strategy_hash') breaking.push({...c, reason:'deployment strategy changed'});
    if(c.path==='waves_hash')   significant.push({...c, reason:'waves changed'});
    if(c.path==='gates_hash')   significant.push({...c, reason:'gates changed'});
    if(c.path==='rollback_hash')significant.push({...c, reason:'rollback policy changed'});
    if(c.path==='changeset_hash') significant.push({...c, reason:'changeset changed'});
    if(c.path==='attestations_hash') significant.push({...c, reason:'release attestations changed'});
    if(c.path==='promotion_hash') significant.push({...c, reason:'promotion verification changed'});
    if(c.path==='link_hash')    significant.push({...c, reason:'release coverage links changed'});
    if(c.path==='comms_hash')   significant.push({...c, reason:'comms plan changed'});
  }
  return { changes, breaking, significant };
}

// ————————————————————————————————————————————————————————————————
// Generators (pipelines, scripts, plans, comms, visuals)
// ————————————————————————————————————————————————————————————————
function generateCIPipeline(m){
  const steps=[
    'checkout','setup_node','install','test','build',
    m.gates?.testing?.tests?.length ? 'run_protocol_tests' : null,
    'package_artifacts','publish'
  ].filter(Boolean);
  return { name:`release_${m.release?.version}`, steps };
}

function generateDeploymentScript(m){
  const type=m.strategy?.type||'all_at_once';
  if(type==='blue_green') return `# deploy to GREEN, switch traffic\n# verify, then decommission BLUE`;
  if(type==='canary') return `# progressive traffic shifts:\n${(m.strategy?.canary?.traffic_split||[]).map(s=>`# - ${s.percent}% for ${s.duration}`).join('\n')}\n# promote if healthy`;
  if(type==='rolling') return `# rolling batches (size=${m.strategy?.rolling?.batch_size||'N'}) with pause=${m.strategy?.rolling?.pause_between||'30s'}`;
  return `# all-at-once deploy\n# ensure preflight done, run health checks`;
}

function generateRollbackPlan(m){
  const mode=m.rollback?.mode||'manual';
  const triggers=m.rollback?.triggers||[];
  return {
    mode, triggers,
    steps: [
      'freeze further waves',
      'scale/route back to previous stable',
      'run post-rollback health + tests',
      'announce resolution via comms.channels.incident'
    ]
  };
}

function generateComplianceReport(m){
  return {
    release:m.release?.version,
    gates:m.gates||{},
    approvals: (m.gates?.change_control?.required_approvals||0),
    testing: m.gates?.testing||{},
  };
}

// v1.1.0 → Release notes generator (kept, refined) :contentReference[oaicite:4]{index=4}
function generateReleaseNotes(m, format='markdown'){
  const log = m.metadata?.changelog||[];
  const sec = {
    breaking: log.filter(x=>x.type==='breaking'),
    feature:  log.filter(x=>x.type==='feature'),
    fix:      log.filter(x=>x.type==='fix'),
    perf:     log.filter(x=>x.type==='perf'),
  };
  let notes = `# Release Notes: ${m.release?.version}\n\n`;
  notes += `**Date**: ${new Date(m.release?.lifecycle?.completed_at || Date.now()).toISOString().slice(0,10)}\n`;
  notes += `**Commit**: \`${(m.release?.commit_sha||'').slice(0,7) || 'N/A'}\`\n\n`;
  if(sec.breaking.length){ notes += `## ⚠️ Breaking Changes\n${sec.breaking.map(c=>`- ${c.description}${c.ticket?` (${c.ticket})`:''}`).join('\n')}\n\n`; }
  if(sec.feature.length){  notes += `## ✨ New Features\n${sec.feature.map(c=>`- ${c.description}${c.ticket?` (${c.ticket})`:''}`).join('\n')}\n\n`; }
  if(sec.fix.length){      notes += `## 🐛 Fixes\n${sec.fix.map(c=>`- ${c.description}${c.ticket?` (${c.ticket})`:''}`).join('\n')}\n\n`; }
  if(sec.perf.length){     notes += `## 🚀 Performance\n${sec.perf.map(c=>`- ${c.description}${c.ticket?` (${c.ticket})`:''}`).join('\n')}\n\n`; }
  return notes;
}

// Visuals
function generateMermaidRollout(m){
  const lines=['graph TD','  subgraph Release '+(m.release?.version||'')];
  const id=s=>String(s||'').replace(/[^a-zA-Z0-9_]/g,'_');
  lines.push(`  START((start))`);
  let prev='START';
  for(const w of (m.waves||[])){
    const wn=id(w.name); lines.push(`  ${wn}[[${w.name}]]`); lines.push(`  ${prev} --> ${wn}`);
    for(const u of w.targets){ lines.push(`  ${wn} --> "${u}"`); }
    prev=wn;
  }
  lines.push(`  ${prev} --> END((end))`,'  end'); return lines.join('\n');
}

function generateChangeMatrix(m){
  const rows=(m.changeset||[]).map(c=>({protocol:c.protocol,id:c.id,from:c.from_version,to:c.to_version}));
  return rows;
}

function generateCommsPlan(m){
  const channels=m.comms?.channels||{};
  return {
    pre:(m.comms?.templates?.pre||[]).map(t=>({channel:'mixed', template:t, who:channels.slack||channels.email||[] })),
    post:(m.comms?.templates?.post||[]).map(t=>({channel:'mixed', template:t, who:channels.slack||channels.email||[] })),
    incident:(m.comms?.templates?.incident||[]).map(t=>({channel:'mixed', template:t, who:channels.pager||channels.slack||[] })),
  };
}

// ————————————————————————————————————————————————————————————————
// Cross-protocol helpers (zero-deps; pass other manifests)
// ————————————————————————————————————————————————————————————————
function analyzeBlastRadius(releaseManifest, registry){
  const affected = new Set(); const set = releaseManifest.changeset||[];
  for(const change of set){
    const deps = registry?.getDependentsOf?.(change.protocol, change.id) || [];
    deps.forEach(d=>affected.add(d.id));
  }
  return { direct_changes_count:set.length, downstream_impact_count:affected.size, affected_system_ids:[...affected] };
}
// (kept concept from v1.1.0; shaped for suite) :contentReference[oaicite:5]{index=5}

function crossCheckWithObservability(releaseManifest, obsManifest){
  const issues=[];
  const needsObs = (releaseManifest.relationships?.targets||[]).some(u=>u.includes('proto:api')||u.includes('proto:infra'));
  const hasRoutes = (obsManifest?.alerting?.rules||[]).length>0 || (obsManifest?.slos?.objectives||[]).length>0;
  if(needsObs && !hasRoutes) issues.push({msg:'Release targets lack linked observability rules/SLOs', level:'warn'});
  return { ok: issues.length===0, issues };
}

function crossCheckWithTesting(releaseManifest, testManifest){
  const issues=[];
  const needed = releaseManifest?.gates?.testing?.tests||[];
  if(needed.length && !(testManifest?.scenarios||[]).length) issues.push({msg:'Required test suite not found/empty', level:'warn'});
  return { ok: issues.length===0, issues };
}

// ————————————————————————————————————————————————————————————————
// Protocol + Catalog factories
// ————————————————————————————————————————————————————————————————
function createReleaseProtocol(manifestInput={}){
  const manifest=normalize(manifestInput);
  return Object.freeze({
    manifest:()=>clone(manifest),
    validate:(names=[])=>runValidators(manifest,names),
    match:(expr)=>query(manifest,expr),
    diff:(other)=>diff(manifest, other?.manifest? other.manifest(): other),

    // generators
    generateCIPipeline:()=>generateCIPipeline(manifest),
    generateDeploymentScript:()=>generateDeploymentScript(manifest),
    generateRollbackPlan:()=>generateRollbackPlan(manifest),
    generateComplianceReport:()=>generateComplianceReport(manifest),
    generateReleaseNotes:(format)=>generateReleaseNotes(manifest,format),
    generateMermaidRollout:()=>generateMermaidRollout(manifest),
    generateChangeMatrix:()=>generateChangeMatrix(manifest),
    generateCommsPlan:()=>generateCommsPlan(manifest),

    // cross-protocol probes
    analyzeBlastRadius:(registry)=>analyzeBlastRadius(manifest,registry),
    crossCheckWithObservability:(obsManifest)=>crossCheckWithObservability(manifest,obsManifest),
    crossCheckWithTesting:(testManifest)=>crossCheckWithTesting(manifest,testManifest),

    // mutation
    set:(path,val)=>{ const m=clone(manifest); dset(m,path,val); return createReleaseProtocol(m); }
  });
}

function createReleaseCatalog(protocols=[]){
  const items=protocols; const asManifests=()=>items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({ version:m.release?.version, ...runValidators(m,names) })); }
  function schedule(){ return asManifests().map(m=>({ version:m.release?.version, window:m.release?.window||null, strategy:m.strategy?.type })); }
  function guardrailMatrix(){ return asManifests().map(m=>({ version:m.release?.version, gates:m.gates||{} })); }
  return Object.freeze({ items, find, validateAll, schedule, guardrailMatrix });
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————
module.exports = {
  createReleaseProtocol,
  createReleaseCatalog,
  registerValidator,
  Validators,
  // low-level helpers
  query, normalize, diff,
  generateCIPipeline, generateDeploymentScript, generateRollbackPlan,
  generateComplianceReport, generateReleaseNotes, generateMermaidRollout,
  generateChangeMatrix, generateCommsPlan,
  analyzeBlastRadius, crossCheckWithObservability, crossCheckWithTesting,
};
