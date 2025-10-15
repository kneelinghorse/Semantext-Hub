/**
 * CLI Scaffold Command
 * Generate protocol manifests, importers, and tests from templates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { TemplateEngine } from '../../generators/scaffold/engine.js';
import { ProtocolScaffolder } from '../../generators/scaffold/protocol-scaffolder.js';
import { FeedbackAggregator, generateTraceId, CommonHints } from '../../feedback/index.js';
import { ManifestRedactor, redactSecrets } from '../../../protocols/src/security/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFile = promisify(_execFile);

/**
 * Validate protocol name
 * @param {string} name - Protocol name to validate
 * @returns {boolean|string} true if valid, error message otherwise
 */
function validateName(name) {
  if (!name || name.trim().length === 0) {
    return 'Name is required';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    return 'Name must start with a letter and contain only letters, numbers, hyphens, and underscores';
  }
  if (name.length > 50) {
    return 'Name must be 50 characters or less';
  }
  return true;
}

/**
 * Check git working tree status and warn if uncommitted changes
 * @param {string} cwd - Directory to run git commands in
 * @returns {Promise<{dirty: boolean, summary?: string}>}
 */
async function checkGitStatus(cwd) {
  try {
    // Ensure we're inside a git repo
    await execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
    const { stdout } = await execFile('git', ['status', '--porcelain'], { cwd });
    const dirty = stdout.trim().length > 0;
    return {
      dirty,
      summary: dirty ? stdout.trim().split('\n').slice(0, 10).join('\n') : undefined
    };
  } catch {
    // Not a git repo or git not available; treat as clean
    return { dirty: false };
  }
}

/**
 * Check if files already exist at output path
 * @param {string} outputDir - Output directory
 * @param {string} name - Protocol name
 * @param {string} type - Protocol type
 * @returns {Promise<{exists: boolean, files: string[]}>}
 */
async function checkExistingFiles(outputDir, name, type) {
  const kebabName = name.toLowerCase().replace(/[_\s]+/g, '-');
  const potentialFiles = [];

  if (['api', 'data', 'event', 'semantic'].includes(type)) {
    potentialFiles.push(
      path.join(outputDir, `${kebabName}-protocol.json`),
      path.join(outputDir, `${kebabName}-importer.js`),
      path.join(outputDir, `${kebabName}-importer.test.js`)
    );
  } else if (type === 'importer') {
    potentialFiles.push(
      path.join(outputDir, `${kebabName}-importer.js`),
      path.join(outputDir, `${kebabName}-importer.test.js`)
    );
  } else if (type === 'test') {
    potentialFiles.push(
      path.join(outputDir, `${kebabName}.test.js`)
    );
  }

  const existingFiles = [];
  for (const file of potentialFiles) {
    try {
      await fs.access(file);
      existingFiles.push(file);
    } catch {
      // File doesn't exist, which is fine
    }
  }

  return {
    exists: existingFiles.length > 0,
    files: existingFiles
  };
}

/**
 * Check directory permissions
 * @param {string} dir - Directory to check
 * @returns {Promise<{writable: boolean, error?: string}>}
 */
async function checkDirectoryPermissions(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    // Try to write a test file
    const testFile = path.join(dir, '.write-test');
    await fs.writeFile(testFile, '');
    await fs.unlink(testFile);
    return { writable: true };
  } catch (error) {
    return {
      writable: false,
      error: error.message
    };
  }
}

/**
 * Run interactive prompts to gather scaffold configuration
 * @returns {Promise<object>} Scaffold configuration
 */
async function runInteractivePrompts() {
  console.log('🏗️  Interactive Protocol Scaffolder');
  console.log('─'.repeat(50));
  console.log('Answer the following questions to generate your protocol:\n');

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'What type of protocol do you want to create?',
      choices: [
        { name: 'API Protocol - REST/HTTP service', value: 'api' },
        { name: 'Data Protocol - File format or data structure', value: 'data' },
        { name: 'Event Protocol - Event/messaging system', value: 'event' },
        { name: 'Semantic Protocol - Ontology/vocabulary', value: 'semantic' },
        { name: 'Importer Only - Standalone importer class', value: 'importer' },
        { name: 'Test Only - Test scaffold', value: 'test' }
      ]
    },
    {
      type: 'input',
      name: 'name',
      message: 'Protocol name:',
      validate: validateName
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
      default: (answers) => `Generated ${answers.type} protocol for ${answers.name}`
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      default: '1.0.0'
    },
    {
      type: 'input',
      name: 'output',
      message: 'Output directory:',
      default: './artifacts/scaffolds'
    },
    {
      type: 'confirm',
      name: 'includeImporter',
      message: 'Include importer?',
      default: true,
      when: (answers) => ['api', 'data', 'event', 'semantic'].includes(answers.type)
    },
    {
      type: 'confirm',
      name: 'includeTests',
      message: 'Include tests?',
      default: true,
      when: (answers) => answers.type !== 'test'
    }
  ]);

  return answers;
}

