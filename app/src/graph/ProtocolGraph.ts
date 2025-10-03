// src/graph/ProtocolGraph.ts
export type NodeKind = 'api'|'api.endpoint'|'data'|'event'|'semantic';
export type EdgeKind = 'depends'|'produces'|'consumes'|'references';

export class ProtocolGraph {
  nodes = new Map<string,{ kind:NodeKind, manifest:any }>();
  edges = new Map<string, Array<{ kind:EdgeKind, to:string }>>();

  add(urn:string, kind:NodeKind, manifest:any){
    this.nodes.set(urn, { kind, manifest });
    if(!this.edges.has(urn)) this.edges.set(urn, []);
  }
  link(from:string, kind:EdgeKind, to:string){
    const arr = this.edges.get(from) || [];
    arr.push({ kind, to }); this.edges.set(from, arr);
  }

  /** Trace PII sources reaching an API endpoint URN. */
  tracePIIForEndpoint(endpointUrn:string){
    const out:Array<{dataset:string, field:string, urn:string}> = [];
    const seen = new Set<string>();
    const dfs = (u:string)=>{
      if(seen.has(u)) return; seen.add(u);
      const n = this.nodes.get(u); if(!n) return;
      // Data Protocol PII fields
      if(n.kind==='data'){
        const fields = Object.entries(n.manifest?.schema?.fields||{})
          .filter(([_,f]:any)=>f?.pii===true)
          .map(([name])=>({dataset:n.manifest?.dataset?.name, field:String(name), urn:u}));
        out.push(...fields);
      }
      for(const e of (this.edges.get(u)||[])) dfs(e.to);
    };
    dfs(endpointUrn);
    return out;
  }

  /** Direct + transitive dependents, and whether any path implies a breaking change. */
  impactOfChange(urn:string){
    const direct = (this.edges.get(urn)||[]).map(e=>e.to);
    const transitive = new Set<string>();
    const stack = [...direct];
    while(stack.length){
      const x = stack.pop()!;
      if(transitive.has(x)) continue;
      transitive.add(x);
      for(const e of (this.edges.get(x)||[])) stack.push(e.to);
    }
    // Heuristic: use each protocol’s diff/breaking signals if available.
    const breaking = true; // placeholder flag; wire to per-protocol diff results later.
    return { direct, transitive:[...transitive], breaking };
  }
}