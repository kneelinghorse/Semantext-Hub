# CMOS Migration Guide

## Overview

The Smart Migration tool adds CMOS (Context + Mission Orchestration System) capabilities to your existing projects without breaking your current structure.

## Quick Start

### 1. Check Your Project Structure

The migration tool supports:
- **Standard projects**: PROJECT_CONTEXT.json at root
- **Context folder projects**: Files in `/context/` subfolder
- **Missions folder projects**: Files in `/missions/` subfolder
- **Custom structures**: Auto-detected

### 2. Analyze Before Migrating

Always analyze first to understand what will happen:

```bash
cd CMOS.v.3.3
node smart_migrate.js analyze /path/to/your/project
```

### 3. Perform Migration

```bash
node smart_migrate.js migrate /path/to/your/project
```

## What Gets Added

### CMOS Modules (17 components)
- `context/cmos/smart_compressor.js` - Intelligent compression (4x-10x)
- `context/cmos/context_health.js` - Health monitoring with 5 metrics
- `context/cmos/context_state.js` - 4D state vector tracking
- `context/cmos/domain_manager.js` - Domain management
- `context/cmos/anti_patterns.js` - Pattern detection
- And 12+ more modules...

### Enhanced Scripts
- `project_context.py` - Enhanced with CMOS integration

### Context Enhancements
Your PROJECT_CONTEXT.json gets:
- CMOS metadata and configuration
- Working memory structure
- Health monitoring metrics
- Compression settings

## Examples

### Example 1: Project with context/ folder

```bash
# OSS Health Monitor has PROJECT_CONTEXT.json in /context/
cd CMOS.v.3.3
node smart_migrate.js analyze ../oss-health-monitor

# Output shows:
#   ✓ Detected "context_folder" structure
#   ✓ Context file: /path/to/oss-health-monitor/context/PROJECT_CONTEXT.json

# Migrate it
node smart_migrate.js migrate ../oss-health-monitor
```

### Example 2: Standard project

```bash
# Smart API Client has PROJECT_CONTEXT.json at root
cd CMOS.v.3.3
node smart_migrate.js analyze ../smart-api-client

# Output shows:
#   ✓ Detected "standard" structure
#   ✓ Context file: /path/to/smart-api-client/PROJECT_CONTEXT.json

# Migrate it
node smart_migrate.js migrate ../smart-api-client
```

## Migration Options

### Dry Run (Preview Only)
See what would change without modifying anything:
```bash
node smart_migrate.js migrate /path/to/project --dry-run
```

### Skip Backup
Not recommended, but available:
```bash
node smart_migrate.js migrate /path/to/project --no-backup
```

### Allow Restructuring
By default, your structure is preserved. To allow changes:
```bash
node smart_migrate.js migrate /path/to/project --restructure
```

## After Migration

### Test Basic Functions
```bash
cd /path/to/migrated/project
python3 project_context.py stats
python3 project_context.py health
```

### Test CMOS Features (requires Node.js)
```bash
python3 project_context.py compress
python3 project_context.py domains
```

## Backup and Recovery

### Automatic Backups
Every migration creates a timestamped backup:
```
.cmos_migration_backup/
└── backup_2025-09-27T10-30-45/
    ├── PROJECT_CONTEXT.json
    ├── SESSIONS.jsonl
    └── AI_HANDOFF.md
```

### Manual Recovery
If needed, restore from backup:
```bash
cd /path/to/project
cp -r .cmos_migration_backup/backup_[timestamp]/* .
```

## Troubleshooting

### "CMOS source modules not found"
**Solution**: Run migration from the CMOS.v.3.3 directory

### "No existing context found"
**Solution**: The tool will create standard structure for new projects

### Node.js features not working
**Solution**: Ensure Node.js is installed and check `context/cmos/` folder exists

## Benefits After Migration

- **4x-10x context compression** through state-aware algorithms
- **Real-time health monitoring** with 5 statistical metrics
- **Smart domain management** for project organization
- **Anti-pattern detection** and automated recovery
- **Session tracking** with complete development history

## Important Notes

1. **Preserves your structure** - Files stay where they are
2. **Non-destructive** - Creates backups before changes
3. **Graceful enhancement** - Works without Node.js, better with it
4. **No dependencies** - Self-contained system

## Need Help?

The migration tool is designed to be safe and non-destructive. If you encounter issues:

1. Check the backup was created
2. Review the analysis output
3. Try with --dry-run first
4. Restore from backup if needed
