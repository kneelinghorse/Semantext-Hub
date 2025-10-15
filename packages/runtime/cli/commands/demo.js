/**
 * Demo Command - Run pre-configured demonstrations (ESM)
 *
 * Features:
 * - List available seed demos
 * - Run seed with automatic import
 * - Support database seed setup
 * - Optional governance generation
 */

import path from 'path';
import fs from 'fs-extra';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { createRequire } from 'module';
import { SeedCurator, SeedRegistry } from '../../seeds/index.js';
const require = createRequire(import.meta.url);
const { OpenAPIImporter } = require('../../importers/openapi/importer');

/**
 * Demo list sub-command
 * Lists all available demo seeds
 */
async function demoListCommand(options) {
  console.log(chalk.bold('\n📦 Available Demo Seeds:\n'));

  const registry = new SeedRegistry();
  const seeds = registry.list();

  if (seeds.length === 0) {
    console.log(chalk.yellow('No seeds available'));
    return;
  }

  // Group by type
  const byType = seeds.reduce((acc, seed) => {
    acc[seed.type] = acc[seed.type] || [];
    acc[seed.type].push(seed);
    return acc;
  }, {});

  // Display OpenAPI seeds
  if (byType.openapi && byType.openapi.length > 0) {
    console.log(chalk.cyan.bold('OpenAPI Seeds:'));
    byType.openapi.forEach(seed => {
      console.log(chalk.green(`  • ${seed.id}`) + chalk.gray(` - ${seed.description}`));
      if (seed.metadata) {
        console.log(chalk.gray(`    ${seed.metadata.api_endpoints} endpoints, ${seed.metadata.pii_fields} PII fields, ${seed.metadata.override_rules} override rules`));
      }
    });
    console.log();
  }

  // Display database seeds
  if (byType.database && byType.database.length > 0) {
    console.log(chalk.cyan.bold('Database Seeds:'));
    byType.database.forEach(seed => {
      console.log(chalk.green(`  • ${seed.id}`) + chalk.gray(` - ${seed.description}`));
      if (seed.metadata) {
        console.log(chalk.gray(`    ${seed.metadata.tables} tables, ${seed.metadata.sample_rows} rows (${seed.metadata.database})`));
      }
    });
    console.log();
  }

  console.log(chalk.gray('Run a demo: protocol-discover demo run <seed-id>'));
  console.log(chalk.gray('Guided mode: protocol-discover demo interactive'));
  console.log(chalk.gray('Database setup: protocol-discover demo db <seed-id> --start\n'));
}

/**
 * Demo run sub-command
 * Runs a specific seed demo
 */
