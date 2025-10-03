# Token-Efficient Mission Management

## Core Principle: Session-Based Optimization

Every mission is designed to complete within a single AI session, optimizing for:
- **Token efficiency**: Maximum output per token spent
- **Context preservation**: Minimal context reload between sessions
- **Cognitive continuity**: Clear handoffs between missions

## Mission Sizing Guidelines

### Optimal Mission Sizes by Type

#### Research Missions
```yaml
optimal_range: 10k-20k tokens
max_recommended: 25k tokens

components:
  context_load: 2-3k
  queries: 3-5k  
  responses: 10-15k
  synthesis: 2-3k

split_when:
  - Multiple unrelated research areas
  - Need different AI systems for validation
  - Exceeds 25k estimated tokens
```

#### Build Missions
```yaml
optimal_range: 20k-35k tokens  
max_recommended: 40k tokens

components:
  context_load: 5-7k
  implementation: 15-20k
  tests: 5-8k
  documentation: 3-5k

split_when:
  - Multiple components
  - Complex integrations
  - Exceeds 40k estimated tokens
```

#### Validation Missions
```yaml
optimal_range: 5k-10k tokens
max_recommended: 15k tokens

components:
  code_to_review: 3-5k
  validation_queries: 2-3k
  feedback: 3-5k
  refinements: 2-3k

split_when:
  - Multiple components to validate
  - Need different validation perspectives
  - Exceeds 15k tokens
```

## Long Project Management (Weeks/Months/Years)

### Mission Chaining Strategy
```
Week 1:  R1.1 → R1.2 → B1.1 → B1.2 → V1.1
Week 2:  R2.1 → B1.3 → B2.1 → B2.2 → V2.1
Week 3:  B2.3 → B3.1 → V3.1 → R3.1 → B3.2
...
Month 6: R45.1 → B67.3 → V41.2 → Integration
```

### Context Preservation Across Time

#### Weekly Checkpoint
```json
{
  "week": 12,
  "missions_completed": ["R12.1", "R12.2", "B11.4", "B12.1"],
  "key_decisions": ["chose Algorithm X", "deferred Feature Y"],
  "technical_debt": ["need optimization in B11.4"],
  "next_week_priorities": ["complete integration", "performance testing"]
}
```

#### Monthly Architecture Review
- Synthesize all research findings
- Update technical architecture
- Refactor mission dependencies
- Prune outdated context

#### Quarterly Compression
- Archive completed mission details
- Keep only essential decisions
- Update project knowledge base
- Reset mission numbering if needed

## Token Efficiency Patterns

### The Pyramid Pattern
Start sessions with minimal context, expand as needed:
```
Level 1 (2k tokens): Core objective + immediate dependencies
Level 2 (5k tokens): Add previous mission outputs
Level 3 (8k tokens): Add research findings
Level 4 (12k tokens): Add full architecture
```

### The Relay Pattern  
Each mission hands off exactly what the next needs:
```
Mission B1.1 outputs → interface_definition.json
Mission B1.2 inputs → interface_definition.json (500 tokens)
```

### The Batch Pattern
Group related micro-missions to amortize context load:
```
Single Session (30k total):
- Fix bug in component A (5k)
- Fix related bug in component B (5k)  
- Update tests for both (10k)
- Update documentation (10k)

vs. 

Four Sessions (60k total):
- Each would need 5k context reload
```

## Mission Decomposition Strategies

### Horizontal Slicing (Layers)
```
Mission B1: Data layer (all models)
Mission B2: Service layer (all services)
Mission B3: API layer (all endpoints)
```

### Vertical Slicing (Features)
```
Mission B1: User authentication (full stack)
Mission B2: User profile (full stack)
Mission B3: User settings (full stack)
```

### Risk-First Slicing
```
Mission B1: Hardest technical challenge
Mission B2: Key integration point
Mission B3: Performance bottleneck
```

## Efficiency Metrics

### Per-Mission Metrics
```yaml
efficiency_score:
  formula: (lines_of_code + tests_written + docs_created) / tokens_used
  
  good: > 0.5 deliverables per 1k tokens
  excellent: > 1.0 deliverables per 1k tokens
  
quality_score:
  formula: (tests_passing + integration_success - rework_required) / total_items
  
  acceptable: > 0.7
  good: > 0.85
  excellent: > 0.95
```

