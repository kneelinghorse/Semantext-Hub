# Long-Term Project Process Guide

## Managing Complex Projects Across Time

This guide covers how to use the CMOS mission system for projects ranging from weeks to years, maintaining efficiency and context coherence throughout.

## Session-Based Architecture

### Core Unit: The Mission Session
```yaml
session_definition:
  duration: One AI conversation
  tokens: 10k-40k typical
  deliverable: One complete, tested component
  documentation: Handoff for next session
```

### Mission Chains vs. Parallel Tracks
```
Sequential Chain (dependencies):
R1.1 → R1.2 → B1.1 → B1.2 → V1.1 → B1.3

Parallel Tracks (independent):
Track A: R1.1 → B1.1 → B1.2
Track B: R2.1 → B2.1 → B2.2  
Track C: R3.1 → B3.1 → B3.2
```

## Project Phases and Mission Allocation

### Phase 0: Research & Architecture
```yaml
duration: 10-20% of project timeline
mission_types: 80% research, 20% synthesis

typical_flow:
  week_1:
    - Parallel research missions (R1.1-R1.5)
    - Cross-validation missions (RV1.1-RV1.3)
    - Synthesis mission (S1.1)
    
  week_2:
    - Deep-dive research (R2.1-R2.3)
    - Architecture design (A1.1)
    - Feasibility validation (V1.1)

output: Technical architecture document
```

### Phase 1: Foundation Building
```yaml
duration: 20-30% of project timeline  
mission_types: 70% build, 20% validation, 10% research

typical_flow:
  - Core data structures (B1.1-B1.3)
  - Essential algorithms (B1.4-B1.6)
  - Infrastructure setup (B1.7-B1.9)
  - Integration framework (B1.10-B1.12)
  
mission_sizing: Focus on interfaces and contracts
```

### Phase 2: Feature Development
```yaml
duration: 30-40% of project timeline
mission_types: 60% build, 20% validation, 20% research

typical_flow:
  - Feature vertical slices (B2.1-B2.N)
  - Continuous validation (V2.1-V2.N)
  - Performance research (R3.1-R3.N)
  
parallel_tracks: 3-5 independent feature tracks
```

### Phase 3: Integration & Optimization
```yaml
duration: 20-30% of project timeline
mission_types: 40% build, 40% validation, 20% optimization

typical_flow:
  - System integration (B3.1-B3.5)
  - Performance optimization (O1.1-O1.5)
  - Comprehensive testing (V3.1-V3.10)
  
mission_sizing: Smaller, focused improvements
```

## Context Evolution Strategies

### The Onion Model
Core context that persists throughout project:
```
Layer 0 (Always): Project goals, critical constraints (1k tokens)
Layer 1 (Usually): Current architecture, key decisions (2k tokens)
Layer 2 (Often): Recent missions, active interfaces (3k tokens)  
Layer 3 (Sometimes): Historical decisions, old research (5k tokens)
Layer 4 (Rarely): Archived missions, deprecated features (10k tokens)
```

### Context Compression Checkpoints

#### Weekly Compression
```python
def weekly_context_compression():
    """Compress context to maintain efficiency"""
    return {
        'keep': [
            'Current week decisions',
            'Active interfaces',
            'Blocking issues'
        ],
        'summarize': [
            'Previous week details',
            'Resolved issues',
            'Completed features'
        ],
        'archive': [
            'Old mission logs',
            'Superseded decisions',
            'Deprecated code'
        ]
    }
```

#### Monthly Architecture Refresh
```yaml
process:
  1. Review all research findings
  2. Update architecture document
  3. Deprecate outdated patterns
  4. Reset mission numbering if over 50
  5. Create new synthesis document
  
time_required: One dedicated session
tokens_budget: 30-40k
```

## Managing Technical Debt Across Time

### Debt Tracking Pattern
```json
{
  "mission_id": "B12.3",
  "technical_debt": [
    {
      "type": "performance",
      "description": "Naive O(n²) algorithm",
      "impact": "medium",
      "fix_mission": "O2.3"
    }
  ],
  "deferred_to": "Phase 3"
}
```

### Debt Payment Strategy
```yaml
allocation_rule:
  feature_missions: 70%
  debt_payment: 20%
  research: 10%
  
sprint_pattern:
  week_1-3: Feature development
  week_4: Debt payment sprint
```

## Multi-Month Project Example

### Month 1: Foundation
```yaml
Week 1:
  Mon-Tue: Research sprint (R1.1-R1.6)
  Wed: Architecture synthesis (S1.1)
  Thu-Fri: Core setup (B1.1-B1.3)
  
Week 2-3:
  Daily: 2-3 build missions
  Every 3rd session: Validation mission
  
Week 4:
  Integration missions (I1.1-I1.3)
  Monthly synthesis (S1.2)
  Context compression (C1.1)

Total missions: ~45
Tokens used: ~1.2M
```

