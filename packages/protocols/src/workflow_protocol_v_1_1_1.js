/*
 * Workflow Protocol — v1.1.1 (stand‑alone)
 * Minimal, self‑describing workflow manifest + helpers
 *
 * Goals
 * - Mirror the family ergonomics: manifest + validate + query + diff + generate
 * - Keep it tiny; add only essentials: DAG checks, SLA sanity, human‑task governance
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
 * @typedef {Object} WorkflowManifest
 * @property {Object} workflow
 * @property {string} workflow.id
 * @property {string} [workflow.name]
 * @property {string} [workflow.purpose]
 * @property {'finish_inflight'|'migrate_if_compatible'} [workflow.migration_strategy]
 * @property {Object} [sla]
 * @property {string} [sla.timeout]                   // e.g., '30s'|'5m'|'1h'
 * @property {string} [sla.on_timeout_event]
 * @property {Array<WorkflowStep>} steps              // ordered or partially ordered via dependencies
 * @property {Object} [metadata]
 * @property {string} [metadata.owner]
 * @property {string[]} [metadata.tags]
 */

/**
 * @typedef {Object} WorkflowStep
 * @property {string} id
 * @property {'service'|'human'|'event'|'agent'} type
 * @property {string} [service]                       // for type==='service'
 * @property {Object} [agent]                         // for type==='agent'
 * @property {Object<string,string|{from?:string, expression?:string}>} [inputs]
 * @property {string[]} [dependencies]                // step ids this step depends on
 * @property {{role?:string, form_schema?:Object, outcomes?:string[]}} [human_task]
 * @property {{retries?:number, backoff?:'none'|'linear'|'exponential'}} [retry]
 * @property {string} [idempotency_key]               // for service calls
 * @property {boolean} [side_effects]                 // if true, suggest compensation
 * @property {{classification?:'internal'|'confidential'|'pii'}} [governance]
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

// Built‑ins
registerValidator('core.shape', (m)=>{
  const issues=[];
  if (!m?.workflow?.id) issues.push({ path:'workflow.id', msg:'workflow.id required', level:'error' });
  if (!Array.isArray(m?.steps) || m.steps.length===0) issues.push({ path:'steps', msg:'at least one step required', level:'error' });
  const allowed = new Set(['service','human','event','agent']);
  const ids = new Set();
  for (const [i,s] of (m.steps||[]).entries()){
    if (!s.id) issues.push({ path:`steps[${i}].id`, msg:'step.id required', level:'error' });
    if (ids.has(s.id)) issues.push({ path:`steps[${i}].id`, msg:`duplicate step id '${s.id}'`, level:'error' }); ids.add(s.id);
    if (!allowed.has(s.type)) issues.push({ path:`steps[${i}].type`, msg:`invalid type '${s.type}'`, level:'error' });
    if (s.type==='service' && !s.service) issues.push({ path:`steps[${i}].service`, msg:'service name required for service step', level:'error' });
    if (s.type==='agent' && !s.agent?.urn && !s.agent?.discoveryUri) issues.push({ path:`steps[${i}].agent`, msg:'`urn` or `discoveryUri` required for agent step', level:'error' });
  }
  return { ok: issues.length===0, issues };
});

registerValidator('deps.acyclic', (m)=>{
  const issues=[]; const steps = m?.steps||[]; const graph = new Map();
  for (const s of steps) graph.set(s.id, new Set(s.dependencies||[]));
  const temp=new Set(), perm=new Set(); let problem=null;
  function visit(v){
    if (perm.has(v)) return; if (temp.has(v)) { problem=v; return; }
    temp.add(v); for (const u of (graph.get(v)||[])) visit(u); temp.delete(v); perm.add(v);
  }
  for (const s of steps) visit(s.id);
  if (problem) issues.push({ path:'steps', msg:`dependency cycle detected near '${problem}'`, level:'error' });
  return { ok: issues.length===0, issues };
});

registerValidator('sla.consistency', (m)=>{
  const issues=[]; const t=m?.sla?.timeout;
  if (t && !/^\d+\s?(ms|s|m|h)$/.test(t)) issues.push({ path:'sla.timeout', msg:'timeout must look like 500ms|30s|5m|1h', level:'error' });
  const ms = m?.workflow?.migration_strategy;
  if (ms && !['finish_inflight','migrate_if_compatible'].includes(ms)) issues.push({ path:'workflow.migration_strategy', msg:'invalid migration_strategy', level:'error' });
  return { ok: issues.length===0, issues };
});

registerValidator('human.safety', (m)=>{
  const issues=[];
  for (const s of (m?.steps||[])){
    if (s.type==='human'){
      if (!Array.isArray(s?.human_task?.outcomes) || s.human_task.outcomes.length===0)
        issues.push({ path:`steps.${s.id}.human_task.outcomes`, msg:'human step should declare outcomes', level:'error' });
      const schema = s?.human_task?.form_schema||{};
      const hasPII = JSON.stringify(schema).match(/email|ssn|address|phone|user_id/i);
      if (hasPII && s?.governance?.classification!=='pii')
        issues.push({ path:`steps.${s.id}.governance.classification`, msg:'human form likely collects PII → classification should be "pii"', level:'warn' });
    }
  }
  return { ok: issues.length===0, issues };
});

registerValidator('compensation.hint', (m)=>{
  const issues=[];
  const hasComp = new Set((m?.steps||[]).filter(x=>x.type==='event').map(x=>x.id)); // naive placeholder
  for (const s of (m?.steps||[])){
    if (s.type==='service' && s.side_effects && hasComp.size===0)
      issues.push({ path:`steps.${s.id}`, msg:'service step with side_effects but no defined compensation event', level:'warn' });
  }
  return { ok: issues.length===0, issues };
});

registerValidator('nodes.agent', m => {
  const issues=[];
  for(const [i,n] of (m?.steps||[]).entries()){
    if(n.type==='agent'){
      if(!n.agent?.urn && !n.agent?.discoveryUri)
        issues.push({path:`steps[${i}].agent`, msg:'`urn` or `discoveryUri` required for agent step', level:'error'});
      if(n.agent?.delegation && !n.agent?.delegation?.urn)
        issues.push({path:`steps[${i}].agent.delegation.urn`, msg:'delegation.urn required when delegation provided', level:'error'});
    }
  }
  return { ok: issues.length===0, issues };
});

// ————————————————————————————————————————————————————————————————
// Query language (:=: contains > < >= <=) + conveniences
// ————————————————————————————————————————————————————————————————

function query(manifest, expr){
  const [rawPath, op, ...rest] = String(expr).split(':');
  const rhs = rest.join(':'); if (!rawPath||!op) return false;
  if (rawPath==='steps' && op==='contains') return (manifest.steps||[]).some(s => (s.id||s.name||'').includes(rhs) || (s.type||'').includes(rhs));
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
// Normalize + Diff (structural + heuristics)
// ————————————————————————————————————————————————————————————————

function normalize(m){
  const n = clone(m||{});
  n.steps_hash = hash((n.steps||[]).map(s => ({ id:s.id, type:s.type, service:s.service, inputs:Object.keys(s.inputs||{}).sort() })));
  n.sla_hash = hash(n.sla||{});
  n.migration_hash = hash(n.workflow?.migration_strategy||'');
  return n;
}

function diff(a,b){
  const A=normalize(a), B=normalize(b); const changes=[];
  (function walk(p,va,vb){ if (JSON.stringify(va)===JSON.stringify(vb)) return; const isObj=v=>v&&typeof v==='object'; if(!isObj(va)||!isObj(vb)){ changes.push({path:p, from:va, to:vb}); return; } const keys=new Set([...Object.keys(va||{}),...Object.keys(vb||{})]); for(const k of keys) walk(p?`${p}.${k}`:k, va?.[k], vb?.[k]); })('', A, B);
  const breaking=[], significant=[];
  for (const c of changes){
    if (c.path==='steps_hash') breaking.push({...c, reason:'step signature changed'});
    if (c.path.startsWith('steps.') && c.path.endsWith('.type')) breaking.push({...c, reason:'step type changed'});
    if (c.path.startsWith('steps.') && c.path.endsWith('.service')) breaking.push({...c, reason:'service changed'});
    if (c.path==='sla_hash') significant.push({...c, reason:'SLA changed'});
    if (c.path==='migration_hash') significant.push({...c, reason:'migration strategy changed'});
  }
  return { changes, breaking, significant };
}

// ————————————————————————————————————————————————————————————————
// Generators
// ————————————————————————————————————————————————————————————————

function topoSort(steps){
  const byId = new Map(steps.map(s=>[s.id,s]));
  const indeg = new Map(steps.map(s=>[s.id,0]));
  for (const s of steps) for (const d of (s.dependencies||[])) indeg.set(s.id, (indeg.get(s.id)||0)+1);
  const q = [...[...indeg.entries()].filter(([_,v])=>v===0).map(([k])=>k)];
  const order=[]; while(q.length){ const v=q.shift(); order.push(byId.get(v)); for(const s of steps){ if((s.dependencies||[]).includes(v)){ indeg.set(s.id, indeg.get(s.id)-1); if(indeg.get(s.id)===0) q.push(s.id); } } }
  if (order.length!==steps.length) throw new Error('Cycle detected at runtime (topoSort)');
  return order;
}

function generateWorkflowEngine(manifest){
  const code = `/**\n * Auto-generated workflow engine for: ${manifest.workflow?.name||manifest.workflow?.id||'workflow'}\n * NOTE: Expressions are executed via new Function for demo purposes.\n *       Sandbox or disallow expressions in untrusted environments.\n */\nexport async function runWorkflow(ctx={}){\n  const steps = ${JSON.stringify(manifest.steps||[])};\n  const state = { outputs:{}, status:{} };\n  const order = (${topoSort.toString()})(steps);\n  for (const step of order){\n    const inputs = {};\n    const map = step.inputs||{};\n    for (const [k,v] of Object.entries(map)) {\n      if (typeof v === 'string') { // shorthand like "stepX.total" or literal
        if (v.includes('.')) { const [ref,prop] = v.split('.'); inputs[k] = state.outputs[ref]?.[prop]; }
        else { inputs[k] = v; }
      } else if (v && typeof v==='object' && v.expression){\n        // VERY basic expression eval; replace for production
        const fn = new Function('ctx','out','inputs', v.expression);\n        inputs[k] = fn(ctx, state.outputs, inputs);\n      } else if (v && typeof v==='object' && v.from){\n        const [ref,prop] = v.from.split('.'); inputs[k] = state.outputs[ref]?.[prop];\n      }\n    }\n    if (step.type==='service'){\n      // TODO: replace with actual service invocation; here we just echo
      state.outputs[step.id] = { ok:true, inputs };\n    } else if (step.type==='event'){\n      state.outputs[step.id] = { published:true, inputs };\n    } else if (step.type==='human'){\n      // In real use, enqueue a human task; here we simulate a decision
      state.outputs[step.id] = { outcome: (step.human_task?.outcomes||['approved'])[0], inputs };\n    }\n    state.status[step.id] = 'done';\n  }\n  return state;\n}`;
  return code;
}

function generateVisualDAG(m){
  const lines=['graph TD','  subgraph Workflow: ' + (m.workflow?.name||m.workflow?.id||'unnamed')];
  for (const s of (m.steps||[])){
    const node = (s.id||'step').replace(/\W/g,'_') + `[${s.id}\n(${s.type})]`;
    lines.push('  ' + node);
  }
  for (const s of (m.steps||[])){
    for (const d of (s.dependencies||[])) lines.push(`  ${d.replace(/\W/g,'_')} --> ${s.id.replace(/\W/g,'_')}`);
  }
  lines.push('  end'); return lines.join('\n');
}

function generateAgentNodeStub(agentNode, agentManifest={}){
  const nodeId = agentNode.id || 'agentTask';
  const agentUrn = agentNode.agent?.urn || agentNode.agent?.discoveryUri || 'unknown';
  const capabilities = agentManifest?.capabilities || {};
  const tools = capabilities.tools || agentNode.agent?.tools || [];
  const resources = capabilities.resources || agentNode.agent?.resources || [];
  const prompts = capabilities.prompts || agentNode.agent?.prompts || [];
  const timeout = agentNode.agent?.timeout || agentManifest?.timeout || '30s';
  const protocol = agentNode.agent?.protocol || 'a2a';
  const delegation = agentNode.agent?.delegation?.urn || null;

  const code = `/**
 * Agent Task: ${nodeId}
 * Executed by: ${agentUrn}
 * Protocol: ${protocol}
 * Timeout: ${timeout}
 ${delegation ? ` * Delegation: ${delegation}` : ''}
 */