/**
 * Display preview of files to be generated with validation results
 * @param {object} results - Generation results
 * @param {string} outputDir - Output directory
 * @param {object} options - Display options (showValidation, redact, trace)
 */
function displayPreview(results, outputDir, options = {}) {
  console.log('\n📄 Files to be generated:');
  console.log('─'.repeat(50));

  let hasErrors = false;
  let hasWarnings = false;

  for (const [key, result] of Object.entries(results)) {
    if (result.outputPath) {
      const relativePath = path.relative(process.cwd(), result.outputPath);
      const size = Buffer.byteLength(result.content, 'utf8');
      console.log(`  ✓ ${relativePath} (${size} bytes)`);

      // Show validation results if available
      if (options.showValidation && result.validation) {
        if (result.validation.errors && result.validation.errors.length > 0) {
          hasErrors = true;
          console.log(`    ❌ ${result.validation.errors.length} validation error(s)`);
          result.validation.errors.forEach(err => {
            console.log(`       - ${err}`);
          });
        }

        if (result.validation.warnings && result.validation.warnings.length > 0) {
          hasWarnings = true;
          console.log(`    ⚠️  ${result.validation.warnings.length} warning(s)`);
          if (options.verbose) {
            result.validation.warnings.forEach(warn => {
              console.log(`       - ${warn}`);
            });
          }
        }

        if (result.validation.suggestions && result.validation.suggestions.length > 0 && options.verbose) {
          console.log(`    💡 Suggestions:`);
          result.validation.suggestions.forEach(suggestion => {
            console.log(`       - ${suggestion}`);
          });
        }
      }

      // Optional redacted content preview (first few lines)
      try {
        let previewText = null;
        if (result.manifest) {
          // Prefer manifest object if available
          const redactor = new ManifestRedactor();
          const redactedObj = options.redact === false ? result.manifest : redactor.redact(result.manifest);
          previewText = JSON.stringify(redactedObj, null, 2);
        } else if (typeof result.content === 'string') {
          previewText = result.content;
        }

        if (typeof previewText === 'string') {
          // Apply string-level secret redaction (tokens/keys) when enabled
          const safeText = options.redact === false ? previewText : redactSecrets(previewText);
          const lines = safeText.split('\n').slice(0, 8); // limit preview lines
          console.log('    Preview (redacted):');
          lines.forEach((l) => console.log(`       ${l}`));
          if (safeText.split('\n').length > lines.length) {
            console.log('       …');
          }
        }
      } catch {}

      // Show trace correlation ID if requested
      if (options.trace && result.correlationId) {
        console.log(`    🔍 Trace ID: ${result.correlationId}`);
      }
    }
  }

  console.log('─'.repeat(50));
  console.log(`Output directory: ${path.resolve(outputDir)}`);

  if (hasErrors) {
    console.log('\n⚠️  Validation errors detected. Review before writing.');
  } else if (hasWarnings) {
    console.log('\n💡 Minor warnings detected. Files are valid but could be improved.');
  }
}

/**
 * Execute scaffold command
 * @param {object} args - Command arguments
 * @param {string} args.type - Protocol type (api, data, event, semantic, importer, test)
 * @param {string} args.name - Component name
 * @param {string} args.output - Output directory (default: ./artifacts/scaffolds)
 * @param {string} args.version - Version (default: 1.0.0)
 * @param {string} args.description - Description
 * @param {boolean} args.write - Write files to disk (default: false, requires confirmation)
 * @param {boolean} args.dryRun - Preview mode without writing (default: true for interactive)
 * @param {boolean} args.interactive - Run in interactive mode (default: true if no args)
 * @param {boolean} args.includeImporter - Include importer (default: true for protocols)
 * @param {boolean} args.includeTests - Include tests (default: true)
 * @param {boolean} args.examples - Show examples and exit
 * @param {boolean} args.force - Skip file existence checks
 * @param {boolean} args.trace - Enable trace mode with correlation IDs
 * @param {boolean} args.verbose - Show verbose output including hints and suggestions
 * @param {boolean} args.redact - Redact sensitive data in preview (default: true)
 */
