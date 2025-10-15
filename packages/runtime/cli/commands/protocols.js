/**
 * Protocols Command - List and manage protocol implementations
 *
 * Features:
 * - List all available protocols with completion status
 * - Show generators and validators for each protocol
 * - Display MCP discovery support status
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

/**
 * List all protocols with their completion status
 */
export async function protocolsListCommand(options = {}) {
  console.log(chalk.bold('\n📋 Protocol Suite Status\n'));
  console.log('─'.repeat(80));

  // Define all 18 protocols as specified in the mission
  const allProtocols = [
    // Core Protocols (6)
    { name: 'API Protocol', file: 'api_protocol_v_1_1_1.js', category: 'Core' },
    { name: 'Data Protocol', file: 'data_protocol_v_1_1_1.js', category: 'Core' },
    { name: 'Event Protocol', file: 'event_protocol_v_1_1_1.js', category: 'Core' },
    { name: 'Workflow Protocol', file: 'workflow_protocol_v_1_1_1.js', category: 'Core' },
    { name: 'Agent Protocol', file: 'agent_protocol_v_1_1_1.js', category: 'Core' },
    { name: 'UI Component Protocol', file: 'ui_component_protocol_v_1_1_1.js', category: 'Core' },
    
    // Extended Protocols (12)
    { name: 'Infrastructure Protocol', file: 'Infrastructure Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Observability Protocol', file: 'Observability Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Identity & Access Protocol', file: 'Identity & Access Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Release/Deployment Protocol', file: 'Release:Deployment Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Configuration Protocol', file: 'Configuration Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Documentation Protocol', file: 'Documentation Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Analytics & Metrics Protocol', file: 'Analytics & Metrics Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Testing/Quality Protocol', file: 'Testing:Quality Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Integration Protocol', file: 'Integration Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'AI/ML Protocol', file: 'AI:ML Protocol — v1.1.1.js', category: 'Extended' },
    { name: 'Hardware Device Protocol', file: 'Hardware Device Protocol_v1.1.1.js', category: 'Extended' },
    { name: 'Semantic Protocol', file: 'Semantic Protocol — v3.2.0.js', category: 'Extended' }
  ];

  const srcDir = path.join(process.cwd(), 'src');
  let totalProtocols = 0;
  let completeProtocols = 0;
  let incompleteProtocols = 0;

  // Group by category
  const coreProtocols = allProtocols.filter(p => p.category === 'Core');
  const extendedProtocols = allProtocols.filter(p => p.category === 'Extended');

  // Check Core Protocols
  console.log(chalk.cyan.bold('\n🔧 Core Protocols (6):'));
  for (const protocol of coreProtocols) {
    const status = await checkProtocolStatus(srcDir, protocol);
    displayProtocolStatus(protocol.name, status);
    totalProtocols++;
    if (status.complete) completeProtocols++;
    else incompleteProtocols++;
  }

  // Check Extended Protocols
  console.log(chalk.magenta.bold('\n🚀 Extended Protocols (12):'));
  for (const protocol of extendedProtocols) {
    const status = await checkProtocolStatus(srcDir, protocol);
    displayProtocolStatus(protocol.name, status);
    totalProtocols++;
    if (status.complete) completeProtocols++;
    else incompleteProtocols++;
  }

  // Summary
  console.log('\n' + '─'.repeat(80));
  console.log(chalk.bold('\n📊 Summary:'));
  console.log(`Total Protocols: ${totalProtocols}`);
  console.log(chalk.green(`✅ Complete: ${completeProtocols}`));
  console.log(chalk.red(`❌ Incomplete: ${incompleteProtocols}`));
  
  const completionPercentage = Math.round((completeProtocols / totalProtocols) * 100);
  console.log(`Completion: ${completionPercentage}%`);
  
  if (incompleteProtocols === 0) {
    console.log(chalk.green.bold('\n🎉 All protocols are complete! Mission B10.2 success criteria met.'));
  } else {
    console.log(chalk.yellow.bold(`\n⚠️  ${incompleteProtocols} protocols need completion to meet mission criteria.`));
  }

  return { total: totalProtocols, complete: completeProtocols, incomplete: incompleteProtocols };
}

/**
 * Check the status of a protocol implementation
 */
async function checkProtocolStatus(srcDir, protocol) {
  const filePath = path.join(srcDir, protocol.file);
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Check for protocol factory function
    const hasFactory = content.includes('function create') && content.includes('Protocol(');
    
    // Check for generators
    const hasGenerators = content.includes('generate') && 
      (content.includes('generateSQL') || 
       content.includes('generateTest') || 
       content.includes('generateConfig') ||
       content.includes('generateDocs') ||
       content.includes('generateClient') ||
       content.includes('generateMermaid') ||
       content.includes('generateOTel') ||
       content.includes('generatePrometheus') ||
       content.includes('generateGrafana') ||
       content.includes('generateRunbook') ||
       content.includes('generateHealthChecks') ||
       content.includes('generateServiceMap') ||
       content.includes('generateAlertMatrix') ||
       content.includes('generateTestSuite') ||
       content.includes('generateTestPlan') ||
       content.includes('generateFixture') ||
       content.includes('generateMappingDoc') ||
       content.includes('generateTestScenarios') ||
       content.includes('generateRunnerSkeleton') ||
       content.includes('generateStreamProcessor') ||
       content.includes('generateLineage') ||
       content.includes('generateAgentCard') ||
       content.includes('generateWorkflowManifest') ||
       content.includes('generateClientSDK') ||
       content.includes('generatePolicy') ||
       content.includes('generateVisualMap') ||
       content.includes('generateAuditTests') ||
       content.includes('generateDotEnv') ||
       content.includes('generateK8sConfigMap') ||
       content.includes('generateK8sSecret') ||
       content.includes('generateTerraformTfvars') ||
       content.includes('generateDriverSkeleton') ||
       content.includes('generateMigration') ||
       content.includes('generateSchema') ||
       content.includes('generateValidation') ||
       content.includes('generateComponent') ||
       content.includes('generateStorybook') ||
       content.includes('generateCypressTest') ||
       content.includes('generateWorkflowEngine') ||
       content.includes('generateVisualDAG') ||
       content.includes('generateAgentNodeStub'));
    
    // Check for validators
    const hasValidators = content.includes('validate') && 
      (content.includes('runValidators') || 
       content.includes('validate:') ||
       content.includes('validate('));
    
    // Check for cross-checks
    const hasCrossChecks = content.includes('crossCheck') || content.includes('crossValidate');
    
    // Check for MCP discovery support (catalog function)
    const hasMCPSupport = (content.includes('Catalog') && content.includes('function create')) ||
      content.includes('createInfrastructureStack') ||
      content.includes('createDeviceFleet') ||
      content.includes('createIdentityCatalog') ||
      content.includes('createConfigCatalog') ||
      content.includes('createAPICatalog') ||
      content.includes('createAgentCatalog') ||
      content.includes('createUICatalog');
    
    const complete = hasFactory && hasGenerators && hasValidators && hasMCPSupport;
    
    return {
      exists: true,
      complete,
      hasFactory,
      hasGenerators,
      hasValidators,
      hasCrossChecks,
      hasMCPSupport,
      missing: []
    };
    
  } catch (error) {
    return {
      exists: false,
      complete: false,
      hasFactory: false,
      hasGenerators: false,
      hasValidators: false,
      hasCrossChecks: false,
      hasMCPSupport: false,
      missing: ['file', 'factory', 'generators', 'validators', 'mcp']
    };
  }
}

/**
 * Display protocol status with appropriate colors and symbols
 */
function displayProtocolStatus(name, status) {
  const symbol = status.complete ? '✅' : '❌';
  const color = status.complete ? chalk.green : chalk.red;
  
  console.log(`  ${symbol} ${color(name)}`);
  
  if (!status.complete && status.exists) {
    const missing = [];
    if (!status.hasFactory) missing.push('factory');
    if (!status.hasGenerators) missing.push('generators');
    if (!status.hasValidators) missing.push('validators');
    if (!status.hasMCPSupport) missing.push('MCP support');
    
    if (missing.length > 0) {
      console.log(chalk.gray(`    Missing: ${missing.join(', ')}`));
    }
  } else if (!status.exists) {
    console.log(chalk.gray('    File not found'));
  }
}

/**
 * Main protocols command handler
 */
export async function protocolsCommand(subcommand, options = {}) {
  switch (subcommand) {
    case 'list':
      return protocolsListCommand(options);
    default:
      console.log(chalk.red('Unknown subcommand. Use "list" to see all protocols.'));
      console.log('Usage: protocols <subcommand>');
      console.log('Subcommands:');
      console.log('  list    - List all protocols with completion status');
      return 1;
  }
}