### Month 2-3: Scale Up
```yaml
Parallel tracks: 3
Daily missions: 4-6
Weekly validation: 5-8 missions

Context management:
  - Weekly compression
  - Bi-weekly architecture review
  - Track-specific context files
  
Total missions: ~200
Tokens used: ~5M
```

### Month 4-6: Feature Complete
```yaml
Focus: Integration and polish
Mission types:
  - Integration: 30%
  - Optimization: 30%
  - Testing: 25%
  - Documentation: 15%
  
Context strategy:
  - Feature freeze context
  - Performance baseline tracking
  - User feedback integration
  
Total missions: ~300
Tokens used: ~7M
```

## Mission Numbering Conventions

### Standard Numbering
```
R[phase].[sequence] - Research missions
B[phase].[sequence] - Build missions
V[phase].[sequence] - Validation missions
O[phase].[sequence] - Optimization missions
I[phase].[sequence] - Integration missions
S[phase].[sequence] - Synthesis missions
```

### Long Project Reset Pattern
```yaml
when_to_reset:
  - After major milestone
  - When sequence > 99
  - At quarter boundaries
  
reset_strategy:
  old: B1.47
  new: B2.1 (Phase 2, mission 1)
  archived: Store old numbers in archive
```

## Sustainable Velocity Patterns

### The Marathon Pace
```yaml
sustainable_daily_rate:
  solo_developer: 2-3 missions/day
  focused_sprint: 4-6 missions/day
  maintenance_mode: 1-2 missions/day
  
weekly_pattern:
  monday: Planning + 2 missions
  tue-thu: 3 missions/day
  friday: 2 missions + weekly review
  
total_weekly: ~12-15 missions
```

### Sprint vs. Sustain
```yaml
sprint_week: # Deadline push
  missions: 20-25
  focus: Single objective
  duration: 1 week max
  recovery: 50% pace next week
  
sustain_week: # Normal pace
  missions: 12-15
  focus: Balanced progress
  duration: Indefinite
  health: Include breaks
```

## Knowledge Preservation

### Living Documentation
```markdown
project-knowledge/
├── architecture/
│   ├── current.md (5k tokens)
│   ├── decisions.md (3k tokens)
│   └── deprecated.md (archived)
├── research/
│   ├── synthesis.md (10k tokens)
│   ├── findings/ (by topic)
│   └── evidence/ (raw data)
├── patterns/
│   ├── successful.md
│   ├── failures.md
│   └── lessons.md
└── context/
    ├── week-current.json
    ├── month-summary.json
    └── quarter-archive/
```

### Knowledge Transfer Protocol
For team handoffs or returning after break:
```yaml
catch_up_session:
  1. Read latest synthesis (5k tokens)
  2. Review current architecture (3k tokens)
  3. Check active missions (2k tokens)
  4. Verify understanding with validation mission
  
time_to_productive: ~2 sessions
```

## Multi-Year Project Considerations

### Year-Long Rhythm
```yaml
Q1: Foundation & Research
  - Deep research phase
  - Architecture establishment
  - Core infrastructure
  
Q2: Primary Development
  - Feature build-out
  - Continuous validation
  - User feedback integration
  
Q3: Scale & Optimization
  - Performance tuning
  - Scale testing
  - Feature refinement
  
Q4: Polish & Evolution
  - Production hardening
  - Documentation completion
  - Next year planning
```

### Context Evolution Over Years
```python
def yearly_context_evolution():
    """Major context transformation points"""
    return {
        'month_1-3': 'Exploration context',
        'month_4-6': 'Building context',
        'month_7-9': 'Refinement context',
        'month_10-12': 'Evolution context',
        'year_2': 'Maintenance + new features context'
    }
```

### Preventing Mission Fatigue
```yaml
variety_patterns:
  - Alternate research and build
  - Include creative missions
  - Schedule regular refactoring
  - Celebrate milestones
  
team_patterns:
  - Rotate mission types
  - Pair on complex missions
  - Share validation duties
  - Document wins
```

## Success Metrics for Long Projects

### Health Indicators
```yaml
green_flags:
  - Consistent velocity (variance < 20%)
  - Declining rework rate
  - Increasing test coverage
  - Clear handoff notes
  
yellow_flags:
  - Velocity variance > 40%
  - Increasing context load
  - Mission dependencies piling up
  - Validation skipping
  
red_flags:
  - Missions taking multiple sessions
  - Context exceeding 15k tokens
  - Rework > 30% of missions
  - Architecture drift
```

### Recovery Patterns
```yaml
from_yellow:
  - Compression session
  - Architecture review
  - Dependency untangling
  - Velocity reset
  
from_red:
  - Full stop and review
  - Context reset
  - Architecture refactor
  - Process retrospective
```

---

*The key to long projects is sustainable rhythm, not maximum speed. Build in compression, review, and recovery to maintain velocity over months and years.*