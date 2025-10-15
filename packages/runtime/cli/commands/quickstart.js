#!/usr/bin/env node

/**
 * Quickstart CLI Wizard
 * Interactive onboarding workflow for new developers
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFile = promisify(_execFile);

/**
 * Quickstart wizard for new developers
 */
export async function quickstartCommand(options = {}) {
  const startTime = performance.now();
  
  console.log('🚀 Welcome to OSSP-AGI Quickstart!');
  console.log('This wizard will get you up and running in under 2 minutes.\n');

  try {
    // Step 1: Check prerequisites
    await checkPrerequisites();
    
    // Step 2: Interactive setup
    const config = await interactiveSetup(options);
    
    // Step 3: Create example project
    await createExampleProject(config);
    
    // Step 4: Validate setup
    await validateSetup(config);
    
    // Step 5: Show next steps
    showNextSteps(config);
    
    const duration = performance.now() - startTime;
    console.log(`\n✅ Quickstart completed in ${Math.round(duration / 1000)}s`);
    
  } catch (error) {
    console.error('\n❌ Quickstart failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Ensure Node.js 18+ is installed');
    console.log('2. Check network connectivity');
    console.log('3. Verify write permissions in current directory');
    console.log('4. Run with --verbose for detailed logs');
    process.exit(1);
  }
}

/**
 * Check system prerequisites
 */
async function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // Check Node.js version
  try {
    const { stdout } = await execFile('node', ['--version']);
    const version = stdout.trim();
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${version}`);
    }
    
    console.log(`✅ Node.js ${version}`);
  } catch (error) {
    throw new Error('Node.js not found or version too old');
  }
  
  // Check if we're in a git repo
  try {
    await execFile('git', ['rev-parse', '--is-inside-work-tree']);
    console.log('✅ Git repository detected');
  } catch {
    console.log('⚠️  Not in a git repository (optional)');
  }
  
  console.log('');
}

/**
 * Interactive setup questions
 */
async function interactiveSetup(options = {}) {
  // Check if we have all required options for non-interactive mode
  const hasAllOptions = options.name && options.template;
  
  if (hasAllOptions) {
    // Non-interactive mode
    return {
      projectName: options.name,
      template: options.template,
      includeGovernance: !options.noGovernance,
      includeTests: !options.noTests,
      outputDir: path.resolve(options.name)
    };
  }
  
  // Interactive mode
  const questions = [
    {
      type: 'input',
      name: 'projectName',
      message: 'What would you like to name your project?',
      default: options.name || 'my-ossp-project',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Project name is required';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
          return 'Project name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    },
    {
      type: 'list',
      name: 'template',
      message: 'Which template would you like to use?',
      choices: [
        {
          name: 'Microservices Integration Pattern',
          value: 'microservices',
          short: 'Microservices'
        },
        {
          name: 'API Discovery Only',
          value: 'api-discovery',
          short: 'API Discovery'
        },
        {
          name: 'Event-Driven Architecture',
          value: 'event-driven',
          short: 'Event-Driven'
        }
      ],
      default: options.template || 'microservices'
    },
    {
      type: 'confirm',
      name: 'includeGovernance',
      message: 'Generate governance documentation?',
      default: !options.noGovernance
    },
    {
      type: 'confirm',
      name: 'includeTests',
      message: 'Include test scaffolds?',
      default: !options.noTests
    }
  ];
  
  const answers = await inquirer.prompt(questions);
  
  return {
    projectName: answers.projectName,
    template: answers.template,
    includeGovernance: answers.includeGovernance,
    includeTests: answers.includeTests,
    outputDir: path.resolve(answers.projectName)
  };
}

/**
 * Create example project based on template
 */
async function createExampleProject(config) {
  console.log(`\n📁 Creating project: ${config.projectName}`);
  
  // Create project directory
  await fs.mkdir(config.outputDir, { recursive: true });
  
  // Copy template files
  const templateDir = path.join(__dirname, '../../examples/microservices-pattern');
  
  if (config.template === 'microservices') {
    await copyTemplateFiles(templateDir, config.outputDir);
  } else {
    await createBasicTemplate(config);
  }
  
  // Create package.json
  await createPackageJson(config);
  
  // Create .gitignore
  await createGitignore(config);
  
  console.log('✅ Project structure created');
}

/**
 * Copy template files from source to destination
 */
async function copyTemplateFiles(sourceDir, destDir) {
  const files = await fs.readdir(sourceDir);
  
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);
    
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyTemplateFiles(sourcePath, destPath);
    } else {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

/**
 * Create basic template for non-microservices options
 */
async function createBasicTemplate(config) {
  const artifactsDir = path.join(config.outputDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  
  // Create basic protocol file
  const protocolFile = path.join(artifactsDir, 'example-protocol.json');
  const protocolContent = {
    "urn": "urn:protocol:api:example:v1",
    "metadata": {
      "name": "Example API",
      "version": "1.0.0",
      "description": "Example API protocol",
      "status": "draft"
    },
    "service": {
      "name": "example",
      "type": "api",
      "version": "1.0.0",
      "baseUrl": "https://api.example.com/v1"
    }
  };
  
  await fs.writeFile(protocolFile, JSON.stringify(protocolContent, null, 2));
}

/**
 * Create package.json for the project
 */
async function createPackageJson(config) {
  const packageJson = {
    "name": config.projectName,
    "version": "1.0.0",
    "description": "OSSP-AGI project",
    "type": "module",
    "scripts": {
      "discover": "ossp discover",
      "validate": "ossp validate --ecosystem",
      "governance": "ossp governance",
      "test": "ossp validate --ecosystem --verbose"
    },
    "devDependencies": {
      "ossp-agi": "file:../../"
    }
  };
  
  const packagePath = path.join(config.outputDir, 'package.json');
  await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
}

/**
 * Create .gitignore file
 */
async function createGitignore(config) {
  const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*

# Generated files
artifacts/generated/
*.log

# OS generated files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Environment files
.env
.env.local
.env.*.local
`;
  
  const gitignorePath = path.join(config.outputDir, '.gitignore');
  await fs.writeFile(gitignorePath, gitignoreContent);
}

