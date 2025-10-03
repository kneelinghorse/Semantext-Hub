# CMOS Mission-Based Development Process

## Overview: The Two-Track System

The CMOS process uses parallel research and build tracks to achieve rapid, informed development. Research stays 1-2 days ahead, continuously gathering intelligence that informs builds.

```
Day 0    week 1       week 2       week 3       week 4
  │        │            │            │            │
  ▼        ▼            ▼            ▼            ▼
RESEARCH━━━R1.1━━━━━━R2.1━━━━━━━R3.1━━━━━━━━Future━━━▶
           R1.2       R2.2       R3.2
           R1.3       R2.3
             │          │          │
             ▼          ▼          ▼
BUILD        └───B1.1───B2.1───B3.1───Deploy
                 B1.2   B2.2   B3.2
                 B1.3   B2.3
```

## Phase 0: Research Sprint (Day 0)

### Objective
Gather comprehensive intelligence to inform entire project.

### Duration
4-8 hours (can be split across sessions)

### Process

#### 1. Define Research Missions
Create 3-5 parallel research missions targeting different aspects:
- **R1.1:** Problem space & existing solutions
- **R1.2:** Algorithm & performance research  
- **R1.3:** User behavior & adoption patterns
- **R1.4:** Technical constraints & requirements
- **R1.5:** Market landscape & competition

#### 2. Execute Parallel Research
Open multiple browser tabs, query different AIs simultaneously:

**Tab 1 - Claude:**
```
Deep technical analysis:
"What are the best algorithms for [problem]? 
Explain implementation details and performance characteristics."
```

**Tab 2 - ChatGPT:**
```
Alternative approaches:
"What are different ways to solve [problem]?
Compare pros and cons of each approach."
```

**Tab 3 - Gemini:**
```
Comprehensive review:
"Analyze [problem space] comprehensively.
Include edge cases, failure modes, and production considerations."
```

**Tab 4 - Perplexity:**
```
Current market research:
"What solutions exist for [problem]?
Include recent developments and benchmarks."
```

#### 3. Document Findings
For each research mission, record:
- Key findings with evidence
- Performance benchmarks
- Algorithm recommendations
- Implementation patterns
- Risks and constraints

#### 4. Cross-Validate
Take findings from one AI, validate with another:
```
"ChatGPT claims [X]. Can you verify this and identify any issues?"
```

### Deliverable: Research Synthesis Document
Consolidate all findings into architectural decisions.

## Phase 1: Architecture Design

### Objective
Convert research into technical specification.

### Duration
2-4 hours

### Process

#### 1. Synthesize Research
- Identify consensus findings across AIs
- Resolve conflicts through additional validation
- Extract key technical decisions

#### 2. Create Architecture
Based on research synthesis:
```markdown
# System Architecture

## Core Components
1. [Component A] - Uses [algorithm from R1.2]
2. [Component B] - Implements [pattern from R1.3]

## Performance Targets
- Throughput: [metric from R1.2]
- Latency: [metric from R1.4]

## Integration Strategy
- [Approach from R1.5]
```

#### 3. Define Build Sequence
Map components to missions:
- B1.#: Foundation components
- B2.#: Intelligence layer
- B3.#: Integration & polish

### Deliverable: Technical Architecture Document

## Phase 2: Build Sprint (Days 1-3)

### Daily Rhythm
```
Morning (2-3 hours):
- Execute 2-3 build missions
- Cross-validate each build

Afternoon (2-3 hours):
- Execute 2-3 more builds
- Run next day's research

Evening (1 hour):
- Integration testing
- Documentation updates
```

### Mission Execution Pattern

#### Step 1: Primary Build (45-60 min)
With Claude/Cursor:
```
"Implement [component] based on these research findings:
- Algorithm: [specific from research]
- Performance target: [metric]
- Known constraints: [list]"
```

#### Step 2: Validation (15-20 min)
With ChatGPT:
```
"Validate this implementation:
[paste code]
Check for performance issues, edge cases, and better alternatives."
```

#### Step 3: Review (15-20 min)
With Gemini:
```
"Review for production readiness:
[paste code]
Focus on scalability, security, and maintainability."
```

#### Step 4: Integration (30-45 min)
- Apply feedback
- Write tests
- Verify performance
- Update documentation

### Parallel Research Execution
While builds execute, run research for tomorrow:
```
Morning Build B2.1 → Research R3.1 for Day 3
Afternoon Build B2.2 → Research R3.2 for integration
```

## Phase 3: Integration & Polish (Day 3-4)

### Objective
Complete system integration and prepare for deployment.

### Process

#### 1. System Integration Mission (B3.1)
Connect all components:
```
"Integrate components A, B, C into complete system.
Use research findings about integration patterns.
Target end-to-end latency of [metric]."
```

#### 2. Performance Optimization (B3.2)
If performance doesn't meet targets:
```
"Emergency Mission: Optimize performance
Current: [metric]
Target: [metric]
Allowed changes: [any/specific components]"
```

#### 3. User Experience Polish (B3.3)
Based on user research:
```
"Implement [UX improvements] based on research showing
users abandon if [condition]."
```

### Deliverable: Working System

## Mission Patterns & Techniques

### The Cross-Validation Pattern
Prevents accumulation of errors:
```
Claude (Build) → ChatGPT (Validate) → Gemini (Review) → 
Claude (Refine) → Local Testing → Documentation
```

