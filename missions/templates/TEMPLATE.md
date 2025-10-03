# Mission [ID]: [Mission Name]
*[Phase/Week], [Days] - [Priority Level]*

## Context Load
```json
{
  "required_context": ["PROJECT_CONTEXT.json", "AI_HANDOFF.md"],
  "optional_context": ["previous_mission_output.md"],
  "estimated_tokens": 10000
}
```

## Objective
[Clear, single objective statement - what will be accomplished]

## Technical Requirements

### Core Implementation
```[language]
// Key interfaces, classes, or structures to implement
// Include type definitions or schemas
// Note any specific patterns or architectures required
```

### Infrastructure Requirements
- [Database/storage requirements]
- [External service integrations]
- [Performance targets]
- [Security considerations]

### Constraints
- [Resource limits (memory, CPU, etc)]
- [Time constraints]
- [Dependency requirements]
- [Compatibility requirements]

## Deliverables Checklist
- [ ] File: `project/src/[path/to/file]`
- [ ] Tests: `project/tests/test_[feature].py`
- [ ] Documentation: `project/docs/[feature].md`
- [ ] Config: `project/config/[feature].yaml`
- [ ] Update: `AI_HANDOFF.md` with key decisions and next steps
- [ ] Log: Append session to `SESSIONS.jsonl`

## Success Validation
```bash
# Commands to verify the mission is complete
# Run tests
python -m pytest tests/test_[feature].py -v

# Verify functionality
python scripts/validate_[feature].py

# Check performance
python scripts/benchmark_[feature].py
```

## End-of-Mission Output
Generate this JSON for SESSIONS.jsonl:
```json
{
  "session": N,
  "date": "<ISO_DATE>",
  "domain": "[domain_name]",
  "tokens_in": [estimate],
  "tokens_out": [estimate],
  "deliverables": [
    "list of files created/modified"
  ],
  "ai_model": "[model_used]"
}
```

## Notes for AI
- [Specific coding standards or patterns to follow]
- [Important architectural decisions to maintain]
- [Performance considerations]
- [Error handling requirements]
- [Documentation expectations]

## Questions to Resolve (Optional)
- [ ] [Any ambiguities that need clarification]
- [ ] [Technical decisions that need input]
- [ ] [Dependencies that need verification]
