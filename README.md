# CMOS v1.0 - Context + Mission Orchestration System

A simple, powerful context management system for AI-assisted development.

## What You Get

### 🚀 Core Features
- **Smart Compression**: 4x-10x context reduction with state-aware algorithms
- **Domain Management**: Organize projects by functional areas
- **Session Tracking**: Complete development history in append-only format
- **Health Monitoring**: Real-time context quality assessment
- **Anti-Pattern Detection**: Prevents common context degradation issues
- **Zero Dependencies**: Pure Python + JavaScript, no external packages

### 📊 Performance Characteristics
- Context compression: 4x-10x ratios based on viability zones
- State calculation: Sub-millisecond performance
- Domain switching: <100ms transition time
- Memory efficient: Works with projects of any size

## Quick Installation

### For New Projects

#### Simple Copy Method
```bash
# Copy the starter to your project
cp -r CMOS.v.3.3/ /path/to/your/project/
cd /path/to/your/project/

# Initialize
python3 project_context.py init
```

#### Using Install Script
```bash
# Run the installer
./install.sh /path/to/your/project/
cd /path/to/your/project/
python3 project_context.py init
```

## Migration for Existing Projects

CMOS can be added to your existing projects non-destructively using the Smart Migration tool.

### Smart Migration Features
- **Auto-detects** your project structure
- **Preserves** your existing files and layout
- **Creates backups** before making changes
- **Works with** different project structures

### Supported Project Structures
- **Standard**: PROJECT_CONTEXT.json at root level
- **Context Folder**: Files in `/context/` subdirectory
- **Missions Folder**: Files in `/missions/` subdirectory
- **Custom**: Auto-detects other structures

### Migration Steps

#### 1. Analyze Your Project First
```bash
# From the CMOS directory
cd CMOS.v.3.3

# Analyze your existing project
node smart_migrate.js analyze /path/to/your/project
```

This shows:
- Detected structure type
- Existing context size
- Current features
- Recommendations

#### 2. Preview Migration (Dry Run)
```bash
# See what would change without modifying anything
node smart_migrate.js migrate /path/to/your/project --dry-run
```

#### 3. Perform Migration
```bash
# Migrate with automatic backup
node smart_migrate.js migrate /path/to/your/project

# Or migrate without backup (not recommended)
node smart_migrate.js migrate /path/to/your/project --no-backup
```

### What Gets Migrated

The migration tool will:
1. **Detect** your project structure automatically
2. **Create backup** in `.cmos_migration_backup/`
3. **Install CMOS modules** to your `context/cmos/` folder
4. **Enhance your context** with CMOS metadata
5. **Create missing files** (SESSIONS.jsonl, AI_HANDOFF.md) if needed
6. **Copy enhanced** `project_context.py` script
7. **Preserve** your existing project structure

### Post-Migration

After migration, test your enhanced project:

```bash
# Go to your migrated project
cd /path/to/your/project

# Test basic functionality
python3 project_context.py stats

# Check health monitoring
python3 project_context.py health

# Try compression (requires Node.js)
python3 project_context.py compress
```

### Rollback

If needed, restore from the automatic backup:
```bash
# Backups are in .cmos_migration_backup/
cp -r .cmos_migration_backup/backup_[timestamp]/* .
```

## Usage

### Basic Commands
```bash
# Initialize new project
python3 project_context.py init

# Check system status
python3 project_context.py stats

# Monitor context health
python3 project_context.py health

# View available commands
python3 project_context.py --help
```

### Advanced Features (when Node.js available)
```bash
# Intelligent compression
python3 project_context.py compress

# Domain analysis
python3 project_context.py domains

# Anti-pattern detection
python3 project_context.py check-patterns
```

## JavaScript Test Harness

Importer and CLI tests live under `app/tests` and use Jest.

```bash
# Install dev dependencies (Node.js 18+ required)
npm install

# Run the full suite
npm test

# Run a specific file (example)
npm test -- app/tests/importers/openapi.test.js
```

## File Structure

```
CMOS.v.3.3/
├── project_context.py          # Main interface
├── PROJECT_CONTEXT.json        # Clean template
├── AI_HANDOFF.md               # Handoff template
├── SESSIONS.jsonl              # Session tracking
├── context/cmos/               # CMOS components
├── missions/                   # Mission templates
├── archive/                    # Project archive
├── install.sh                  # Simple installer
├── smart_migrate.js            # Smart migration tool
└── README.md                   # This file
```

## Requirements

- **Python 3.x** (required)
- **Node.js** (optional, for full features and migration)

## How It Works

1. **Domain Compartmentalization**: Organize context by functional areas (auth, database, frontend, etc.)
2. **State-Aware Compression**: Automatically compress based on context health
3. **Session Tracking**: Append-only log maintains complete project history
4. **Health Monitoring**: Statistical metrics track context quality in real-time
5. **Mission-Driven Workflow**: Structured approach to AI-assisted development

## CMOS Components

The `context/cmos/` directory contains specialized modules:

- **smart_compressor.js** - State-aware context compression (4x-10x ratios)
- **context_health.js** - Real-time health monitoring with 5 metrics
- **context_state.js** - 4D state vector tracking (Form, Function, Behavior, Context)
- **domain_manager.js** - Project compartmentalization and discovery
- **anti_patterns.js** - Pattern detection and automated recovery
- **viability_regions.js** - Zone-based state classification
- And more...

## Performance Targets

Based on design specifications:
- Compression ratios: 4x-10x depending on viability zone
- State calculation: <1ms for typical projects
- Health assessment: <10ms including all metrics
- Session operations: <100ms for logging and updates

## Migration Tool Options

```bash
# Analyze project structure
node smart_migrate.js analyze [project-path]

# Migrate with options
node smart_migrate.js migrate [project-path] [options]

Options:
  --dry-run         Preview changes without applying
  --no-backup       Skip backup creation (not recommended)
  --restructure     Allow structure changes (default: preserve)
```

## Troubleshooting

### Migration Issues

**Issue**: "CMOS source modules not found"
- **Solution**: Run migration from the CMOS.v.3.3 directory

**Issue**: Context file in subdirectory not detected
- **Solution**: The tool auto-detects common structures. If yours is unique, it will create standard structure

**Issue**: Node.js features not working after migration
- **Solution**: Ensure Node.js is installed and CMOS modules are in `context/cmos/`

### Verification

After migration or installation, verify everything works:

```bash
# Check Python interface
python3 project_context.py --help

# Check for CMOS modules
ls -la context/cmos/

# Test health monitoring
python3 project_context.py health
```

## Design Philosophy

CMOS follows these principles:

1. **Simplicity First**: File-based, zero external dependencies
2. **Graceful Enhancement**: Works as basic starter, enhances when Node.js available
3. **Non-Destructive**: Migration preserves existing structure
4. **Performance Focused**: All operations optimized for speed
5. **Mission-Driven**: Structured workflow for complex tasks

## Support

This is a self-contained context management system with intelligent migration capabilities. All functionality is included with no external dependencies.

---

**Ready to enhance your AI-assisted development with proven context management.**
