#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Import utilities (will be created)
import ProtocolGenerator from '../../utils/protocol-generator.js';
import SmartDefaults from '../../utils/smart-defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProtocolWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.protocolData = {};
    this.templatesPath = path.join(__dirname, '../../templates/protocol-templates');
  }

  async start() {
    console.log('\n🚀 Protocol Authoring Wizard v2');
    console.log('=====================================\n');
    
    try {
      await this.collectProtocolType();
      await this.collectBasicInfo();
      await this.collectProtocolSpecificInfo();
      await this.generateManifest();
      await this.validateManifest();
      
      console.log('\n✅ Protocol manifest created successfully!');
      console.log(`📁 Location: ${this.protocolData.outputPath}`);
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async collectProtocolType() {
    const types = ['api', 'data', 'event', 'workflow'];
    
    console.log('Select protocol type:');
    types.forEach((type, index) => {
      console.log(`  ${index + 1}. ${type.toUpperCase()}`);
    });
    
    const answer = await this.question('\nEnter choice (1-4): ');
    const choice = parseInt(answer) - 1;
    
    if (choice < 0 || choice >= types.length) {
      throw new Error('Invalid protocol type selection');
    }
    
    this.protocolData.type = types[choice];
    console.log(`✓ Selected: ${this.protocolData.type.toUpperCase()}`);
  }

  async collectBasicInfo() {
    console.log('\n📝 Basic Information');
    console.log('====================');
    
    // Use smart defaults
    const defaults = SmartDefaults.getDefaults(this.protocolData.type);
    
    this.protocolData.name = await this.question(`Protocol name: `, defaults.name);
    this.protocolData.version = await this.question(`Version: `, defaults.version);
    this.protocolData.description = await this.question(`Description: `, defaults.description);
    this.protocolData.author = await this.question(`Author: `, defaults.author);
    
    // Generate timestamp
    this.protocolData.timestamp = new Date().toISOString();
  }

  async collectProtocolSpecificInfo() {
    console.log(`\n🔧 ${this.protocolData.type.toUpperCase()} Specific Configuration`);
    console.log('==========================================');
    
    const defaults = SmartDefaults.getDefaults(this.protocolData.type);
    
    switch (this.protocolData.type) {
      case 'api':
        await this.collectApiInfo(defaults);
        break;
      case 'data':
        await this.collectDataInfo(defaults);
        break;
      case 'event':
        await this.collectEventInfo(defaults);
        break;
      case 'workflow':
        await this.collectWorkflowInfo(defaults);
        break;
    }
  }

  async collectApiInfo(defaults) {
    this.protocolData.baseUrl = await this.question(`Base URL: `, defaults.baseUrl);
    this.protocolData.authentication = await this.question(`Authentication: `, defaults.authentication);
    
    console.log('\nAdd endpoint? (y/n): ');
    const addEndpoint = await this.question('', 'y');
    
    if (addEndpoint.toLowerCase() === 'y') {
      this.protocolData.endpoint_path = await this.question(`Endpoint path: `, defaults.endpoint_path);
      this.protocolData.endpoint_method = await this.question(`HTTP method: `, defaults.endpoint_method);
      this.protocolData.endpoint_description = await this.question(`Endpoint description: `, defaults.endpoint_description);
    }
  }

  async collectDataInfo(defaults) {
    this.protocolData.format = await this.question(`Data format: `, defaults.format);
    this.protocolData.compression = await this.question(`Compression: `, defaults.compression);
  }

  async collectEventInfo(defaults) {
    this.protocolData.transport = await this.question(`Transport: `, defaults.transport);
    this.protocolData.event_name = await this.question(`Event name: `, defaults.event_name);
    this.protocolData.event_description = await this.question(`Event description: `, defaults.event_description);
  }

  async collectWorkflowInfo(defaults) {
    this.protocolData.workflow_type = await this.question(`Workflow type: `, defaults.workflow_type);
    this.protocolData.steps = await this.question(`Number of steps: `, defaults.steps);
    this.protocolData.trigger = await this.question(`Trigger type: `, defaults.trigger);
  }

  async generateManifest() {
    console.log('\n🔄 Generating manifest...');
    
    const generator = new ProtocolGenerator();
    const manifest = await generator.generate(this.protocolData);
    
    // Determine output path
    const outputDir = path.join(process.cwd(), 'protocols');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filename = `${this.protocolData.name}-${this.protocolData.type}-manifest.json`;
    this.protocolData.outputPath = path.join(outputDir, filename);
    
    fs.writeFileSync(this.protocolData.outputPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest generated: ${filename}`);
  }

  async validateManifest() {
    console.log('\n🔍 Validating manifest...');
    
    try {
      // Check if validation script exists
      const validationScript = path.join(__dirname, '../../scripts/validate-manifest.js');
      if (fs.existsSync(validationScript)) {
        execSync(`node ${validationScript} ${this.protocolData.outputPath}`, { stdio: 'pipe' });
        console.log('✓ Manifest validation passed');
      } else {
        console.log('⚠️  Validation script not found, skipping validation');
      }
    } catch (error) {
      console.log('⚠️  Validation failed, but manifest was created');
    }
  }

  question(prompt, defaultValue = '') {
    return new Promise((resolve) => {
      const fullPrompt = defaultValue ? `${prompt}[${defaultValue}] ` : prompt;
      this.rl.question(fullPrompt, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const wizard = new ProtocolWizard();
  wizard.start().catch(console.error);
}

export default ProtocolWizard;
