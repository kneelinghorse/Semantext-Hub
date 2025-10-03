# Build Mission [B#.#]: [Component/Feature Name]

## Mission Metadata
- **Session Type**: Build
- **Estimated Tokens**: [10k-30k recommended per session]
- **Complexity**: [Low/Medium/High]
- **Dependencies**: [Previous missions required]
- **Enables**: [Future missions this unblocks]

## Token Budget Planning
```yaml
context_load:
  project_context: 2k
  previous_code: 3k
  research_findings: 2k
  
generation_budget:
  implementation: 15k
  tests: 5k
  documentation: 3k
  
validation_reserve: 5k
total_estimated: 35k
```

## Research Foundation
Applied findings from research missions:
- **[R#.#]**: [Specific algorithm/pattern to implement]
- **[R#.#]**: [Performance target to meet]
- **[R#.#]**: [Constraint to respect]

## Implementation Scope
*Sized for single session completion*

### Core Deliverable
```[language]
// Primary component/feature to build
// Keep scope to what fits in one session
// Prefer multiple small missions over one large
```

### Out of Scope (Future Missions)
- [Feature that would exceed token budget]
- [Integration that needs separate mission]
- [Optimization for later mission]

## Success Criteria
- [ ] Core functionality implemented
- [ ] Unit tests passing
- [ ] Performance baseline met: [metric]
- [ ] Integration points defined
- [ ] Documentation complete

## Implementation Checklist
### Essential (This Session)
- [ ] Main component logic
- [ ] Critical error handling
- [ ] Basic tests
- [ ] Interface definition

### Deferred (Next Mission)
- [ ] Edge case handling
- [ ] Performance optimization
- [ ] Extended testing
- [ ] UI polish

## Validation Protocol
For cross-AI validation in same or next session:
```yaml
validate_with_gpt4:
  focus: algorithm correctness
  tokens: ~5k

validate_with_gemini:
  focus: production readiness
  tokens: ~5k
  
validate_with_claude:
  focus: architecture alignment
  tokens: ~5k
```

## Session Efficiency Metrics
Track for process optimization:
- Lines of working code per 1k tokens
- Test coverage achieved
- Rework required in validation
- Integration issues discovered

## Handoff Context
For next session or parallel missions:
```json
{
  "completed": ["list of what's done"],
  "interfaces": ["defined APIs"],
  "assumptions": ["decisions made"],
  "next_mission": "B#.#",
  "blockers": ["any issues found"]
}
```

## Mission Sizing Guidelines
**Split this mission if:**
- Estimated tokens > 40k
- Multiple unrelated components
- Can't complete in one session
- Dependencies not ready

**Combine with next if:**
- Under 10k tokens estimated
- Tightly coupled logic
- Same test suite
- Minimal context switch

---
*Session completed: [timestamp]*
*Actual tokens: [count]*
*Efficiency score: [deliverables/token]*