### Project-Level Metrics
```yaml
mission_velocity:
  weekly_average: [number of missions]
  trend: [increasing/stable/decreasing]
  
context_overhead:
  average_reload: [tokens per session]
  optimization_opportunity: [where to reduce]
  
research_leverage:
  findings_used: [% of research applied]
  redundant_research: [% repeated unnecessarily]
```

## Anti-Patterns to Avoid

### Token Waste Patterns
```yaml
context_reload_waste:
  problem: Loading same context repeatedly
  solution: Batch related missions

exploration_waste:
  problem: Unfocused research without objectives
  solution: Define specific questions upfront

rework_waste:
  problem: Rebuilding due to poor validation
  solution: Mandatory cross-AI validation

documentation_waste:
  problem: Verbose documentation nobody reads
  solution: Terse, actionable handoff notes
```

### Mission Sizing Anti-Patterns
```yaml
mega_mission:
  problem: 50k+ token missions that timeout
  solution: Split into 2-3 focused missions

micro_mission:
  problem: 5k token missions with 4k context overhead
  solution: Batch into logical groups

dependency_cascade:
  problem: Mission C needs B needs A, all in sequence
  solution: Identify parallel opportunities
```

## Progressive Context Loading

### For New Sessions
```python
def load_context_progressively(mission_type, complexity):
    """Load only necessary context for token efficiency"""
    
    context = {}
    
    # Level 1: Always load (2k tokens)
    context['core'] = {
        'project_name': PROJECT_CONTEXT.project.name,
        'current_mission': mission_id,
        'critical_constraints': get_critical_constraints()
    }
    
    # Level 2: Load if needed (3k tokens)
    if complexity > 'simple':
        context['dependencies'] = {
            'previous_mission_output': get_last_mission_output(),
            'interfaces': get_relevant_interfaces()
        }
    
    # Level 3: Load if complex (5k tokens)
    if complexity == 'high':
        context['architecture'] = {
            'system_design': get_architecture_summary(),
            'research_findings': get_relevant_research()
        }
    
    return optimize_context(context)
```

## Examples for Different Project Scales

### Rapid Prototype (3-day)
```yaml
Day 1:
  Morning: R1.1, R1.2, R1.3 (parallel research)
  Afternoon: Architecture synthesis
  
Day 2:
  Morning: B1.1, B1.2 (core builds)
  Afternoon: B1.3, B1.4 (features)
  
Day 3:
  Morning: B2.1 (integration)
  Afternoon: V1.1 (validation), deployment
  
Total missions: 11
Total tokens: ~250k
```

### Startup MVP (3-month)
```yaml
Month 1:
  Week 1-2: Research phase (15 missions)
  Week 3-4: Core infrastructure (20 missions)
  
Month 2:
  Week 5-6: Feature development (25 missions)
  Week 7-8: Integration & testing (20 missions)
  
Month 3:
  Week 9-10: Polish & optimization (15 missions)
  Week 11-12: Documentation & deployment (10 missions)
  
Total missions: 105
Total tokens: ~2.5M
Context resets: 2 (monthly)
```

### Enterprise System (1-year)
```yaml
Quarters:
  Q1: Research & architecture (150 missions)
  Q2: Core platform (200 missions)
  Q3: Feature buildout (250 missions)
  Q4: Integration & optimization (200 missions)
  
Management:
  Weekly synthesis: 52 sessions
  Monthly architecture review: 12 sessions
  Quarterly context reset: 4 sessions
  
Total missions: ~850
Total tokens: ~20M
Efficiency gains from process: 40-60%
```

## Mission Handoff Protocol

### End of Session Checklist
```yaml
before_closing:
  - Update PROJECT_CONTEXT.json
  - Create handoff note with:
    - What was completed
    - Key decisions made  
    - Next mission setup
    - Any blockers found
  - Log metrics:
    - Tokens used
    - Efficiency score
    - Time spent
```

### Starting Next Session
```yaml
context_setup:
  1. Load handoff note (500 tokens)
  2. Load only needed context (2-5k tokens)
  3. Verify understanding with AI
  4. Begin mission execution
```

---

*Remember: The goal is sustainable velocity over time, not speed in a single session. Optimize for total project tokens, not individual mission tokens.*