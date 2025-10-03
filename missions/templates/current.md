# Mission B1.1: GitHub Data Collector Service
*Week 1, Day 1-2 - Foundation Critical*

## Context Load
```json
{
  "required_context": ["PROJECT_CONTEXT.json", "AI_HANDOFF.md"],
  "optional_context": [],
  "estimated_tokens": 15000
}
```

## Objective
Build production-ready GitHub data collection service for Railway deployment

## Technical Requirements

### Core Implementation
```python
class GitHubCollector:
    """
    Railway-ready service for GitHub data collection
    Handles: commits, PRs, issues, contributors
    Scale: 100+ repositories, 6-hour refresh cycle
    """
    
    endpoints = {
        "commits": "/repos/{owner}/{repo}/commits",
        "pulls": "/repos/{owner}/{repo}/pulls",
        "issues": "/repos/{owner}/{repo}/issues", 
        "contributors": "/repos/{owner}/{repo}/contributors"
    }
    
    rate_limits = {
        "authenticated": 5000,  # per hour
        "search": 30,          # per minute
    }
```

### Database Schema
- PostgreSQL with TimescaleDB extension
- Tables: commits_timeline, pr_lifecycle, issue_tracking, contributor_activity
- Redis for real-time metrics and rate limit tracking

### Railway Configuration
- Health check endpoint: /health
- Environment variables: GITHUB_TOKEN, DATABASE_URL, REDIS_URL
- Memory limit: 2GB

## Deliverables Checklist
- [ ] File: `project/src/collectors/github_collector.py`
- [ ] File: `project/src/database/schema.sql`
- [ ] File: `project/railway.toml`
- [ ] Tests: `project/tests/test_collector.py`
- [ ] Update: `AI_HANDOFF.md`
- [ ] Log: Append to `SESSIONS.jsonl`

## Success Validation
```bash
# Run tests
cd project
python -m pytest tests/test_collector.py -v

# Check health endpoint
curl http://localhost:8000/health

# Verify rate limit handling
python tests/load_test.py --repos 10
```

## End-of-Mission Output
Generate this JSON for SESSIONS.jsonl:
```json
{
  "session": 1,
  "date": "<ISO_DATE>",
  "domain": "data_ingestion",
  "tokens_in": 15000,
  "tokens_out": 5000,
  "deliverables": [
    "project/src/collectors/github_collector.py",
    "project/src/database/schema.sql",
    "project/railway.toml",
    "project/tests/test_collector.py"
  ],
  "ai_model": "<model_used>"
}
```

## Notes for AI
- Focus on production-ready code with proper error handling
- Implement exponential backoff for rate limiting
- Use async/await for concurrent API calls
- Include comprehensive logging for debugging
- Follow the project's Python style guide (PEP 8)
