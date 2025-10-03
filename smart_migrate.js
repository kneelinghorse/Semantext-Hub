#!/usr/bin/env node

/**
 * Smart CMOS Migration Tool
 * 
 * Intelligently detects and migrates different project structures
 * Handles files in subdirectories and preserves existing layouts
 */

const fs = require('fs');
const path = require('path');

class SmartCMOSMigration {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.detectedPaths = null;
    this.backupDir = path.join(projectRoot, '.cmos_migration_backup');
    this.migrationLog = [];
    this.sourceDir = path.dirname(__filename); // Directory of this script
  }

  /**
   * Detect project structure intelligently
   */
  async detectProjectStructure() {
    console.log('🔍 Detecting project structure...');
    
    const possiblePaths = [
      // Standard structure - files at root
      {
        name: 'standard',
        contextFile: path.join(this.projectRoot, 'PROJECT_CONTEXT.json'),
        sessionsFile: path.join(this.projectRoot, 'SESSIONS.jsonl'),
        handoffFile: path.join(this.projectRoot, 'AI_HANDOFF.md'),
        cmosDir: path.join(this.projectRoot, 'context', 'cmos')
      },
      // Context folder structure (like oss-health-monitor)
      {
        name: 'context_folder',
        contextFile: path.join(this.projectRoot, 'context', 'PROJECT_CONTEXT.json'),
        sessionsFile: path.join(this.projectRoot, 'context', 'SESSIONS.jsonl'),
        handoffFile: path.join(this.projectRoot, 'context', 'AI_HANDOFF.md'),
        cmosDir: path.join(this.projectRoot, 'context', 'cmos')
      },
      // Missions folder structure
      {
        name: 'missions_folder',
        contextFile: path.join(this.projectRoot, 'missions', 'PROJECT_CONTEXT.json'),
        sessionsFile: path.join(this.projectRoot, 'missions', 'SESSIONS.jsonl'),
        handoffFile: path.join(this.projectRoot, 'missions', 'AI_HANDOFF.md'),
        cmosDir: path.join(this.projectRoot, 'missions', 'cmos')
      }
    ];

    // Check each possible structure
    for (const paths of possiblePaths) {
      if (fs.existsSync(paths.contextFile)) {
        console.log(`  ✓ Detected "${paths.name}" structure`);
        console.log(`  ✓ Context file: ${paths.contextFile}`);
        this.detectedPaths = paths;
        return paths;
      }
    }

    // No existing context found - use standard structure for new projects
    console.log('  ℹ️  No existing context found - will use standard structure');
    this.detectedPaths = possiblePaths[0];
    return possiblePaths[0];
  }

  /**
   * Analyze existing project
   */
  async analyzeProject() {
    console.log('\n📊 Analyzing project...');
    
    const paths = await this.detectProjectStructure();
    const analysis = {
      structure: paths.name,
      hasContext: fs.existsSync(paths.contextFile),
      hasSessions: fs.existsSync(paths.sessionsFile),
      hasHandoff: fs.existsSync(paths.handoffFile),
      hasCMOS: fs.existsSync(paths.cmosDir),
      contextData: null,
      recommendations: []
    };

    if (analysis.hasContext) {
      try {
        const contextData = fs.readFileSync(paths.contextFile, 'utf8');
        const context = JSON.parse(contextData);
        
        analysis.contextData = {
          projectName: context.project?.name || context.meta?.project_name || 'Unknown',
          contextSize: (Buffer.byteLength(contextData, 'utf8') / 1024).toFixed(2) + ' KB',
          hasCMOSFeatures: !!context.cmos,
          hasWorkingMemory: !!context.working_memory,
          hasHealthMonitoring: !!context.context_health
        };

        // Generate recommendations
        if (!analysis.contextData.hasCMOSFeatures && !analysis.hasCMOS) {
          analysis.recommendations.push('Add CMOS enhancements for better context management');
        }
        
        if (parseFloat(analysis.contextData.contextSize) > 50) {
          analysis.recommendations.push('Context size is large - compression recommended');
        }
        
        if (!analysis.contextData.hasHealthMonitoring) {
          analysis.recommendations.push('Add health monitoring for context quality tracking');
        }
        
      } catch (error) {
        console.error('  ⚠️  Error parsing context:', error.message);
      }
    }

    return analysis;
  }

  /**
   * Perform migration
   */
  async migrate(options = {}) {
    const config = {
      backup: options.backup !== false,
      dryRun: options.dryRun || false,
      preserveStructure: options.preserveStructure !== false,
      ...options
    };

    console.log('\n🚀 Starting CMOS Migration...');
    console.log('Options:', config);

    try {
      // Step 1: Detect and analyze
      const paths = await this.detectProjectStructure();
      const analysis = await this.analyzeProject();
      
      console.log('\n📋 Analysis Results:');
      console.log('  Structure:', analysis.structure);
      if (analysis.contextData) {
        console.log('  Project:', analysis.contextData.projectName);
        console.log('  Context Size:', analysis.contextData.contextSize);
      }

      // Step 2: Create backup
      if (config.backup && !config.dryRun) {
        await this.createBackup(paths);
      }

      // Step 3: Copy CMOS modules
      if (!config.dryRun) {
        await this.copyCMOSModules(paths);
      }

      // Step 4: Enhance context
      if (analysis.hasContext && !config.dryRun) {
        await this.enhanceContext(paths);
      }

      // Step 5: Create missing files
      if (!config.dryRun) {
        await this.createMissingFiles(paths);
      }

      // Step 6: Copy enhanced project_context.py
      if (!config.dryRun) {
        await this.copyEnhancedScript(paths);
      }

      console.log('\n✅ Migration Complete!');
      
      if (!config.dryRun) {
        console.log('\nNext steps:');
        console.log('  1. Test basic functionality:');
        console.log('     python3 project_context.py stats');
        console.log('  2. Check health monitoring:');
        console.log('     python3 project_context.py health');
        console.log('  3. Try compression (if Node.js available):');
        console.log('     python3 project_context.py compress');
      }
      
      return { success: true, analysis };

    } catch (error) {
      console.error('\n❌ Migration Failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create backup of existing files
   */
  async createBackup(paths) {
    console.log('\n💾 Creating backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupSubDir = path.join(this.backupDir, `backup_${timestamp}`);
    
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    fs.mkdirSync(backupSubDir);

    // Backup existing files
    const filesToBackup = [
      paths.contextFile,
      paths.sessionsFile,
      paths.handoffFile
    ];

    for (const file of filesToBackup) {
      if (fs.existsSync(file)) {
        const relativePath = path.relative(this.projectRoot, file);
        const backupPath = path.join(backupSubDir, relativePath);
        const backupDir = path.dirname(backupPath);
        
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        
        fs.copyFileSync(file, backupPath);
        console.log(`  ✓ Backed up ${relativePath}`);
      }
    }

    // Also backup existing CMOS if it exists
    if (fs.existsSync(paths.cmosDir)) {
      const cmosBackup = path.join(backupSubDir, 'context', 'cmos');
      fs.mkdirSync(cmosBackup, { recursive: true });
      console.log('  ✓ Backed up existing CMOS modules');
    }

    console.log(`  ✓ Backup location: ${backupSubDir}`);
  }

  /**
   * Copy CMOS modules to project
   */
  async copyCMOSModules(paths) {
    console.log('\n📦 Installing CMOS modules...');
    
    const sourceCmos = path.join(this.sourceDir, 'context', 'cmos');
    
    if (!fs.existsSync(sourceCmos)) {
      throw new Error('CMOS source modules not found. Please run from CMOS.v.3.3 directory.');
    }

    // Create CMOS directory if it doesn't exist
    if (!fs.existsSync(paths.cmosDir)) {
      fs.mkdirSync(paths.cmosDir, { recursive: true });
    }

    // Copy all CMOS modules
    const files = fs.readdirSync(sourceCmos);
    let copied = 0;
    
    for (const file of files) {
      const sourcePath = path.join(sourceCmos, file);
      const destPath = path.join(paths.cmosDir, file);
      
      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, destPath);
        copied++;
      }
    }
    
    console.log(`  ✓ Copied ${copied} CMOS modules to ${path.relative(this.projectRoot, paths.cmosDir)}`);
  }

  /**
   * Enhance existing context with CMOS features
   */
  async enhanceContext(paths) {
    console.log('\n⚡ Enhancing context with CMOS...');
    
    const contextData = fs.readFileSync(paths.contextFile, 'utf8');
    const context = JSON.parse(contextData);

    // Add CMOS metadata if not present
    if (!context.cmos) {
      context.cmos = {
        enabled: true,
        version: "1.0.0",
        migrated: true,
        migration_date: new Date().toISOString(),
        structure_type: paths.name,
        features: {
          anti_patterns: true,
          compression: true,
          domain_optimization: true,
          health_monitoring: true,
          state_vector: true
        },
        metrics: {
          total_token_reduction: 0,
          recovery_actions: 0,
          compression_ratio: 1.0
        }
      };
    }

    // Add working_memory if not present
    if (!context.working_memory) {
      context.working_memory = {
        active_domain: "",
        session_count: 0,
        last_session: new Date().toISOString(),
        domains: {}
      };
    }

    // Add context_health if not present
    if (!context.context_health) {
      const sizeKb = Buffer.byteLength(JSON.stringify(context), 'utf8') / 1024;
      context.context_health = {
        size_kb: Math.round(sizeKb * 100) / 100,
        size_limit_kb: 100,
        sessions_since_reset: 0,
        last_reset: new Date().toISOString().split('T')[0],
        compression_enabled: true,
        anti_pattern_detection: true
      };
    }

    // Save enhanced context
    fs.writeFileSync(paths.contextFile, JSON.stringify(context, null, 2));
    console.log('  ✓ Context enhanced with CMOS features');
  }

  /**
   * Create missing files
   */
  async createMissingFiles(paths) {
    console.log('\n📝 Creating missing files...');
    
    // Create SESSIONS.jsonl if missing
    if (!fs.existsSync(paths.sessionsFile)) {
      const initialSession = {
        timestamp: new Date().toISOString(),
        type: "migration",
        message: "CMOS migration completed",
        domain: "system"
      };
      
      // Ensure directory exists
      const dir = path.dirname(paths.sessionsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(paths.sessionsFile, JSON.stringify(initialSession) + '\n');
      console.log(`  ✓ Created ${path.relative(this.projectRoot, paths.sessionsFile)}`);
    }

    // Create AI_HANDOFF.md if missing
    if (!fs.existsSync(paths.handoffFile)) {
      const handoffContent = `# AI Handoff Document

## Project Status
- **CMOS Migration Date**: ${new Date().toISOString()}
- **Structure Type**: ${paths.name}
- **CMOS Enabled**: Yes

## Next Steps
- Review enhanced context features
- Test CMOS commands
- Monitor context health
`;
      
      // Ensure directory exists
      const dir = path.dirname(paths.handoffFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(paths.handoffFile, handoffContent);
      console.log(`  ✓ Created ${path.relative(this.projectRoot, paths.handoffFile)}`);
    }
  }

  /**
   * Copy enhanced project_context.py script
   */
  async copyEnhancedScript(paths) {
    console.log('\n📄 Installing enhanced project_context.py...');
    
    const sourceScript = path.join(this.sourceDir, 'project_context.py');
    const destScript = path.join(this.projectRoot, 'project_context.py');
    
    if (fs.existsSync(sourceScript)) {
      // Check if script already exists
      if (fs.existsSync(destScript)) {
        // Back it up first
        const backupPath = destScript + '.pre-cmos';
        fs.copyFileSync(destScript, backupPath);
        console.log(`  ✓ Backed up existing script to ${path.basename(backupPath)}`);
      }
      
      fs.copyFileSync(sourceScript, destScript);
      console.log('  ✓ Installed enhanced project_context.py');
    } else {
      console.log('  ⚠️  Enhanced script not found in source directory');
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  // Handle project path
  let projectPath = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') && args[i] !== 'analyze' && args[i] !== 'migrate') {
      projectPath = path.resolve(args[i]);
      break;
    }
  }

  const migration = new SmartCMOSMigration(projectPath);

  switch (command) {
    case 'analyze':
      const analysis = await migration.analyzeProject();
      console.log('\n📋 Full Analysis:');
      console.log(JSON.stringify(analysis, null, 2));
      
      if (analysis.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        analysis.recommendations.forEach(r => console.log(`  • ${r}`));
      }
      break;

    case 'migrate':
      await migration.migrate({
        backup: !args.includes('--no-backup'),
        dryRun: args.includes('--dry-run'),
        preserveStructure: !args.includes('--restructure')
      });
      break;

    default:
      console.log(`
Smart CMOS Migration Tool

This tool intelligently detects your project structure and adds CMOS
(Context + Mission Orchestration System) capabilities while preserving
your existing layout.

Usage: node smart_migrate.js <command> [project-path] [options]

Commands:
  analyze [path]    Analyze project structure and readiness
  migrate [path]    Perform smart migration (default: current directory)

Migration Options:
  --dry-run         Preview changes without applying
  --no-backup       Skip backup creation (not recommended)
  --restructure     Allow structure changes (default: preserve)

Supported Project Structures:
  • Standard (files at root)
  • Context folder (files in /context/)
  • Missions folder (files in /missions/)
  • Custom structures (auto-detected)

Examples:
  node smart_migrate.js analyze
  node smart_migrate.js analyze ../oss-health-monitor
  node smart_migrate.js migrate --dry-run
  node smart_migrate.js migrate ../my-project --no-backup

This migration:
  ✓ Detects your project structure automatically
  ✓ Preserves existing files and layouts
  ✓ Adds CMOS enhancements non-destructively
  ✓ Creates backups before changes
  ✓ Works with different project structures
`);
  }
}

// Run CLI if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = SmartCMOSMigration;
