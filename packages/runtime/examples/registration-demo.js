/**
 * Registration Pipeline Demo
 *
 * Demonstrates the complete lifecycle of protocol manifest registration
 */

const path = require('path');
const RegistrationPipeline = require('../core/registration/registration-pipeline');
const {  STATES } = require('../core/registration/state-machine-definition');

async function runDemo() {
  console.log('='.repeat(60));
  console.log('Registration Pipeline Demo');
  console.log('='.repeat(60));
  console.log();

  // Create pipeline instance
  const fs = require('fs').promises;
  const baseDir = path.join(__dirname, '..', 'fixtures', 'registration', 'demo-state');

  // Clean up previous state
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore if doesn't exist
  }

  const pipeline = new RegistrationPipeline({ baseDir });

  // Listen to state change events
  pipeline.on('stateChange', (data) => {
    console.log(`📝 State Change: ${data.fromState} → ${data.toState} (${data.transitionDuration}ms, v${data.version})`);
  });

  pipeline.on('initialized', (data) => {
    console.log(`✨ Initialized: ${data.manifestId} (v${data.state.version})`);
  });

  const manifestId = 'demo-payment-service';
  const manifest = {
    urn: 'urn:proto:api:example/payment-service@1.0.0',
    kind: 'API',
    version: '1.0.0',
    title: 'Payment Service API',
    description: 'REST API for processing payments',
    endpoints: [
      { path: '/payments', method: 'POST' },
      { path: '/payments/{id}', method: 'GET' }
    ]
  };

  try {
    // Step 1: Initialize
    console.log('\n--- Step 1: Initialize Manifest ---');
    const s1 = await pipeline.initialize(manifestId, manifest);
    console.log(`Current State: ${s1.state.currentState}`);
    console.log(`Version: ${s1.version}`);

    // Step 2: Submit for Review
    console.log('\n--- Step 2: Submit for Review ---');
    const s2 = await pipeline.submitForReview(manifestId);
    console.log(`Current State: ${s2.state.currentState}`);
    console.log(`Version: ${s2.version}`);

    // Step 3: Approve
    console.log('\n--- Step 3: Approve Manifest ---');
    const s3 = await pipeline.approve(
      manifestId,
      'alice@example.com',
      'All security checks passed. API design follows best practices.'
    );
    console.log(`Current State: ${s3.state.currentState}`);
    console.log(`Reviewer: ${s3.state.reviewer}`);
    console.log(`Version: ${s3.version}`);

    // Step 4: Register
    console.log('\n--- Step 4: Register Manifest ---');
    const s4 = await pipeline.register(manifestId);
    console.log(`Current State: ${s4.state.currentState}`);
    console.log(`Version: ${s4.version}`);
    console.log(`URN: ${s4.state.manifest.urn}`);

    // Verify terminal state
    const isTerminal = await pipeline.isInTerminalState(manifestId);
    console.log(`\n✅ Is Terminal State: ${isTerminal}`);

    // Load final state
    console.log('\n--- Final State Summary ---');
    const finalState = await pipeline.loadState(manifestId);
    console.log(JSON.stringify({
      manifestId: finalState.state.manifestId,
      currentState: finalState.state.currentState,
      version: finalState.version,
      reviewer: finalState.state.reviewer,
      createdAt: finalState.state.createdAt,
      updatedAt: finalState.state.updatedAt
    }, null, 2));

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Demo Complete!');
  console.log('='.repeat(60));
}

async function runRejectionDemo() {
  console.log('\n' + '='.repeat(60));
  console.log('Rejection & Retry Flow Demo');
  console.log('='.repeat(60));
  console.log();

  const fs = require('fs').promises;
  const baseDir = path.join(__dirname, '..', 'fixtures', 'registration', 'demo-rejection');

  // Clean up previous state
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore if doesn't exist
  }

  const pipeline = new RegistrationPipeline({ baseDir });

  pipeline.on('stateChange', (data) => {
    console.log(`📝 ${data.fromState} → ${data.toState}`);
  });

  const manifestId = 'demo-rejected-service';
  const manifest = {
    urn: 'urn:proto:api:example/incomplete-service@1.0.0',
    kind: 'API',
    version: '1.0.0',
    title: 'Incomplete Service'
  };

  try {
    console.log('--- Initial Submission ---');
    await pipeline.initialize(manifestId, manifest);
    await pipeline.submitForReview(manifestId);

    console.log('\n--- Rejection ---');
    await pipeline.reject(manifestId, 'Missing required endpoints and documentation');
    let state = await pipeline.loadState(manifestId);
    console.log(`State: ${state.state.currentState}`);
    console.log(`Reason: ${state.state.rejectionReason}`);

    console.log('\n--- Revert to Draft ---');
    await pipeline.revertToDraft(manifestId);
    state = await pipeline.loadState(manifestId);
    console.log(`State: ${state.state.currentState}`);

    console.log('\n--- Resubmit after Fixes ---');
    await pipeline.submitForReview(manifestId);
    state = await pipeline.loadState(manifestId);
    console.log(`State: ${state.state.currentState}`);

    console.log('\n--- Final Approval ---');
    await pipeline.approve(manifestId, 'bob@example.com', 'Fixed! All requirements met.');
    state = await pipeline.loadState(manifestId);
    console.log(`State: ${state.state.currentState}`);
    console.log(`Reviewer: ${state.state.reviewer}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
}

// Run demos
if (require.main === module) {
  (async () => {
    await runDemo();
    await runRejectionDemo();
  })();
}

module.exports = { runDemo, runRejectionDemo };