async function ${nodeId}(ctx, inputs){
  try {
    // Agent resolution
    const agent = await resolveAgent('${agentUrn}');
    if (!agent) throw new Error('Agent not found: ${agentUrn}');

    // Capability setup
    const capabilities = ${JSON.stringify(capabilities, null, 2).split('\n').join('\n    ')};
${delegation ? `
    // IAM delegation check
    const delegation = await validateDelegation('${delegation}', ctx.principal);
    if (!delegation.valid) throw new Error('Delegation invalid or expired');
` : ''}
    // Setup timeout
    const timeoutMs = parseTimeout('${timeout}');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Agent task timeout: ${nodeId}')), timeoutMs)
    );

    // Tool invocations${tools.length > 0 ? '\n    const toolResults = {};' : ''}${tools.map(t => {
      const toolName = typeof t === 'string' ? t : t.name;
      return `
    toolResults.${toolName} = await Promise.race([
      agent.invokeTool('${toolName}', inputs.${toolName} || {}),
      timeoutPromise
    ]);`;
    }).join('')}

    // Resource access${resources.length > 0 ? '\n    const resourceData = {};' : ''}${resources.map(r => {
      const resUri = typeof r === 'string' ? r : r.uri;
      const resName = typeof r === 'string' ? r.split('/').pop().replace(/\W/g,'_') : (r.name || r.uri.split('/').pop().replace(/\W/g,'_'));
      return `
    resourceData.${resName} = await Promise.race([
      agent.accessResource('${resUri}'),
      timeoutPromise
    ]);`;
    }).join('')}

    // Prompt invocations${prompts.length > 0 ? '\n    const promptResults = {};' : ''}${prompts.map(p => {
      const promptName = typeof p === 'string' ? p : p.name;
      return `
    promptResults.${promptName} = await Promise.race([
      agent.invokePrompt('${promptName}', inputs.${promptName} || {}),
      timeoutPromise
    ]);`;
    }).join('')}

    // Execute primary agent task
    const result = await Promise.race([
      agent.execute({
        protocol: '${protocol}',
        inputs,${tools.length > 0 ? '\n        toolResults,' : ''}${resources.length > 0 ? '\n        resourceData,' : ''}${prompts.length > 0 ? '\n        promptResults,' : ''}
        context: ctx
      }),
      timeoutPromise
    ]);

    return {
      status: 'completed',
      outputs: result,${tools.length > 0 ? '\n      toolResults,' : ''}${resources.length > 0 ? '\n      resourceData,' : ''}${prompts.length > 0 ? '\n      promptResults,' : ''}
      agentUrn: '${agentUrn}',
      protocol: '${protocol}',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Error handling with compensation hints
    const errorResult = {
      status: 'failed',
      error: {
        message: error.message,
        type: error.constructor.name,
        agentUrn: '${agentUrn}',
        taskId: '${nodeId}'
      },
      timestamp: new Date().toISOString()
    };

    // Log for observability
    if (ctx.logger) {
      ctx.logger.error('Agent task failed', errorResult);
    }

    // Compensation hint for side-effects
    ${agentNode.side_effects ? `if (ctx.compensate) {
      await ctx.compensate('${nodeId}', errorResult);
    }` : '// No side-effects declared'}

    throw error;
  }
}