export async function executeScaffoldCommand(args = {}) {
  // Handle examples flag
  if (args.examples) {
    return showScaffoldExamples();
  }

  // Determine if we should run in interactive mode
  const isInteractive = args.interactive !== false && !args.type && !args.name;

  let config;
  if (isInteractive) {
    // Run interactive prompts
    config = await runInteractivePrompts();
  } else {
    // Use provided arguments
    config = {
      type: args.type,
      name: args.name,
      output: args.output || './artifacts/scaffolds',
      version: args.version || '1.0.0',
      description: args.description,
      includeImporter: args.includeImporter !== false,
      includeTests: args.includeTests !== false,
      ...args
    };

    // Validate required arguments for non-interactive mode
    if (!config.type) {
      throw new Error('--type is required (api, data, event, semantic, importer, test)\nUse --examples to see usage examples or run without arguments for interactive mode');
    }

    if (!config.name) {
      throw new Error('--name is required\nUse --examples to see usage examples or run without arguments for interactive mode');
    }

    // Validate name
    const nameValidation = validateName(config.name);
    if (nameValidation !== true) {
      throw new Error(`Invalid name: ${nameValidation}`);
    }
  }

  const {
    type,
    name,
    output,
    version,
    description,
    write,
    dryRun,
    includeImporter,
    includeTests,
    force,
    ...extraConfig
  } = config;

  // Resolve output relative to app dir if path is not absolute
  const resolvedOutput = path.isAbsolute(output)
    ? output
    : path.join(__dirname, '../../', output);

  // Check directory permissions
  const permCheck = await checkDirectoryPermissions(resolvedOutput);
  if (!permCheck.writable) {
    throw new Error(`Cannot write to directory: ${resolvedOutput}\n${permCheck.error}`);
  }

  // Git status awareness (warn if uncommitted changes)
  try {
    const git = await checkGitStatus(process.cwd());
    if (git.dirty) {
      console.log('\n⚠️  Git: Uncommitted changes detected');
      if (git.summary) {
        console.log(git.summary.split('\n').map(l => `  ${l}`).join('\n'));
      }
      if (isInteractive) {
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Continue despite uncommitted changes?',
            default: true
          }
        ]);
        if (!proceed) {
          console.log('\n❌ Scaffold cancelled');
          return null;
        }
      } else {
        console.log('Proceeding. Use git commit or stash to clean working tree.');
      }
    }
  } catch {
    // Ignore git errors
  }

  // Check for existing files (unless --force is used)
  if (!force) {
    const existingCheck = await checkExistingFiles(resolvedOutput, name, type);
    if (existingCheck.exists) {
      console.log('\n⚠️  Warning: The following files already exist:');
      existingCheck.files.forEach(file => {
        console.log(`  - ${path.relative(process.cwd(), file)}`);
      });

      // Emit hint about file existence
      try {
        const fb = new FeedbackAggregator({ serviceName: 'scaffold-cli' });
        fb.reportHint(CommonHints.SCAFFOLD_FILE_EXISTS.code, CommonHints.SCAFFOLD_FILE_EXISTS.message, {
          severity: CommonHints.SCAFFOLD_FILE_EXISTS.severity,
          context: { files: existingCheck.files.map(f => path.relative(process.cwd(), f)) }
        });
      } catch {}

      if (isInteractive) {
        const { overwrite } = await inquirer.prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: 'Overwrite existing files?',
          default: false
        }]);

        if (!overwrite) {
          console.log('\n❌ Scaffold cancelled');
          return null;
        }
      } else {
        console.log('\nUse --force to overwrite existing files');
        throw new Error('Files already exist');
      }
    }
  }

  // Initialize feedback aggregator
  const feedback = new FeedbackAggregator({
    serviceName: 'scaffold-cli',
    verbose: args.verbose || false
  });

  // Generate correlation ID for this scaffold operation
  const correlationId = generateTraceId();

  console.log('\n🏗️  Protocol Scaffolder');
  console.log('─'.repeat(50));
  console.log(`Type: ${type}`);
  console.log(`Name: ${name}`);
  console.log(`Output: ${output}`);
  if (args.trace) {
    console.log(`Trace ID: ${correlationId}`);
  }
  console.log('─'.repeat(50));

  // Initialize engine and scaffolder
  // Templates live under app/templates relative to CLI source
  const templateDir = path.join(__dirname, '../../../../templates');
  const engine = new TemplateEngine(templateDir);
  const scaffolder = new ProtocolScaffolder(engine, {
    outputDir: resolvedOutput,
    feedback,
    verbose: args.verbose || false
  });

  const startTime = Date.now();
  let results;

  try {
    // Handle different scaffold types
    switch (type) {
      case 'api':
      case 'data':
      case 'event':
      case 'semantic':
        // Generate full protocol package
        const config = {
          name,
          version,
          description: description || `Generated ${type} protocol for ${name}`,
          includeImporter,
          includeTests,
          ...extraConfig
        };

        // Validate config
        const validation = scaffolder.validateConfig(type, config, {
          correlationId,
          emitHints: true,
          emitErrors: true
        });
        if (!validation.valid) {
          console.error('\n❌ Configuration errors:');
          validation.errors.forEach(err => console.error(`  - ${err}`));
          if (validation.suggestions && validation.suggestions.length > 0) {
            console.error('\n💡 Suggestions:');
            validation.suggestions.forEach(sug => console.error(`  - ${sug}`));
          }
          throw new Error('Invalid configuration');
        }

        // Add correlationId to config
        config.correlationId = correlationId;

        results = await scaffolder.generateProtocol(type, config);
        break;

      case 'importer':
        // Generate standalone importer
        results = {
          importer: await scaffolder.generateImporter(name, {
            type: extraConfig.protocolType || 'api',
            ...extraConfig
          })
        };
        if (includeTests) {
          results.tests = await scaffolder.generateTests(name, {
            className: results.importer.className,
            filename: scaffolder.toKebabCase(name) + '-importer'
          });
        }
        break;

      case 'test':
        // Generate standalone test
        results = {
          tests: await scaffolder.generateTests(name, extraConfig)
        };
        break;

      default:
        throw new Error(`Unknown scaffold type: ${type}. Use: api, data, event, semantic, importer, test`);
    }

    const duration = Date.now() - startTime;

    // Display preview with validation results
    displayPreview(results, resolvedOutput, {
      showValidation: true,
      trace: args.trace || false,
      verbose: args.verbose || false,
      redact: args.redact !== false // Default true
    });

    // Emit preview and redaction hints
    try {
      feedback.reportHint(CommonHints.SCAFFOLD_PREVIEW.code, CommonHints.SCAFFOLD_PREVIEW.message, {
        severity: CommonHints.SCAFFOLD_PREVIEW.severity,
        context: { correlationId }
      });
      if (args.redact !== false) {
        feedback.reportHint(CommonHints.SECURITY_REDACTION.code, CommonHints.SECURITY_REDACTION.message, {
          severity: CommonHints.SECURITY_REDACTION.severity,
          context: { correlationId }
        });
      }
    } catch {}

    // Show feedback summary if trace is enabled
    if (args.trace) {
      const summary = feedback.getSummary();
      console.log('\n📊 Feedback Summary:');
      console.log('─'.repeat(50));
      console.log(`Errors: ${summary.errors.total}`);
      console.log(`Hints: ${summary.hints.total}`);
      if (summary.progress.inProgress > 0 || summary.progress.completed > 0) {
        console.log(`Progress: ${summary.progress.completed} completed, ${summary.progress.inProgress} in-progress`);
      }
      console.log('─'.repeat(50));

      // Show trace details
      const trace = feedback.getTrace(correlationId);
      if (trace.errors.length > 0 || trace.hints.length > 0) {
        console.log(`\n🔍 Trace ${correlationId}:`);
        if (trace.errors.length > 0) {
          console.log(`  Errors: ${trace.errors.length}`);
          trace.errors.slice(0, 3).forEach(err => {
            console.log(`    - [${err.code}] ${err.message}`);
          });
        }
        if (trace.hints.length > 0) {
          console.log(`  Hints: ${trace.hints.length}`);
          trace.hints.slice(0, 3).forEach(hint => {
            console.log(`    - [${hint.code}] ${hint.message}`);
          });
        }
      }
    }

    // Determine if we should write files
    let shouldWrite = write !== false; // default true unless explicitly false

    // If dryRun is set, do not write and do not prompt
    if (dryRun === true) {
      shouldWrite = false;
    } else if (isInteractive && write !== true) {
      // In interactive mode, confirm before writing (unless explicitly forced)
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Create these files?',
          default: true
        }
      ]);
      shouldWrite = confirm;
    } else if (write === false) {
      shouldWrite = false;
    }

    // Write files if confirmed
    if (shouldWrite) {
      console.log('\n💾 Writing files...');
      const written = await scaffolder.writeFiles(results);
      console.log(`✅ Wrote ${written.length} file(s)`);

      // Show where files were written
      console.log('\n📁 Output directory:');
      console.log(`  ${path.resolve(resolvedOutput)}`);
    } else {
      console.log('\n⚠️  Preview only - files not written');
      return results;
    }

    // Count files
    let fileCount = 0;
    for (const [key, result] of Object.entries(results)) {
      if (result.outputPath) {
        fileCount++;
      }
    }

    // Summary
    console.log('\n✅ Scaffold Complete');
    console.log('─'.repeat(50));
    console.log(`Files: ${fileCount}`);
    console.log(`Duration: ${duration}ms`);
    console.log('─'.repeat(50));

    // Show next steps
    console.log('\n📋 Next Steps:');
    if (results.manifest) {
      console.log('  1. Review and customize the generated manifest');
    }
    if (results.importer) {
      console.log('  2. Implement the detection and import logic in the importer');
    }
    if (results.tests) {
      console.log('  3. Add test cases to the generated test file');
    }
    console.log('  4. Run tests: npm test');

    return results;

  } catch (error) {
    console.error('\n❌ Scaffold failed:', error.message);
    throw error;
  }
}