async function demoRunCommand(seedId, options = {}) {
  const workspace = options.workspace || path.join(process.cwd(), 'demo-workspace');
  const withGovernance = options.withGovernance || false;

  console.log(chalk.bold(`\n🎯 Running ${seedId} Demo...\n`));

  const curator = new SeedCurator({
    seedsDir: path.join(__dirname, '../../seeds')
  });

  let spinner = ora('Loading seed manifest').start();

  try {
    // Load seed
    const seed = await curator.loadSeed(seedId);
    spinner.succeed(`Seed loaded: ${seed.manifest.name}`);

    // Display seed info
    console.log(chalk.gray(`   Type: ${seed.manifest.type}`));
    console.log(chalk.gray(`   Description: ${seed.manifest.description}`));

    let result;

    if (seed.manifest.type === 'openapi') {
      // Import OpenAPI seed
      spinner = ora('Importing OpenAPI specification').start();

      const importer = new OpenAPIImporter();
      result = await curator.importSeed(seedId, {
        workspace,
        includeOverrides: true,
        importer
      });

      if (result.errors.length > 0) {
        spinner.warn('Import completed with errors');
        result.errors.forEach(err => {
          console.log(chalk.yellow(`   ⚠ ${err.error}`));
        });
      } else {
        spinner.succeed('Import completed successfully');
      }

      // Display stats
      console.log(chalk.green(`\n✓ ${result.stats.protocols} protocols discovered`));
      console.log(chalk.green(`✓ ${result.stats.pii_fields} PII fields detected`));
      if (result.stats.overrides_applied > 0) {
        console.log(chalk.green(`✓ ${result.stats.overrides_applied} override rules installed`));
      }

      if (result.files) {
        console.log(chalk.gray('\nWorkspace artifacts:')); 
        if (result.files.manifest) {
          console.log(chalk.gray(`  • Manifest: ${result.files.manifest}`));
        }
        if (result.files.spec) {
          console.log(chalk.gray(`  • Spec: ${result.files.spec}`));
        }
        if (result.files.overridesDir) {
          console.log(chalk.gray(`  • Overrides: ${result.files.overridesDir}`));
        }
      }

      // Generate governance if requested
      if (withGovernance) {
        spinner = ora('Generating governance report').start();

        try {
          const { GovernanceGenerator } = await import('../../core/governance/index.mjs');
          const generator = new GovernanceGenerator();

          const governancePath = path.join(workspace, 'GOVERNANCE.md');
          await generator.generateToFile(governancePath, {
            sections: ['overview', 'architecture', 'privacy', 'changes']
          });

          spinner.succeed(`Governance report generated: ${governancePath}`);
        } catch (err) {
          spinner.fail(`Governance generation failed: ${err.message}`);
        }
      }

      // Display next steps
      console.log(chalk.bold('\n📋 Next Steps:'));
      console.log(chalk.gray(`  1. Review workspace: cd ${workspace}`));
      if (!withGovernance) {
        console.log(chalk.gray('  2. Generate governance: protocol-discover governance'));
      }
      console.log(chalk.gray(`  3. Explore manifests: ls ${path.join(workspace, '.proto', 'manifests')}`));
      console.log(chalk.gray(`  4. Explore seed data in ${path.relative(process.cwd(), workspace)}\n`));

      return result;
    }

    if (seed.manifest.type === 'database') {
      spinner = ora('Preparing database seed').start();

      result = await curator.importSeed(seedId, {
        workspace,
        includeOverrides: false
      });

      spinner.succeed('Database assets copied');

      const instructions = result.instructions;

      console.log(chalk.bold('\n🐘 Database Seed Setup:\n'));
      console.log(chalk.cyan('  Start database:'));
      console.log(chalk.gray(`    ${instructions.setup_command}\n`));
      console.log(chalk.cyan('  Stop database:'));
      console.log(chalk.gray(`    ${instructions.teardown_command}\n`));
      console.log(chalk.cyan('  Connection details:'));
      console.log(chalk.gray(`    Host: localhost`));
      console.log(chalk.gray(`    Port: ${seed.manifest.metadata.port}`));
      console.log(chalk.gray(`    Database: ${seed.manifest.metadata.default_database}\n`));
      console.log(chalk.cyan('  Seed files copied to:'));
      console.log(chalk.gray(`    ${instructions.directory}`));
      console.log(chalk.cyan('  See full instructions:'));
      console.log(chalk.gray(`    cat ${instructions.readme}\n`));

      return result;
    }

    return result;
  } catch (err) {
    spinner.fail(`Demo failed: ${err.message}`);
    console.error(chalk.red(err.stack));
    process.exit(1);
    return false;
  }
}

/**
 * Interactive guided demo experience
 */
async function demoInteractiveCommand(options = {}) {
  if (!process.stdout.isTTY) {
    console.log(chalk.yellow('\nInteractive mode requires a TTY. Showing available seeds instead.'));
    await demoListCommand(options);
    return;
  }

  const registry = new SeedRegistry();
  const seeds = registry.list();

  if (seeds.length === 0) {
    console.log(chalk.yellow('\nNo demo seeds are currently available. Run `protocol-discover demo list` for updates.'));
    return;
  }

  console.log(chalk.bold('\n🧭 Interactive Demo Guide\n'));
  console.log(chalk.gray('Select a seed to explore. We will copy manifests, specs, and overrides into a demo workspace.\n'));

  seeds.forEach((seed, index) => {
    const idx = String(index + 1).padStart(2, ' ');
    const meta = seed.metadata || {};
    const summary = seed.type === 'openapi'
      ? `${meta.api_endpoints || '?'} endpoints • ${meta.pii_fields || 0} PII fields`
      : `${meta.tables || '?'} tables • ${meta.sample_rows || 0} rows`;
    console.log(`${chalk.cyan(idx)} ${chalk.green(seed.id)} ${chalk.gray('- ' + seed.description)}`);
    console.log(chalk.gray(`    ${summary}`));
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = question => new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));

  let selectedSeed;
  while (!selectedSeed) {
    const answer = await ask('\nEnter seed number: ');
    const index = Number.parseInt(answer, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= seeds.length) {
      selectedSeed = seeds[index - 1];
    } else {
      console.log(chalk.red('Please choose a valid number from the list.'));
    }
  }

  const defaultWorkspace = options.workspace || path.join(process.cwd(), 'demo-workspace');
  const workspaceAnswer = await ask(`Workspace directory [${defaultWorkspace}]: `);
  const workspace = workspaceAnswer ? path.resolve(workspaceAnswer) : defaultWorkspace;

  const governanceAnswer = await ask('Generate governance report? (y/N): ');
  const withGovernance = ['y', 'yes'].includes((governanceAnswer || '').toLowerCase());

  rl.close();

  console.log(chalk.gray('\nLaunching guided demo...'));
  await demoRunCommand(selectedSeed.id, {
    ...options,
    workspace,
    withGovernance
  });
}