// Helper: parse timeout string to milliseconds
function parseTimeout(str) {
  const match = str.match(/^(\\d+)\\s?(ms|s|m|h)$/);
  if (!match) return 30000; // default 30s
  const [_, num, unit] = match;
  const n = parseInt(num, 10);
  switch (unit) {
    case 'ms': return n;
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    default: return 30000;
  }
}`;

  return code;
}

// ————————————————————————————————————————————————————————————————
// Protocol + Catalog factories
// ————————————————————————————————————————————————————————————————

function createWorkflowProtocol(manifestInput={}){
  const manifest = clone(manifestInput);
  return Object.freeze({
    manifest: ()=>clone(manifest),
    validate: (names=[])=>runValidators(manifest,names),
    match: (expr)=>query(manifest,expr),
    diff: (other)=>diff(manifest,other),
    generateWorkflowEngine: ()=>generateWorkflowEngine(manifest),
    generateVisualDAG: ()=>generateVisualDAG(manifest),
    generateAgentNodeStub: (nodeIdOrNode, agentManifest)=>{
      // Support both step id lookup and direct node object
      const node = typeof nodeIdOrNode === 'string'
        ? (manifest.steps||[]).find(s=>s.id===nodeIdOrNode)
        : nodeIdOrNode;
      if (!node) throw new Error(`Step not found: ${nodeIdOrNode}`);
      if (node.type !== 'agent') throw new Error(`Step ${node.id} is not an agent step`);
      return generateAgentNodeStub(node, agentManifest);
    },
    generateTestSuite: ()=>generateTestSuite(manifest),
    generateDocs: ()=>generateDocs(manifest),
    generateConfig: ()=>generateConfig(manifest),
    set: (path,val)=>{ const m=clone(manifest); dset(m,path,val); return createWorkflowProtocol(m); },
  });
}

function createWorkflowCatalog(protocols=[]) {
  const items = protocols; const asManifests = () => items.map(p=>p.manifest());
  function find(expr){ return items.filter(p=>p.match(expr)); }
  function validateAll(names=[]) { return asManifests().map(m=>({ id:m.workflow?.id, ...runValidators(m,names) })); }
  return Object.freeze({ items, find, validateAll });
}

// Additional generators
function generateTestSuite(manifest) {
  const workflowId = manifest.workflow?.id || 'workflow';
  const steps = manifest.steps || [];
  
  let testSuite = `describe('${workflowId} Workflow', () => {\n`;
  testSuite += `  it('should execute all steps successfully', async () => {\n`;
  testSuite += `    const workflow = new WorkflowEngine(${JSON.stringify(manifest, null, 2)});\n`;
  testSuite += `    const result = await workflow.execute();\n`;
  testSuite += `    expect(result.status).toBe('completed');\n`;
  testSuite += `  });\n\n`;
  
  for (const step of steps) {
    testSuite += `  it('should handle step: ${step.id}', async () => {\n`;
    testSuite += `    const workflow = new WorkflowEngine(${JSON.stringify(manifest, null, 2)});\n`;
    testSuite += `    const result = await workflow.executeStep('${step.id}');\n`;
    testSuite += `    expect(result).toBeDefined();\n`;
    testSuite += `  });\n\n`;
  }
  
  testSuite += `});`;
  return testSuite;
}

function generateDocs(manifest) {
  const workflowId = manifest.workflow?.id || 'Workflow';
  const steps = manifest.steps || [];
  
  let docs = `# ${workflowId}\n\n`;
  docs += `**Description**: ${manifest.workflow?.description || 'No description'}\n\n`;
  docs += `## Steps\n\n`;
  
  for (const step of steps) {
    docs += `### ${step.id}\n`;
    docs += `- **Type**: ${step.type}\n`;
    docs += `- **Description**: ${step.description || 'No description'}\n`;
    if (step.inputs) {
      docs += `- **Inputs**: ${step.inputs.join(', ')}\n`;
    }
    if (step.outputs) {
      docs += `- **Outputs**: ${step.outputs.join(', ')}\n`;
    }
    docs += `\n`;
  }
  
  return docs;
}