/**
 * List available scaffold types
 */
export async function listScaffoldTypes() {
  console.log('Available scaffold types:');
  console.log('  api        - API protocol manifest');
  console.log('  data       - Data format protocol manifest');
  console.log('  event      - Event/messaging protocol manifest');
  console.log('  semantic   - Semantic/ontology protocol manifest');
  console.log('  importer   - Protocol importer class');
  console.log('  test       - Test scaffold');
}

/**
 * Show scaffold examples
 */
export async function showScaffoldExamples() {
  console.log('🏗️  Protocol Scaffolder - Examples\n');
  console.log('─'.repeat(50));

  console.log('\n📋 Interactive Mode (Recommended):');
  console.log('  npm --prefix app run cli scaffold');
  console.log('  (No arguments - will prompt for all options)\n');

  console.log('─'.repeat(50));
  console.log('\n📝 Non-Interactive Examples:\n');

  console.log('Generate API protocol:');
  console.log('  npm --prefix app run cli scaffold -- --type api --name MyService --baseUrl https://api.example.com\n');

  console.log('Generate data protocol:');
  console.log('  npm --prefix app run cli scaffold -- --type data --name LogFormat --format json\n');

  console.log('Generate event protocol:');
  console.log('  npm --prefix app run cli scaffold -- --type event --name Notifications --transport websocket\n');

  console.log('Generate semantic protocol:');
  console.log('  npm --prefix app run cli scaffold -- --type semantic --name Vocabulary --vocab schema.org\n');

  console.log('Generate standalone importer:');
  console.log('  npm --prefix app run cli scaffold -- --type importer --name CustomFormat\n');

  console.log('Generate test only:');
  console.log('  npm --prefix app run cli scaffold -- --type test --name MyComponent\n');

  console.log('─'.repeat(50));
  console.log('\n🔧 Options:\n');
  console.log('  --type          Protocol type (api, data, event, semantic, importer, test)');
  console.log('  --name          Component name');
  console.log('  --description   Description (optional)');
  console.log('  --version       Version (default: 1.0.0)');
  console.log('  --output        Output directory (default: ./artifacts/scaffolds)');
  console.log('  --dry-run       Preview without writing files');
  console.log('  --force         Overwrite existing files without prompting');
  console.log('  --trace         Enable trace mode with correlation IDs and feedback summary');
  console.log('  --verbose       Show detailed output including hints and suggestions');
  console.log('  --examples      Show this help message\n');

  console.log('─'.repeat(50));
  console.log('\n💡 Tips:\n');
  console.log('  • Run without arguments for interactive mode');
  console.log('  • Use --dry-run to preview generated files');
  console.log('  • Use --trace to see correlation IDs and detailed feedback');
  console.log('  • Use --verbose for hints, warnings, and suggestions');
  console.log('  • Files are previewed before writing in interactive mode');
  console.log('  • Existing files will be detected and you\'ll be prompted to overwrite\n');

  console.log('─'.repeat(50));
  console.log('\n🔍 Advanced Examples:\n');
  console.log('Preview with validation and traces:');
  console.log('  npm --prefix app run cli scaffold -- --type api --name MyAPI --dry-run --trace --verbose\n');

  console.log('Generate with detailed feedback:');
  console.log('  npm --prefix app run cli scaffold -- --type data --name LogFormat --trace --verbose\n');
}

export default { executeScaffoldCommand, listScaffoldTypes, showScaffoldExamples };