/**
 * Validate the setup
 */
async function validateSetup(config) {
  console.log('\n🔍 Validating setup...');
  
  try {
    // Change to project directory
    process.chdir(config.outputDir);
    
    // Run validation
    const { stdout } = await execFile('node', [
      path.join(__dirname, '../../cli/index.js'),
      'validate',
      '--ecosystem',
      '--manifests',
      './artifacts'
    ]);
    
    console.log('✅ Validation passed');
    
    if (config.includeGovernance) {
      console.log('📋 Generating governance documentation...');
      await execFile('node', [
        path.join(__dirname, '../../cli/index.js'),
        'governance',
        '--manifests',
        './artifacts',
        '--output',
        './GOVERNANCE.md'
      ]);
      console.log('✅ Governance documentation generated');
    }
    
  } catch (error) {
    console.log('⚠️  Validation failed, but project structure is ready');
    console.log('   You can run validation manually later');
  }
}

/**
 * Show next steps to the user
 */
function showNextSteps(config) {
  console.log('\n🎉 Setup complete! Next steps:');
  console.log('');
  console.log(`1. Navigate to your project:`);
  console.log(`   cd ${config.projectName}`);
  console.log('');
  console.log('2. Install dependencies:');
  console.log('   npm install');
  console.log('');
  console.log('3. Explore your project:');
  console.log('   ls -la artifacts/');
  console.log('');
  console.log('4. Run validation:');
  console.log('   npm run validate');
  console.log('');
  console.log('5. Generate governance docs:');
  console.log('   npm run governance');
  console.log('');
  console.log('📚 Documentation:');
  console.log('   - README.md in your project directory');
  console.log('   - docs/quickstart.md for detailed guide');
  console.log('');
  console.log('🆘 Need help?');
  console.log('   - Run: ossp --help');
  console.log('   - Check: docs/quickstart.md');
  console.log('   - Issues: https://github.com/your-org/ossp-agi/issues');
}
