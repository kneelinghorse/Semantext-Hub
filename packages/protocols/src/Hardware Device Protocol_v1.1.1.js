/*
 * Hardware Device Protocol — v1.1.1 (stand‑alone)
 * Minimal, self‑describing device manifest + helpers for IoT/embedded/smart devices
 *
 * Goals
 * - Mirror API/Data/Event ergonomics: manifest + validate + query + diff + generate
 * - Keep it tiny; add essentials only: lifecycle, topology, commands, telemetry consistency
 * - Zero dependencies; no external wiring
 */

// ————————————————————————————————————————————————————————————————
// Utilities (tiny, shared style)
// ————————————————————————————————————————————————————————————————

function jsonCanon(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => jsonCanon(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + jsonCanon(value[k])).join(',') + '}';
}

function dget(obj, path) {
  if (!path) return obj;
  const p = String(path).replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj; for (const k of p) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}

function dset(obj, path, val) {
  const parts = String(path).split('.');
  let cur = obj; while (parts.length > 1) { const k = parts.shift(); if (!(k in cur) || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
  cur[parts[0]] = val;
}

const clone = x => JSON.parse(JSON.stringify(x));

function hash(value) {
  const str = jsonCanon(value);
  let h = BigInt('0xcbf29ce484222325');
  const p = BigInt('0x100000001b3');
  for (let i=0;i<str.length;i++){ h ^= BigInt(str.charCodeAt(i)); h = (h * p) & BigInt('0xFFFFFFFFFFFFFFFF'); }
  return 'fnv1a64-' + h.toString(16).padStart(16,'0');
}

// ————————————————————————————————————————————————————————————————
// Manifest shape (informative JSDoc)
// ————————————————————————————————————————————————————————————————

/**
 * @typedef {Object} DeviceManifest
 * @property {Object} device
 * @property {string} device.id
 * @property {string} device.name
 * @property {string} [device.model]
 * @property {{status:'active'|'deprecated', sunset_at?:string}} [device.lifecycle]
 * @property {Object} [capabilities]
 * @property {Array<{type:string, unit?:string, range?:[number,number]}>} [capabilities.sensing] // e.g., temperature, humidity
 * @property {Array<{type:string, description?:string}>} [capabilities.actuation] // e.g., relay, motor
 * @property {Object} [telemetry]
 * @property {Array<{metric:string, source_capability:string, frequency:string, retention?:string}>} [telemetry.metrics]
 * @property {Object} [operations]
 * @property {Object.<string,{description?:string, params?:Array<{name:string,type:string,required?:boolean}>}>} [operations.commands]
 * @property {Object} [topology]
 * @property {string} [topology.parent]
 * @property {Array<{device_id:string,relationship?:string}>} [topology.connected_devices]
 * @property {Object} [governance]
 * @property {{classification?:'internal'|'confidential'|'pii'}} [governance.policy] // for devices emitting PII telemetry
 * @property {Object} [metadata]
 * @property {string} [metadata.owner]
 * @property {string[]} [metadata.tags]
 */

// ————————————————————————————————————————————————————————————————
// Validator registry
// ————————————————————————————————————————————————————————————————

const Validators = new Map();
function registerValidator(name, fn) { Validators.set(name, fn); }
function runValidators(manifest, selected=[]) {
  const names = selected.length ? selected : Array.from(Validators.keys());
  const results = names.map(n => ({ name:n, ...(Validators.get(n)?.(manifest) || { ok:true }) }));
  return { ok: results.every(r=>r.ok), results };
}

// Helpers
function hasPIIMetrics(m){
  const fields = m?.telemetry?.metrics||[]; return fields.some(x=>/email|ssn|address|phone|user_id/i.test(x.metric));
}

// Built-ins
registerValidator('core.shape', (m)=>{
  const issues=[];
  if (!m?.device?.id) issues.push({ path:'device.id', msg:'device.id required', level:'error' });
  if (!m?.device?.name) issues.push({ path:'device.name', msg:'device.name required', level:'error' });
  const lc = m?.device?.lifecycle; if (lc && !['active','deprecated'].includes(lc.status)) issues.push({ path:'device.lifecycle.status', msg:'status must be active|deprecated', level:'error' });
  const hasAnyCap = (m?.capabilities?.sensing?.length||0) + (m?.capabilities?.actuation?.length||0) > 0;
  if (!hasAnyCap) issues.push({ path:'capabilities', msg:'at least one capability (sensing/actuation) required', level:'error' });
  return { ok: issues.length===0, issues };
});

registerValidator('telemetry.consistency', (m)=>{
  const issues=[]; const sensing=new Set((m.capabilities?.sensing||[]).map(s=>s.type));
  for (const metric of (m.telemetry?.metrics||[])) {
    if (!sensing.has(metric.source_capability)) {
      issues.push({ path:`telemetry.metrics[metric=${metric.metric}]`, msg:`Metric source '${metric.source_capability}' not found in capabilities.sensing`, level:'warn' });
    }
    if (!/^\d+(ms|s|m|h)$/.test(metric.frequency||'')) {
      issues.push({ path:`telemetry.metrics[metric=${metric.metric}].frequency`, msg:'frequency must be like 500ms|1s|5m|1h', level:'error' });
    }
  }
  if (hasPIIMetrics(m) && m?.governance?.policy?.classification!=='pii') {
    issues.push({ path:'governance.policy.classification', msg:'PII-like metrics present → classification should be "pii"', level:'warn' });
  }
  return { ok: issues.length===0, issues };
});

registerValidator('commands.params', (m)=>{
  const issues=[]; const cmds = m?.operations?.commands||{};
  for (const [name,cfg] of Object.entries(cmds)) {
    const seen=new Set();
    for (const p of (cfg.params||[])) {
      if (seen.has(p.name)) issues.push({ path:`operations.commands.${name}.params`, msg:`duplicate param '${p.name}'`, level:'error' });
      seen.add(p.name);
      if (!/^string|number|boolean$/.test(p.type)) issues.push({ path:`operations.commands.${name}.params.${p.name}`, msg:`type must be string|number|boolean`, level:'error' });
    }
  }
  return { ok: issues.length===0, issues };
});

registerValidator('topology.validity', (m)=>{
  const issues=[]; const parent=m?.topology?.parent; if (parent===m?.device?.id) issues.push({ path:'topology.parent', msg:'device cannot parent itself', level:'error' });
  return { ok: issues.length===0, issues };
});

// ————————————————————————————————————————————————————————————————
// Query (:=: contains > < >= <=) + conveniences
// ————————————————————————————————————————————————————————————————

function query(manifest, expr){
  const [rawPath, op, ...rest] = String(expr).split(':');
  const rhs = rest.join(':'); if (!rawPath||!op) return false;
  if (rawPath==='capabilities.sensing' && op==='contains') return (manifest.capabilities?.sensing||[]).some(s=>s.type.includes(rhs));
  if (rawPath==='operations.commands' && op==='contains') return Object.keys(manifest.operations?.commands||{}).some(k=>k.includes(rhs));
  if (rawPath==='telemetry.metrics' && op==='contains') return (manifest.telemetry?.metrics||[]).some(m=>m.metric.includes(rhs));
  const lhs = dget(manifest, rawPath.replace(/\[(\d+)\]/g, '.$1'));
  switch (op){
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
// Normalize (compute stable hashes; normalize frequency)
// ————————————————————————————————————————————————————————————————

function toMillis(freq){ if(!freq) return null; const m=freq.match(/^(\d+)(ms|s|m|h)$/); if(!m) return null; const n=Number(m[1]); return {ms:n, s:n*1e-3, m:n/60, h:n/3600}[m[2]]? null : ({ms:n, s:n*1000, m:n*60000, h:n*3600000}[m[2]]); }

function normalize(manifest){
  const m = clone(manifest||{});
  // normalize telemetry frequency to millis for comparisons
  for (const t of (m.telemetry?.metrics||[])) { t.frequency_ms = toMillis(t.frequency); }
  m.cap_hash = hash(m.capabilities||{});
  m.cmd_hash = hash(m.operations?.commands||{});
  m.tel_hash = hash(m.telemetry||{});
  m.topo_hash = hash(m.topology||{});
  return m;
}

// ————————————————————————————————————————————————————————————————
// Diff (structural + heuristics)
// ————————————————————————————————————————————————————————————————

function diff(a,b){
  const A=normalize(a), B=normalize(b);
  const changes=[]; function walk(pa,va,vb){ if (JSON.stringify(va)===JSON.stringify(vb)) return; const isObj=v=>v&&typeof v==='object'; if(!isObj(va)||!isObj(vb)){ changes.push({path:pa, from:va, to:vb}); return; } const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(pa?pa+'.'+k:k, va?.[k], vb?.[k]); }
  walk('', A, B);
  const breaking=[], significant=[];
  for (const c of changes){
    if (c.path==='cap_hash') breaking.push({ ...c, reason:'capabilities changed' });
    if (c.path==='cmd_hash') breaking.push({ ...c, reason:'command signatures changed' });
    if (c.path==='topo_hash') significant.push({ ...c, reason:'topology changed' });
    if (c.path==='tel_hash') significant.push({ ...c, reason:'telemetry contract changed' });
    if (c.path==='device.lifecycle.status' && dget(a,'device.lifecycle.status')==='active' && dget(b,'device.lifecycle.status')==='deprecated') breaking.push({ ...c, reason:'lifecycle downgrade' });
  }
  return { changes, breaking, significant };
}

// ————————————————————————————————————————————————————————————————
// Generators
// ————————————————————————————————————————————————————————————————

function generateDriverSkeleton(manifest, language='javascript'){
  const deviceName = String(manifest?.device?.name||'Device').replace(/\W+/g,'');
  const sensing = manifest.capabilities?.sensing||[]; const commands = manifest.operations?.commands||{};
  return `/**\n * Auto-generated driver for: ${manifest.device?.name} (${manifest.device?.model||''})\n */\nclass ${deviceName}Driver {\n  constructor(connection){ this.connection=connection; this.manifest=${JSON.stringify(manifest,null,2)}; }\n  async connect(){ /* TODO */ }\n  async readSensors(){ const readings={};\n${sensing.map(s=>`    readings['${s.type}'] = await this._readSensor('${s.type}');`).join('\n')}\n    return readings; }\n${Object.entries(commands).map(([name,cfg])=>{ const params=(cfg.params||[]).map(p=>p.name).join(', '); return `\n  /** ${cfg.description||`Executes '${name}'`} */\n  async ${name}(${params}){ /* TODO: send '${name}' with { ${params} } */ throw new Error("Command '${name}' not implemented."); }`; }).join('\n')}\n  async _readSensor(type){ /* TODO */ }\n  async disconnect(){ /* TODO */ }\n}\nmodule.exports = ${deviceName}Driver;`;
}

// Mermaid topology visual
function generateVisualMap(manifests){
  const lines=['graph TD','  subgraph Fleet'];
  const byId = new Map(manifests.map(m=>[m.device?.id,m]));
  for (const m of manifests){
    const id = m.device?.id, name=m.device?.name||id; if(!id) continue;
    lines.push(`  ${id}([${name}])`);
    const parent=m.topology?.parent; if(parent&&byId.has(parent)) lines.push(`  ${parent} --> ${id}`);
  }
  lines.push('  end'); return lines.join('\n');
}

// ————————————————————————————————————————————————————————————————
// Topology analysis & fleet helpers
// ————————————————————————————————————————————————————————————————

function analyzeTopology(manifests){
  const devices = new Map(manifests.map(m=>[m.device?.id,{ manifest:m, parent:m.topology?.parent, children:[] }]));
  for (const [id, node] of devices){ if(node.parent && devices.has(node.parent)) devices.get(node.parent).children.push(id); }
  function getUpstream(deviceId){ const path=[]; let cur=devices.get(deviceId)?.parent; while(cur){ path.push(devices.get(cur)?.manifest); cur=devices.get(cur)?.parent; } return path; }
  function getDownstream(deviceId){ const out=[]; (function dfs(id){ const n=devices.get(id); if(!n) return; for(const c of n.children){ out.push(devices.get(c)?.manifest); dfs(c);} })(deviceId); return out; }
  function detectCycles(){ const cycles=[]; const stack=new Set(); const seen=new Set(); function dfs(id){ if(stack.has(id)){ cycles.push([...stack,id]); return; } if(seen.has(id)) return; seen.add(id); stack.add(id); for(const c of (devices.get(id)?.children||[])) dfs(c); stack.delete(id);} for(const id of devices.keys()) dfs(id); return cycles; }
  return { getUpstream, getDownstream, detectCycles };
}

// ————————————————————————————————————————————————————————————————
// Protocol + Fleet factories
// ————————————————————————————————————————————————————————————————

function createDeviceProtocol(manifestInput={}){
  const manifest = normalize(manifestInput);
  return Object.freeze({
    manifest: ()=>clone(manifest),
    validate: (names=[])=>runValidators(manifest,names),
    match: (expr)=>query(manifest,expr),
    diff: (other)=>diff(manifest,other),
    generateDriverSkeleton: (language)=>generateDriverSkeleton(manifest,language),
    generateConfig: ()=>generateConfig(manifest),
    generateDocs: ()=>generateDocs(manifest),
    generateTestSuite: ()=>generateTestSuite(manifest),
    set: (path,val)=>{ const m=clone(manifest); dset(m,path,val); return createDeviceProtocol(m); },
  });
}

function createDeviceFleet(protocols=[]) {
  const items = protocols; const asManifests = () => items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({ id:m.device?.id, ...runValidators(m,names) })); }
  return Object.freeze({ items, find, validateAll, analyzeTopology: () => analyzeTopology(asManifests()), generateVisualMap: () => generateVisualMap(asManifests()) });
}

// Additional generators
function generateConfig(manifest) {
  const deviceId = manifest.device?.id || 'device';
  const config = {
    device: {
      id: deviceId,
      type: manifest.device?.type || 'unknown',
      manufacturer: manifest.device?.manufacturer || 'unknown',
      model: manifest.device?.model || 'unknown',
      version: manifest.device?.version || '1.0.0'
    },
    connectivity: manifest.connectivity || {},
    capabilities: manifest.capabilities || {},
    constraints: manifest.constraints || {}
  };
  
  return JSON.stringify(config, null, 2);
}

function generateDocs(manifest) {
  const deviceId = manifest.device?.id || 'Device';
  const capabilities = manifest.capabilities || {};
  
  let docs = `# ${deviceId}\n\n`;
  docs += `**Type**: ${manifest.device?.type || 'Unknown'}\n`;
  docs += `**Manufacturer**: ${manifest.device?.manufacturer || 'Unknown'}\n`;
  docs += `**Model**: ${manifest.device?.model || 'Unknown'}\n\n`;
  docs += `## Capabilities\n\n`;
  
  for (const [name, cap] of Object.entries(capabilities)) {
    docs += `- **${name}**: ${cap.description || 'No description'}\n`;
  }
  
  docs += `\n## Connectivity\n\n`;
  const connectivity = manifest.connectivity || {};
  for (const [type, config] of Object.entries(connectivity)) {
    docs += `- **${type}**: ${JSON.stringify(config, null, 2)}\n`;
  }
  
  return docs;
}

function generateTestSuite(manifest) {
  const deviceId = manifest.device?.id || 'device';
  
  let testSuite = `describe('${deviceId} Device', () => {\n`;
  testSuite += `  let device;\n\n`;
  testSuite += `  beforeEach(() => {\n`;
  testSuite += `    device = new DeviceDriver(${JSON.stringify(manifest, null, 2)});\n`;
  testSuite += `  });\n\n`;
  testSuite += `  it('should initialize successfully', () => {\n`;
  testSuite += `    expect(device).toBeDefined();\n`;
  testSuite += `    expect(device.id).toBe('${deviceId}');\n`;
  testSuite += `  });\n\n`;
  
  const capabilities = manifest.capabilities || {};
  for (const [name, cap] of Object.entries(capabilities)) {
    testSuite += `  it('should support ${name} capability', () => {\n`;
    testSuite += `    expect(device.hasCapability('${name}')).toBe(true);\n`;
    testSuite += `  });\n\n`;
  }
  
  testSuite += `});`;
  return testSuite;
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————

module.exports = {
  createDeviceProtocol,
  createDeviceFleet,
  registerValidator,
  Validators,
  analyzeTopology,
  generateVisualMap,
};

// ————————————————————————————————————————————————————————————————
// Example (commented)
// ————————————————————————————————————————————————————————————————
/*
const gateway = createDeviceProtocol({
  device:{ id:'gw-1', name:'Gateway 1', lifecycle:{ status:'active' } },
  capabilities:{ sensing:[{type:'temperature'}] },
  operations:{ commands:{ reboot:{ description:'Reboot device', params:[{name:'delay', type:'number'}] } } },
  telemetry:{ metrics:[{ metric:'temp_c', source_capability:'temperature', frequency:'1s' }] },
  topology:{ },
  governance:{ policy:{ classification:'internal' } },
});

const sensor = createDeviceProtocol({
  device:{ id:'sensor-1', name:'Room Sensor', model:'RS-01', lifecycle:{ status:'active' } },
  capabilities:{ sensing:[{type:'temperature'},{type:'humidity'}], actuation:[{type:'led'}] },
  operations:{ commands:{ set_led:{ description:'Set LED state', params:[{name:'on', type:'boolean', required:true}] } } },
  telemetry:{ metrics:[{ metric:'temp_c', source_capability:'temperature', frequency:'1s' }, { metric:'humidity_pct', source_capability:'humidity', frequency:'5s' }] },
  topology:{ parent:'gw-1' },
});

console.log(gateway.validate());
console.log(sensor.validate());
console.log(sensor.match('capabilities.sensing:contains:humidity'));
console.log(sensor.diff(sensor.set('operations.commands.set_led.params.0.type','string').manifest()));
const fleet = createDeviceFleet([gateway, sensor]);
console.log(fleet.validateAll());
console.log(fleet.analyzeTopology().getUpstream('sensor-1')); // [gateway]
console.log(fleet.generateVisualMap());
*/