### The Emergency Pivot Pattern
When blockers appear:
```
1. STOP current mission
2. Create emergency research mission (30 min timebox)
3. Query all AIs simultaneously for solutions
4. Synthesize rapidly
5. Create unplanned build mission
6. Resume original flow
```

### The Parallel Processing Pattern
Maximize velocity:
```
While AI-1 generates code:
  → Start research prompt with AI-2
  → Prepare test data locally
  → Document previous mission
```

### The Evidence Chain Pattern
Maintain traceability:
```
Research finding (R1.2) → 
  Architectural decision (Doc) → 
    Build specification (B1.3) → 
      Implementation (Code) → 
        Validation (Tests)
```

## Quality Control Gates

### Research Quality Gate
Before proceeding from research:
- [ ] Core questions answered
- [ ] Evidence documented
- [ ] Conflicts resolved
- [ ] Performance targets set

### Build Quality Gate
Before marking mission complete:
- [ ] Tests passing
- [ ] Cross-validated
- [ ] Performance measured
- [ ] Documentation current

### Integration Quality Gate
Before deployment:
- [ ] End-to-end tests passing
- [ ] Performance targets met
- [ ] Error handling complete
- [ ] User feedback incorporated

## Common Pitfalls & Solutions

### Pitfall 1: Research-Build Disconnect
**Problem:** Builds don't use research findings
**Solution:** Explicitly reference research in build missions

### Pitfall 2: Mission Scope Creep
**Problem:** Missions expand beyond single session
**Solution:** Split immediately into multiple missions

### Pitfall 3: Validation Skipping
**Problem:** Not cross-checking with other AIs
**Solution:** Make validation mandatory in process

### Pitfall 4: Documentation Lag
**Problem:** Code advances beyond documentation
**Solution:** Documentation missions run in parallel

### Pitfall 5: Integration Surprise
**Problem:** Components don't fit together
**Solution:** Define interfaces during architecture phase

## Metrics & Tracking

### Research Metrics
- Questions answered: [count]
- Findings validated: [percentage]
- Build missions enabled: [count]
- Research-to-build lag: [days]

### Build Metrics  
- Missions per day: [4-6 target]
- Success rate: [>80% target]
- Cross-validation issues: [count]
- Performance vs. target: [percentage]

### Overall Metrics
- Time to working prototype: [days]
- Research leverage ratio: [findings:features]
- Rework required: [<10% target]
- Test coverage: [>80% target]

## Tools & Setup

### Required Tools
- **Browser:** Multiple tabs for parallel AI sessions
- **IDE:** For code integration and testing
- **Terminal:** For running tests and benchmarks
- **Git:** For version control between missions

### Recommended AI Access
- **Claude:** Primary development partner
- **ChatGPT:** Validation and alternatives
- **Gemini:** Deep review and production readiness
- **Perplexity:** Current information and benchmarks
- **Cursor/GitHub Copilot:** Inline assistance

### Directory Structure
```
project/
├── missions/
│   ├── research/      # Research missions
│   ├── build/         # Build missions
│   └── templates/     # Mission templates
├── research/
│   ├── findings/      # Raw research output
│   └── synthesis/     # Synthesized insights
├── src/              # Implementation
├── tests/            # Test suites
└── docs/             # Architecture & documentation
```

## Success Indicators

### You're On Track If:
- Research findings directly appear in code
- Each mission completes in <4 hours
- Cross-validation finds minor issues only
- Performance meets targets on first try
- Integration "just works"

### You Need to Adjust If:
- Missions take >4 hours
- Major rework required after validation
- Research doesn't answer build questions
- Performance way off target
- Integration reveals architectural issues

## Example: First Day Execution

### 7:00 AM - Research Sprint
- R1.1: Problem space research (Claude)
- R1.2: Algorithm research (ChatGPT)
- R1.3: User research (Gemini)

### 9:00 AM - Synthesis
- Consolidate findings
- Identify key algorithms
- Set performance targets

### 10:00 AM - Architecture
- Design system components
- Define interfaces
- Create build sequence

### 11:00 AM - First Build Mission (B1.1)
- Implement core component
- Use algorithm from R1.2
- Target performance from R1.3

### 12:00 PM - Lunch + Parallel Research
- R2.1: Research for tomorrow's builds
- R2.2: Integration patterns research

### 1:00 PM - Build Missions (B1.2, B1.3)
- Continue implementation
- Cross-validate each component
- Run tests continuously

### 3:00 PM - Integration Testing
- Connect B1.1, B1.2, B1.3
- Verify interfaces work
- Benchmark performance

### 4:00 PM - Documentation & Planning
- Update architecture doc
- Document today's decisions  
- Plan tomorrow's missions

### 5:00 PM - Day 1 Complete
- Working foundation
- Tomorrow's research ready
- Clear path forward

## Final Notes

This process compresses months into days by:
1. **Parallel Research:** Multiple AIs gather intelligence simultaneously
2. **Focused Missions:** Clear, achievable goals per session  
3. **Continuous Synthesis:** Human judgment connects insights
4. **Rapid Validation:** Issues caught immediately
5. **Evidence-Based:** Every decision traced to research

Remember: This produces validation-grade code. Production systems need additional hardening, but the core architecture and approach will be sound.

---

*The CMOS methodology is continuously refined based on real project experience. Document your lessons learned to improve the process.*