function generateConfig(manifest) {
  const workflowId = manifest.workflow?.id || 'workflow';
  const config = {
    workflow: {
      id: workflowId,
      version: manifest.workflow?.version || '1.0.0',
      timeout: manifest.workflow?.timeout || 300000,
      retries: manifest.workflow?.retries || 3
    },
    steps: {}
  };
  
  for (const step of manifest.steps || []) {
    config.steps[step.id] = {
      type: step.type,
      timeout: step.timeout || 60000,
      retries: step.retries || 1
    };
  }
  
  return JSON.stringify(config, null, 2);
}

// ————————————————————————————————————————————————————————————————
// Exports
// ————————————————————————————————————————————————————————————————

export {
  createWorkflowProtocol,
  createWorkflowCatalog,
  registerValidator,
  Validators,
  // low-level helpers for advanced users
  generateWorkflowEngine,
  generateVisualDAG,
  generateAgentNodeStub,
};

// ————————————————————————————————————————————————————————————————
// Example (commented)
// ————————————————————————————————————————————————————————————————
/*
const orderFlow = createWorkflowProtocol({
  workflow:{ id:'order-fulfillment', name:'Order Fulfillment', purpose:'From order to delivery', migration_strategy:'finish_inflight' },
  sla:{ timeout:'2h', on_timeout_event:'workflow.timeout' },
  steps:[
    { id:'validate', type:'service', service:'order.validate', inputs:{ orderId:'ctx.orderId' } },
    { id:'charge',   type:'service', service:'billing.charge', dependencies:['validate'], inputs:{ amount:{ from:'validate.total' } }, side_effects:true },
    { id:'notify',   type:'event',   dependencies:['charge'], inputs:{ userId:{ from:'validate.userId' } } },
    { id:'approve',  type:'human',   dependencies:['charge'], human_task:{ role:'support', outcomes:['approved','rejected'], form_schema:{ fields:[{name:'notes'}] } } }
  ],
  metadata:{ owner:'commerce-team', tags:['orders'] }
});

console.log(orderFlow.validate());
console.log(orderFlow.match('steps:contains:human'));
console.log(orderFlow.generateVisualDAG());
console.log(orderFlow.diff(orderFlow.set('sla.timeout','1h').manifest()));
console.log(orderFlow.generateWorkflowEngine());

// ————————————————————————————————————————————————————————————————
// Agent Node Generator Examples
// ————————————————————————————————————————————————————————————————

// Example 1: Simple agent task
const simpleAgentFlow = createWorkflowProtocol({
  workflow:{ id:'article-generation', name:'AI Article Generation' },
  steps:[
    {
      id:'writeArticle',
      type:'agent',
      agent:{
        urn:'urn:proto:agent:writer@1.1.1',
        protocol:'a2a',
        timeout:'5m'
      }
    }
  ]
});

console.log(simpleAgentFlow.generateAgentNodeStub('writeArticle'));
// Generates async function with agent resolution, timeout handling, and error recovery

// Example 2: Agent with tools
const researchFlow = createWorkflowProtocol({
  workflow:{ id:'research-workflow', name:'Automated Research' },
  steps:[
    {
      id:'research',
      type:'agent',
      agent:{
        urn:'urn:proto:agent:researcher@1.1.1',
        tools:['webSearch', 'readPaper', 'summarize'],
        timeout:'10m'
      }
    }
  ]
});

console.log(researchFlow.generateAgentNodeStub('research'));
// Generates code with tool invocation stubs for each tool

// Example 3: Agent with resources and delegation
const dataFlow = createWorkflowProtocol({
  workflow:{ id:'data-analysis', name:'Secure Data Analysis' },
  steps:[
    {
      id:'analyze',
      type:'agent',
      agent:{
        urn:'urn:proto:agent:analyst@1.1.1',
        resources:['file:///data/sales.csv', 'postgres://db/analytics'],
        delegation:{
          urn:'urn:proto:iam:delegation@1.1.2#data-access-123'
        },
        timeout:'15m'
      },
      side_effects:true
    }
  ]
});

console.log(dataFlow.generateAgentNodeStub('analyze'));
// Generates code with resource access, delegation validation, and compensation hooks

// Example 4: Multi-agent orchestration
const contentPipeline = createWorkflowProtocol({
  workflow:{ id:'content-pipeline', name:'AI Content Pipeline' },
  steps:[
    {
      id:'research',
      type:'agent',
      agent:{ urn:'urn:proto:agent:researcher@1.1.1', tools:['webSearch'] }
    },
    {
      id:'write',
      type:'agent',
      agent:{ urn:'urn:proto:agent:writer@1.1.1' },
      dependencies:['research']
    },
    {
      id:'review',
      type:'agent',
      agent:{ urn:'urn:proto:agent:reviewer@1.1.1', tools:['checkGrammar', 'checkFacts'] },
      dependencies:['write']
    }
  ]
});

// Generate stubs for all agents
contentPipeline.manifest().steps
  .filter(s => s.type === 'agent')
  .forEach(s => {
    console.log(contentPipeline.generateAgentNodeStub(s.id));
  });

// Example 5: Using agent manifest capabilities
const agentManifest = {
  capabilities:{
    tools:[
      { name:'searchCode', inputSchema:{ type:'object', properties:{ query:{ type:'string' } } } },
      { name:'editFile', inputSchema:{ type:'object', properties:{ path:{ type:'string' }, content:{ type:'string' } } } }
    ],
    resources:[
      { uri:'file:///repo', name:'codebase', mimeType:'application/x-directory' }
    ],
    prompts:[
      { name:'reviewCode', arguments:['code', 'language'] }
    ]
  },
  timeout:'10m'
};

const codeFlow = createWorkflowProtocol({
  workflow:{ id:'code-assistant', name:'AI Code Assistant' },
  steps:[
    {
      id:'assist',
      type:'agent',
      agent:{ urn:'urn:proto:agent:coder@1.1.1' }
    }
  ]
});

// Pass manifest to enhance generated code
console.log(codeFlow.generateAgentNodeStub('assist', agentManifest));
// Generates comprehensive stub with all capabilities from manifest
*/