/**
 * Demo db sub-command
 * Manage database seed containers
 */
async function demoDbCommand(seedId, options) {
  const curator = new SeedCurator({
    seedsDir: path.join(__dirname, '../../seeds')
  });

  const seed = await curator.loadSeed(seedId);

  if (seed.manifest.type !== 'database') {
    console.error(chalk.red(`\n✗ Seed ${seedId} is not a database seed`));
    process.exit(1);
  }

  const candidateRoots = [];
  if (options.workspace) {
    candidateRoots.push(path.resolve(options.workspace));
  }
  candidateRoots.push(path.join(process.cwd(), 'demo-workspace'));

  let seedPath = null;
  for (const root of candidateRoots) {
    const candidate = path.join(root, '.proto', 'databases', seedId);
    if (await fs.pathExists(path.join(candidate, 'docker-compose.yml'))) {
      seedPath = candidate;
      break;
    }
  }

  if (!seedPath) {
    seedPath = path.join(__dirname, '../../seeds/databases', seedId);
  }

  const composePath = path.join(seedPath, 'docker-compose.yml');

  if (!(await fs.pathExists(composePath))) {
    console.error(chalk.red(`\n✗ Docker Compose file not found: ${composePath}`));
    process.exit(1);
  }

  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    if (options.start) {
      const spinner = ora(`Starting ${seed.manifest.name}`).start();
      await execAsync(`docker-compose -f ${composePath} up -d`);
      spinner.succeed(`${seed.manifest.name} started`);

      console.log(chalk.bold('\n📊 Connection Details:\n'));
      console.log(chalk.gray(`  Host: localhost`));
      console.log(chalk.gray(`  Port: ${seed.manifest.metadata.port}`));
      console.log(chalk.gray(`  Database: ${seed.manifest.metadata.default_database}`));
      console.log(chalk.gray(`  User: ${seedId}_user`));
      console.log(chalk.gray(`  Password: ${seedId}_pass`));
      console.log(chalk.gray(`  Files: ${seedPath}\n`));
    } else if (options.stop) {
      const spinner = ora(`Stopping ${seed.manifest.name}`).start();
      await execAsync(`docker-compose -f ${composePath} down`);
      spinner.succeed(`${seed.manifest.name} stopped`);
    } else if (options.status) {
      const { stdout } = await execAsync(`docker-compose -f ${composePath} ps`);
      console.log(chalk.bold(`\n${seed.manifest.name} Status:\n`));
      console.log(stdout);
    } else {
      console.log(chalk.yellow('\nSpecify --start, --stop, or --status'));
    }
  } catch (err) {
    console.error(chalk.red(`\n✗ Command failed: ${err.message}`));
    process.exit(1);
  }
}

/**
 * Main demo command handler
 */
async function demoCommand(subcommand, seedId, options) {
  if (subcommand === 'list') {
    await demoListCommand(options);
  } else if (subcommand === 'run' && seedId) {
    await demoRunCommand(seedId, options);
  } else if (subcommand === 'db' && seedId) {
    await demoDbCommand(seedId, options);
  } else if (subcommand === 'interactive') {
    await demoInteractiveCommand(options);
  } else {
    console.log(chalk.yellow('\nUsage:'));
    console.log(chalk.gray('  protocol-discover demo list'));
    console.log(chalk.gray('  protocol-discover demo run <seed-id> [--with-governance]'));
    console.log(chalk.gray('  protocol-discover demo interactive'));
    console.log(chalk.gray('  protocol-discover demo db <seed-id> --start|--stop|--status\n'));
  }
}

export { demoCommand, demoListCommand, demoRunCommand, demoDbCommand, demoInteractiveCommand };
