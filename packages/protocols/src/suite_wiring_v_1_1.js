/*
 * Suite Wiring — v1.1.2 Agent Integration Patches
 * Purpose: minimal changes to wire Agent Protocol v1.1.1 into the v1.1.1 family.
 * Strategy: small, surgical patches that keep zero‑deps + manifest/validate/query/diff/generate patterns.
 *
 * Contents
 * 1) Regex updates so URNs may reference `agent` across protocols
 * 2) Workflow v1.1.2: add `type:"agent"` node support
 * 3) AI/ML v1.1.2: add `contextCapabilities` section
 * 4) IAM v1.1.2: add `DelegationManifest` kind (lightweight)
 * 5) Integration v1.1.2: add `agentMapping` conveniences
 * 6) Docs v1.1.2: let docs link to agent URNs
 * 7) Observability v1.1.2: permit coverage of agent URNs
 * 8) Release v1.1.2: allow targets/observability references to agents
 * 9) Tiny smoke tests
 */

// ————————————————————————————————————————————————————————————————
// 1) Regex updates (copy/paste into each protocol file where isURN is defined)
// ————————————————————————————————————————————————————————————————
// BEFORE (example from Documentation/Observability/Release):
// const isURN = s => typeof s==='string' && /^urn:proto:(api|data|event|ui|workflow|infra|device|ai|iam|metric|integration|testing|docs|obs|config|release):[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);
// AFTER (add `agent` to the union):
const isURN_withAgent = s => typeof s==='string' &&
  /^urn:proto:(api|data|event|ui|workflow|infra|device|ai|iam|metric|integration|testing|docs|obs|config|release|agent):[a-zA-Z0-9._-]+@[\d.]+(#[^#\s]+)?$/.test(s);

// Apply this change in:
// - Documentation Protocol — v1.1.1.js
// - Observability Protocol — v1.1.1.js
// - Release:Deployment Protocol — v1.1.1.js
// - Configuration Protocol — v1.1.1.js (if using the union variant)
// (Integration & Testing already accept generic `[a-z]+` or include agent.)

// ————————————————————————————————————————————————————————————————
// 2) Workflow v1.1.2: add `agent` node type (validator + minimal generator)
// ————————————————————————————————————————————————————————————————
function registerWorkflowAgentExtensions({registerValidator, dget, dset, clone, hash}){
  // Add validator for agent nodes
  registerValidator('nodes.agent', m => {
    const issues=[];
    for(const [i,n] of (m?.spec?.nodes||[]).entries()){
      if(n.type==='agent'){
        if(!n.agent?.urn && !n.agent?.discoveryUri)
          issues.push({path:`spec.nodes[${i}].agent`, msg:'`urn` or `discoveryUri` required for agent node', level:'error'});
        if(n.agent?.delegation && !n.agent?.delegation?.urn)
          issues.push({path:`spec.nodes[${i}].agent.delegation.urn`, msg:'delegation.urn required when delegation provided', level:'error'});
      }
    }
    return { ok: issues.length===0, issues };
  });

  // Optional: small generator for A2A/MCP task stubs
  function generateAgentNodeStub(n){
    return {
      kind:'agent_task', id:n.id,
      call:{ protocol:(n.agent?.protocol||'a2a'), endpoint:n.agent?.endpoint||n.agent?.discoveryUri||'', skill:n.agent?.skill||'', input:n.agent?.inputMapping||{} }
    };
  }
  return { generateAgentNodeStub };
}

// Expected manifest shape additions in Workflow v1.1.2:
// spec.nodes[].type: 'service'|'human'|'task'|...|'agent'
// spec.nodes[].agent: { urn?:string, discoveryUri?:string, protocol?:'a2a'|'mcp'|'custom', skill?:string,
//                        inputMapping?:Object, outputMapping?:Object, delegation?:{ urn:string } }

// ————————————————————————————————————————————————————————————————
// 3) AI/ML v1.1.2: add `contextCapabilities` (validators + no runtime dep)
// ————————————————————————————————————————————————————————————————
function patchAimlContextCapabilities({registerValidator}){
  registerValidator('context.capabilities', m => {
    const issues=[]; const cc=m?.contextCapabilities; if(!cc) return {ok:true};
    for(const [i,t] of (cc.tools||[]).entries()) if(!t.name) issues.push({path:`contextCapabilities.tools[${i}].name`, msg:'name required', level:'error'});
    for(const [i,r] of (cc.resources||[]).entries()) if(!r.uri) issues.push({path:`contextCapabilities.resources[${i}].uri`, msg:'uri required', level:'error'});
    return { ok:issues.length===0, issues };
  });
}
// Expected AI/ML manifest addition:
// contextCapabilities: { tools:[{name, inputSchema?, outputSchema?, urn?}], resources:[{uri, name?, mimeType?, urn?}], prompts:[{name, arguments?[], urn?}], sampling?:{ enabled?:boolean, maxTokens?:number } }

// ————————————————————————————————————————————————————————————————
// 4) IAM v1.1.2: lightweight DelegationManifest kind
// ————————————————————————————————————————————————————————————————
function createDelegationManifest(min){
  /* Example shape (stand-alone helper if IAM file is unchanged):
  {
    iam:{ kind:'DelegationManifest', id:'deleg-xyz', lifecycle:{status:'active'} },
    principal:{ type:'user', urn:'urn:proto:iam:user@1.1.1#123' },
    delegate:{ type:'agent', urn:'urn:proto:agent:payment@1.1.1' },
    authorization:{ scope:'payment.execute', constraints:[{ type:'budget', maxAmount:500, currency:'USD' }] },
    validity:{ notBefore:'2025-10-01T00:00:00Z', notAfter:'2025-10-31T23:59:59Z' }
  }
  */
  return Object.assign({ iam:{ kind:'DelegationManifest', id:'deleg-unknown' } }, min||{});
}
function registerIamDelegationValidators({registerValidator, isURN}){
  registerValidator('delegation.core', m=>{
    const issues=[];
    if(m?.iam?.kind!=='DelegationManifest') return {ok:true};
    if(!m?.principal?.urn || !isURN(m.principal.urn)) issues.push({path:'principal.urn', msg:'valid URN required', level:'error'});
    if(!m?.delegate?.urn || !isURN(m.delegate.urn)) issues.push({path:'delegate.urn', msg:'valid URN required', level:'error'});
    if(!m?.authorization?.scope) issues.push({path:'authorization.scope', msg:'required', level:'error'});
    return { ok:issues.length===0, issues };
  });
}

// ————————————————————————————————————————————————————————————————
// 5) Integration v1.1.2: agentMapping conveniences
// ————————————————————————————————————————————————————————————————
function registerIntegrationAgentMapping({registerValidator}){
  // Add optional, non-breaking mapping section
  registerValidator('mapping.agent', m=>{
    const issues=[]; const am=m?.agentMapping; if(!am) return {ok:true};
    if(am.conversationContext && typeof am.conversationContext.enabled!=='boolean')
      issues.push({path:'agentMapping.conversationContext.enabled', msg:'boolean required', level:'error'});
    return { ok:issues.length===0, issues };
  });
}
// Expected Integration addition:
// agentMapping: { conversationContext?:{enabled:boolean, preserveHistory?:boolean}, artifactMapping?:[ { sourceArtifact, destinationInput, transformation? } ], taskChaining?:{ mode:'sequential'|'parallel', errorHandling?:'compensate'|'fail' } }

// ————————————————————————————————————————————————————————————————
// 6) Documentation v1.1.2: allow linking to agents
// ————————————————————————————————————————————————————————————————
function patchDocsURNRegex(){
  // Replace isURN with the union that includes `agent` (see 1)
  return isURN_withAgent;
}

// ————————————————————————————————————————————————————————————————
// 7) Observability v1.1.2: permit agent URNs in relationships.targets
// ————————————————————————————————————————————————————————————————
function patchObsURNRegex(){
  // Replace isURN with the union that includes `agent` (see 1)
  return isURN_withAgent;
}

// ————————————————————————————————————————————————————————————————
// 8) Release v1.1.2: allow targeting agents & linking agent-aware obs
// ————————————————————————————————————————————————————————————————
function patchReleaseURNRegex(){
  // Replace isURN with the union that includes `agent` (see 1)
  return isURN_withAgent;
}

// ————————————————————————————————————————————————————————————————
// 9) Tiny smoke tests (run ad hoc in Node)
// ————————————————————————————————————————————————————————————————
function _smoke(){
  // Agent URN acceptance in protocols that previously excluded it
  const ok1 = isURN_withAgent('urn:proto:agent:writer@1.1.1');
  const ok2 = isURN_withAgent('urn:proto:agent:writer@1.1.1#tool.write');
  if(!ok1||!ok2) throw new Error('agent URN regex failed');

  // Example workflow node
  const wf={ spec:{ nodes:[{ id:'write', type:'agent', agent:{ urn:'urn:proto:agent:writer@1.1.1', skill:'write_article' } }] } };
  const issues=[]; const res = { ok: issues.length===0, issues };// placeholder invoke of nodes.agent validator

  // Example AI/ML with contextCapabilities
  const aiml={ model:{id:'m1',name:'writer',type:'llm'}, training:{data_urns:['urn:proto:data:docs@1.1.1']}, contextCapabilities:{ tools:[{name:'search_code'}], resources:[{uri:'file://repo'}] } };
  // placeholder run of context.capabilities validator

  return true;
}

module.exports = {
  // patch points
  isURN_withAgent,
  registerWorkflowAgentExtensions,
  patchAimlContextCapabilities,
  createDelegationManifest,
  registerIamDelegationValidators,
  registerIntegrationAgentMapping,
  patchDocsURNRegex,
  patchObsURNRegex,
  patchReleaseURNRegex,
  _smoke
};
