#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { once } from 'node:events';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';

import fs from 'fs-extra';
import express from 'express';
import fetch from 'node-fetch';

import { MetricsIngestWriter } from '../services/obs/ingest.mjs';
import { loadBudgets, summarizeMetrics, evaluateBudgets, loadLogEntries } from './perf-status.mjs';
import { discoverCommand } from '../../packages/runtime/cli/commands/discover.js';
import { approveCommand, getApprovedPath } from '../../packages/runtime/cli/commands/approve.js';
import { catalogBuildGraphCommand } from '../../cli/commands/catalog-build-graph.js';
import { generateDiagram } from '../../cli/commands/catalog-generate-diagram.js';
import { writeCytoscape } from '../../src/visualization/cytoscape/exporter.js';
import { launch as launchWithGuardian } from '../../src/cli/utils/open-guardian.js';
import { createRegistryServer } from '../services/registry/server.mjs';
import { signJws, verifyJws } from '../libs/signing/jws.mjs';
import { callAgent } from '../libs/a2a/client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const DEFAULT_BUDGETS_PATH = path.resolve(APP_ROOT, 'config', 'perf-budgets.json');

const STEP_CATEGORIES = {
  import: 'ingest',
  approve: 'ingest',
  catalog: 'plan',
  diagram: 'plan',
  cytoscape: 'plan',
  docs: 'plan',
  registry: 'runtime',
  a2a: 'runtime',
  report: 'plan',
  sign: 'plan',
  open: 'plan',
};

const WSAP_AGENT_DEFINITIONS = [
  {
    urn: 'urn:agent:wsap:analytics@1.0.0',
    name: 'analytics-agent',
    displayName: 'Analytics Agent',
    version: '1.0.0',
    description: 'Generates analytics reports and echoes diagnostics across the workspace.',
    tags: ['analytics', 'wsap'],
    capabilities: [
      {
        name: 'analytics.report',
        capability: 'analytics.report',
        description: 'Produce analytics summaries for governance-ready reports.',
        tags: ['analytics', 'report'],
      },
      {
        name: 'analytics.echo',
        capability: 'analytics.echo',
        description: 'Echo diagnostic messages between agents.',
        tags: ['diagnostic', 'echo'],
      },
    ],
  },
  {
    urn: 'urn:agent:wsap:workflow@1.0.0',
    name: 'workflow-agent',
    displayName: 'Workflow Agent',
    version: '1.0.0',
    description: 'Coordinates workflow approvals and echoes status updates.',
    tags: ['workflow', 'wsap'],
    capabilities: [
      {
        name: 'workflow.approval',
        capability: 'workflow.approval',
        description: 'Approve workflow steps and record audit trails.',
        tags: ['workflow', 'approval'],
      },
      {
        name: 'workflow.echo',
        capability: 'workflow.echo',
        description: 'Echo workflow-related diagnostics.',
        tags: ['workflow', 'echo'],
      },
    ],
  },
  {
    urn: 'urn:agent:wsap:monitor@1.0.0',
    name: 'monitor-agent',
    displayName: 'Monitor Agent',
    version: '1.0.0',
    description: 'Monitors runtime health and echoes telemetry events.',
    tags: ['monitoring', 'wsap'],
    capabilities: [
      {
        name: 'monitor.health',
        capability: 'monitor.health',
        description: 'Report health metrics for registered agents.',
        tags: ['monitoring', 'health'],
      },
      {
        name: 'monitor.echo',
        capability: 'monitor.echo',
        description: 'Echo telemetry diagnostics.',
        tags: ['monitoring', 'echo'],
      },
    ],
  },
];

function roundMs(ms) {
  return Number(ms.toFixed(3));
}

function generateSessionId(start = new Date()) {
  return `wsap-${start.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

async function ensureKeepFile(rootDir) {
  const keepPath = path.join(rootDir, '.keep');
  await fs.ensureDir(rootDir);
  if (!(await fs.pathExists(keepPath))) {
    await fs.writeFile(keepPath, '');
  }
}

async function resolveOpenApiSeed(seedId) {
  const seedsRoot = path.join(REPO_ROOT, 'seeds', 'openapi');
  const entries = await fs.readdir(seedsRoot);

  for (const entry of entries) {
    const dirPath = path.join(seedsRoot, entry);
    const manifestPath = path.join(dirPath, 'manifest.json');
    if (!(await fs.pathExists(manifestPath))) {
      continue;
    }
    const manifest = await fs.readJson(manifestPath);
    if (manifest?.id === seedId || entry === seedId) {
      const specPath = manifest?.spec_path
        ? path.join(dirPath, manifest.spec_path)
        : path.join(dirPath, 'spec.json');
      if (!(await fs.pathExists(specPath))) {
        throw new Error(`Spec file not found for seed "${seedId}" at ${specPath}`);
      }
      const overridesPath = manifest?.overrides_path
        ? path.join(dirPath, manifest.overrides_path)
        : null;
      return {
        id: manifest.id ?? seedId,
        manifest,
        dir: dirPath,
        specPath,
        overridesPath: overridesPath && (await fs.pathExists(overridesPath)) ? overridesPath : null,
      };
    }
  }

  throw new Error(`Seed "${seedId}" not found under seeds/openapi/`);
}

function formatRelative(baseDir, targetPath) {
  try {
    return path.relative(baseDir, targetPath) || path.basename(targetPath);
  } catch (error) {
    return targetPath;
  }
}

function buildAgentCard(definition, endpointUrl) {
  return {
    id: definition.urn,
    name: definition.displayName,
    version: definition.version,
    description: definition.description,
    capabilities: {
      tools: definition.capabilities.map((capability) => ({
        name: capability.name,
        capability: capability.capability,
        description: capability.description,
        urn: `urn:capability:${capability.capability}`,
        tags: capability.tags,
      })),
      tags: definition.tags,
    },
    communication: {
      endpoints: {
        default: endpointUrl,
        http: endpointUrl,
      },
      supported: ['http'],
    },
    authorization: {
      type: 'none',
      scopes: [],
    },
    metadata: {
      owner: 'wsap-demo',
      environment: 'local',
    },
  };
}

function parseArgs(argv) {
  const options = {
    open: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case '--seed':
        options.seed = argv[++index];
        break;
      case '--session':
        options.sessionId = argv[++index];
        break;
      case '--artifact-root':
        options.artifactRoot = argv[++index];
        break;
      case '--log-root':
        options.logRoot = argv[++index];
        break;
      case '--budgets':
        options.budgetsPath = argv[++index];
        break;
      case '--no-open':
        options.open = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run wsap [-- --options]

Options:
  --seed <id>           Seed identifier (default: github-api)
  --session <id>        Explicit session identifier
  --artifact-root <p>   Override artifact root directory
  --log-root <p>        Override metrics log root directory
  --budgets <p>         Custom budgets JSON path
  --no-open             Skip attempting to open the generated diagram
  -h, --help            Show this help message
`);
}

async function writeSummaryDoc(summaryPath, context) {
  const lines = [
    `# WSAP Session ${context.sessionId}`,
    '',
    `- Started: ${context.startedAt}`,
    `- Completed: ${context.completedAt ?? 'incomplete'}`,
    `- Seed: ${context.seedId}`,
    `- Draft manifest: ${formatRelative(context.runDir, context.artifacts.draftManifest)}`,
    `- Approved manifest: ${formatRelative(context.runDir, context.artifacts.approvedManifest)}`,
    `- Catalog graph: ${formatRelative(context.runDir, context.artifacts.catalogGraph)}`,
    `- Draw.io diagram: ${formatRelative(context.runDir, context.artifacts.drawioDiagram)}`,
    `- Cytoscape export: ${formatRelative(context.runDir, context.artifacts.cytoscapeExport)}`,
    `- Metrics log: ${context.metrics.logPath ? formatRelative(context.runDir, context.metrics.logPath) : 'n/a'}`,
    '',
    '## Durations (ms)',
    '',
  ];

  for (const [step, duration] of Object.entries(context.durations)) {
    lines.push(`- ${step}: ${duration}`);
  }

  if (context.metrics.aggregate.length > 0) {
    lines.push('', '## Aggregated Metrics');
    for (const entry of context.metrics.aggregate) {
      lines.push(`- ${entry.step}: ${entry.ms}ms (ok=${entry.ok})`);
    }
  }

  if (context.evaluation) {
    lines.push('', `## Performance Budgets: ${context.evaluation.pass ? 'PASS' : 'FAIL'}`);
    if (context.evaluation.violations.length > 0) {
      for (const violation of context.evaluation.violations) {
        lines.push(
          `  - ${violation.tool}/${violation.step} ${violation.metric}: ` +
            `${violation.actual.toFixed(2)}ms > ${violation.limit.toFixed(2)}ms`,
        );
      }
    }
  }

  if (context.multiAgent?.registry?.agents?.length) {
    lines.push('', '## Multi-Agent Registry', '');
    lines.push(`- Registry URL: ${context.multiAgent.registry.url}`);
    lines.push(`- Signing Key: ${context.multiAgent.registry.keyId ?? 'unknown'}`);
    if (context.multiAgent.registry.policyPath) {
      lines.push(
        `- Signature policy: ${formatRelative(context.runDir, context.multiAgent.registry.policyPath)}`,
      );
    }
    lines.push('', 'Registered Agents:');
    for (const agent of context.multiAgent.registry.agents) {
      const capabilities = (agent.capabilities ?? []).join(', ') || 'n/a';
      lines.push(`- ${agent.urn} ⇒ ${capabilities}`);
    }
  }

  if (context.multiAgent?.a2a?.length) {
    lines.push('', '## A2A Calls', '');
    for (const call of context.multiAgent.a2a) {
      const duration = call.durationMs !== null && call.durationMs !== undefined ? `${call.durationMs}ms` : 'n/a';
      const resolved = call.resolvedUrn ? ` → ${call.resolvedUrn}` : '';
      lines.push(`- ${call.mode}:${call.target}${resolved} (${duration})`);
    }
  }

  if (context.multiAgent?.signatures?.length) {
    lines.push('', '## Artifact Signatures', '');
    for (const signature of context.multiAgent.signatures) {
      const signaturePath = formatRelative(context.runDir, signature.signaturePath);
      const status = signature.verification?.valid ? 'valid' : 'invalid';
      lines.push(`- ${signature.artifact}: ${signaturePath} (${status})`);
    }
  }

  if (context.errors?.length) {
    lines.push('', '## Errors', '');
    for (const err of context.errors) {
      const message = typeof err === 'string' ? err : err?.message ?? String(err);
      lines.push(`- ${message}`);
    }
  }

  await fs.ensureDir(path.dirname(summaryPath));
  await fs.writeFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

export async function runWsap(options = {}) {
  const startedAt = new Date();
  const sessionId = options.sessionId ?? generateSessionId(startedAt);
  const seedId = options.seed ?? 'github-api';

  const artifactRoot = path.resolve(options.artifactRoot ?? path.join(APP_ROOT, 'artifacts', 'wsap'));
  await ensureKeepFile(artifactRoot);

  const runDir = path.join(artifactRoot, sessionId);
  const directories = {
    drafts: path.join(runDir, 'drafts'),
    approved: path.join(runDir, 'approved'),
    catalog: path.join(runDir, 'catalog'),
    drawio: path.join(runDir, 'drawio'),
    cytoscape: path.join(runDir, 'cytoscape'),
    docs: path.join(runDir, 'docs'),
  };

  await Promise.all(Object.values(directories).map((dir) => fs.ensureDir(dir)));

  const logRoot = path.resolve(options.logRoot ?? path.join(runDir, 'metrics'));
  await fs.ensureDir(logRoot);
  const writer = new MetricsIngestWriter({ sessionId, root: logRoot });

  const durations = new Map();
  const statuses = new Map();
  const aggregateEvents = [];
  const metricsContext = {
    logPath: null,
    summary: null,
  };
  const stepSummaries = {};
  const registeredAgents = [];
  const a2aCalls = [];
  const teardowns = [];
  let registryServer = null;
  let registryUrl = null;
  let registryApiKey = null;
  let signatureKeyId = null;
  let signaturePolicyPath = null;
  let privateKeyPem = null;
  let publicKeyPem = null;
  const context = {
    sessionId,
    seedId,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    runDir,
    durations: {},
    artifacts: {},
    metrics: {
      logPath: null,
      summary: null,
      aggregate: aggregateEvents,
    },
    evaluation: null,
    errors: [],
    error: null,
    multiAgent: {
      registry: null,
      a2a: a2aCalls,
      signatures: [],
    },
  };

  let fatalError = null;
  let catalogGraphResult = null;
  let diagramResult = null;

  async function logEvent(step, ms, ok) {
    const event = {
      ts: new Date().toISOString(),
      sessionId,
      tool: 'wsap',
      step,
      ms: roundMs(ms),
      ok,
    };

    const result = await writer.log(event);
    metricsContext.logPath = result.path;
    return result.path;
  }

  async function runStep(stepName, fn) {
    const summary = stepSummaries[stepName] ?? { name: stepName };
    stepSummaries[stepName] = summary;
    summary.startedAt = new Date().toISOString();

    const startMark = performance.now();
    let result;
    let ok = false;

    try {
      result = await fn();
      ok = true;
      summary.result = result;
      return result;
    } finally {
      const duration = roundMs(performance.now() - startMark);
      summary.durationMs = duration;
      summary.ok = ok;
      summary.completedAt = new Date().toISOString();
      durations.set(stepName, duration);
      statuses.set(stepName, ok);

      try {
        await logEvent(stepName, duration, ok);
      } catch (logError) {
        if (!fatalError) {
          fatalError = logError;
        }
      }
    }
  }

  try {
    const seed = await resolveOpenApiSeed(seedId);
    context.seed = {
      id: seed.id,
      specPath: seed.specPath,
      overridesPath: seed.overridesPath,
    };

    const importResult = await runStep('import', async () => {
      await discoverCommand('api', seed.specPath, {
        output: directories.drafts,
        format: 'json',
      });

      const draftFiles = (await fs.readdir(directories.drafts)).filter((file) =>
        file.endsWith('.draft.json'),
      );
      if (draftFiles.length === 0) {
        throw new Error('No draft manifest generated.');
      }
      const draftPath = path.join(directories.drafts, draftFiles[0]);
      return { draftPath };
    });
    context.artifacts.draftManifest = importResult.draftPath;

    const approveResult = await runStep('approve', async () => {
      const draftPath = importResult.draftPath;
      await approveCommand(draftPath, { force: true });
      const approvedSourcePath = getApprovedPath(draftPath);
      if (!(await fs.pathExists(approvedSourcePath))) {
        throw new Error(`Approved manifest not found at ${approvedSourcePath}`);
      }
      await fs.copyFile(
        approvedSourcePath,
        path.join(directories.approved, path.basename(approvedSourcePath)),
      );
      return {
        approvedPath: path.join(directories.approved, path.basename(approvedSourcePath)),
        sourcePath: approvedSourcePath,
      };
    });
    context.artifacts.approvedManifest = approveResult.approvedPath;

    catalogGraphResult = await runStep('catalog', async () => {
      const result = await catalogBuildGraphCommand({
        workspace: runDir,
        catalogPaths: [directories.approved],
        output: path.join(directories.catalog, 'catalog-graph.json'),
        overwrite: true,
        pretty: true,
        silent: true,
      });
      return result;
    });
    context.artifacts.catalogGraph = catalogGraphResult.outputPath;

    diagramResult = await runStep('diagram', async () => {
      const result = await generateDiagram({
        workspace: runDir,
        graph: catalogGraphResult.graph,
        output: path.join(directories.drawio, 'catalog.drawio'),
        overwrite: true,
        silent: true,
      });
      return result;
    });
    context.artifacts.drawioDiagram = diagramResult.outputPath;

    const cytoscapeResult = await runStep('cytoscape', async () => {
      const outputPath = path.join(directories.cytoscape, 'catalog.json');
      const result = await writeCytoscape(catalogGraphResult.graph, outputPath, {
        overwrite: true,
      });
      return result;
    });
    context.artifacts.cytoscapeExport = cytoscapeResult.outputPath;

    const docsResult = await runStep('docs', async () => {
      const summaryPath = path.join(directories.docs, 'summary.md');
      return { summaryPath };
    });
    context.artifacts.docsSummary = docsResult.summaryPath;

    const registryResult = await runStep('registry', async () => {
      const registryRoot = path.join(runDir, 'registry');
      await fs.ensureDir(registryRoot);

      const storePath = path.join(registryRoot, 'store.jsonl');
      const indexPath = path.join(registryRoot, 'index.json');
      const capIndexPath = path.join(registryRoot, 'cap-index.json');
      signaturePolicyPath = path.join(registryRoot, 'signature-policy.json');

      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      signatureKeyId = `urn:proto:wsap:signing:${sessionId}`;

      await fs.writeJson(
        signaturePolicyPath,
        {
          version: 1,
          requireSignature: true,
          keys: [
            {
              keyId: signatureKeyId,
              algorithm: 'EdDSA',
              publicKey: publicKeyPem,
            },
          ],
        },
        { spaces: 2 },
      );

      const publicKeyPath = path.join(registryRoot, 'wsap-ed25519.pub.pem');
      await fs.writeFile(publicKeyPath, `${publicKeyPem}\n`, 'utf8');
      context.artifacts.signingPublicKey = publicKeyPath;

      registryApiKey = `wsap-${randomUUID()}`;
      const { app: registryApp } = await createRegistryServer({
        storePath,
        indexPath,
        capIndexPath,
        apiKey: registryApiKey,
        signaturePolicyPath,
      });

      registryServer = registryApp.listen(0, '127.0.0.1');
      await once(registryServer, 'listening');
      const address = registryServer.address();
      registryUrl =
        typeof address === 'string'
          ? address
          : `http://127.0.0.1:${address?.port ?? 0}`;

      teardowns.push(
        () =>
          new Promise((resolve) => {
            if (!registryServer) {
              resolve();
              return;
            }
            registryServer.close(() => resolve());
          }),
      );

      const agentEntries = [];
      const agentTeardownFns = [];

      try {
        for (const definition of WSAP_AGENT_DEFINITIONS) {
          const agentApp = express();
          agentApp.use(express.json());
          agentApp.post('/a2a/echo', (request, response) => {
            response.json({
              ok: true,
              agent: definition.name,
              message: request.body?.payload?.message ?? 'pong',
              urn: definition.urn,
              correlationId: request.get('X-Correlation-ID') ?? null,
              receivedAt: new Date().toISOString(),
            });
          });
          agentApp.get('/health', (request, response) => {
            response.json({
              status: 'ok',
              agent: definition.name,
              checkedAt: new Date().toISOString(),
            });
          });

          const server = agentApp.listen(0, '127.0.0.1');
          await once(server, 'listening');
          agentTeardownFns.push(
            () =>
              new Promise((resolve) => {
                server.close(() => resolve());
              }),
          );
          const agentAddress = server.address();
          const endpointUrl =
            typeof agentAddress === 'string'
              ? agentAddress
              : `http://127.0.0.1:${agentAddress?.port ?? 0}`;

          const card = buildAgentCard(definition, endpointUrl);
          const envelope = signJws(card, {
            privateKey: privateKeyPem,
            keyId: signatureKeyId,
          });

          const response = await fetch(`${registryUrl}/registry`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': registryApiKey,
            },
            body: JSON.stringify({
              urn: definition.urn,
              card,
              sig: envelope,
            }),
          });

          if (!response.ok) {
            const bodyText = await response.text();
            throw new Error(
              `Registry registration failed for ${definition.urn} (${response.status}): ${bodyText}`,
            );
          }
          const payload = await response.json();
          if (payload?.verification?.status !== 'verified') {
            throw new Error(`Signature verification failed for ${definition.urn}`);
          }

          const agentRecord = {
            urn: definition.urn,
            endpoint: endpointUrl,
            capabilities: definition.capabilities.map((capability) => capability.capability),
            card,
            verification: payload.verification,
          };
          registeredAgents.push(agentRecord);
          agentEntries.push({
            urn: agentRecord.urn,
            endpoint: agentRecord.endpoint,
            capabilities: agentRecord.capabilities,
            verification: agentRecord.verification,
          });
        }
      } finally {
        teardowns.push(...agentTeardownFns.reverse());
      }

      context.artifacts.registryStore = storePath;
      context.artifacts.registryPolicy = signaturePolicyPath;
      context.multiAgent.registry = {
        url: registryUrl,
        apiKey: registryApiKey,
        keyId: signatureKeyId,
        policyPath: signaturePolicyPath,
        publicKeyPath: context.artifacts.signingPublicKey,
        agents: agentEntries,
      };

      return {
        registryUrl,
        agents: agentEntries,
      };
    });

    const a2aResult = await runStep('a2a', async () => {
      if (!registryUrl) {
        throw new Error('Registry URL missing; registry step did not complete.');
      }
      if (registeredAgents.length === 0) {
        throw new Error('No agents registered for A2A execution.');
      }

      const calls = [];
      for (const agent of registeredAgents) {
        const message = `ping-${agent.urn.split(':').pop() ?? 'agent'}`;
        const urnCall = await callAgent(agent.urn, 'echo', { message }, {
          registryUrl,
          apiKey: registryApiKey,
          logRoot,
          sessionId,
          timeout: 4000,
        });
        if (!urnCall.ok) {
          throw new Error(
            `A2A URN call failed for ${agent.urn}: ${urnCall.error?.message ?? 'unknown error'}`,
          );
        }
        calls.push({
          mode: 'urn',
          target: agent.urn,
          resolvedUrn: agent.urn,
          durationMs: urnCall.trace?.durationMs ?? null,
          correlationId: urnCall.trace?.correlationId ?? null,
          response: urnCall.data,
        });

        const capability = agent.capabilities?.[0];
        if (capability) {
          const capCall = await callAgent(
            capability,
            'echo',
            { message: `${message}-cap` },
            {
              registryUrl,
              apiKey: registryApiKey,
              logRoot,
              sessionId,
              timeout: 4000,
            },
          );
          if (!capCall.ok) {
            throw new Error(
              `A2A capability call failed for ${capability}: ${
                capCall.error?.message ?? 'unknown error'
              }`,
            );
          }
          const resolvedUrn = capCall.trace?.resolution?.urn ?? null;
          if (resolvedUrn && resolvedUrn !== agent.urn) {
            throw new Error(
              `Capability ${capability} resolved to unexpected agent ${resolvedUrn}`,
            );
          }
          calls.push({
            mode: 'capability',
            target: capability,
            resolvedUrn: resolvedUrn ?? agent.urn,
            durationMs: capCall.trace?.durationMs ?? null,
            correlationId: capCall.trace?.correlationId ?? null,
            response: capCall.data,
          });
        }
      }

      return { calls };
    });

    a2aCalls.length = 0;
    a2aCalls.push(...(a2aResult.calls ?? []));
    context.multiAgent.a2a = a2aCalls;

    const reportResult = await runStep('report', async () => {
      const reportPath = path.join(runDir, 'report.json');
      const reportPayload = {
        sessionId,
        seedId,
        generatedAt: new Date().toISOString(),
        registry: {
          url: registryUrl,
          keyId: signatureKeyId,
          apiKey: registryApiKey,
          policy: signaturePolicyPath ? formatRelative(runDir, signaturePolicyPath) : null,
          agents: registeredAgents.map((agent) => ({
            urn: agent.urn,
            endpoint: agent.endpoint,
            capabilities: agent.capabilities,
            verification: agent.verification,
          })),
        },
        a2a: a2aCalls,
        artifacts: {
          catalogGraph: formatRelative(runDir, context.artifacts.catalogGraph),
          drawioDiagram: formatRelative(runDir, context.artifacts.drawioDiagram),
          cytoscapeExport: formatRelative(runDir, context.artifacts.cytoscapeExport),
          docsSummary: formatRelative(runDir, context.artifacts.docsSummary),
        },
        durations: Object.fromEntries(durations),
      };

      await fs.writeJson(reportPath, reportPayload, { spaces: 2 });
      context.artifacts.reportJson = reportPath;
      return { reportPath };
    });
    context.multiAgent.report = { path: reportResult.reportPath };

    await runStep('sign', async () => {
      if (!privateKeyPem || !publicKeyPem || !signatureKeyId) {
        throw new Error('Signing keys are not initialized.');
      }
      const now = new Date().toISOString();
      const signTargets = [
        { label: 'report.json', path: context.artifacts.reportJson },
        { label: 'diagram.drawio', path: context.artifacts.drawioDiagram },
      ].filter((entry) => entry.path);

      const signatures = [];
      for (const target of signTargets) {
        const fileBuffer = await fs.readFile(target.path);
        const digest = createHash('sha256').update(fileBuffer).digest('base64url');
        const payload = {
          artifact: target.label,
          path: formatRelative(runDir, target.path),
          sessionId,
          sha256: digest,
          signedAt: now,
        };
        const envelope = signJws(payload, {
          privateKey: privateKeyPem,
          keyId: signatureKeyId,
        });
        const signaturePath = `${target.path}.sig.json`;
        await fs.writeJson(signaturePath, envelope, { spaces: 2 });

        const verification = verifyJws(envelope, {
          publicKey: publicKeyPem,
          keyId: signatureKeyId,
          expectedPayload: payload,
        });
        if (!verification.valid) {
          throw new Error(`Signature verification failed for ${target.label}`);
        }

        if (target.label === 'report.json') {
          context.artifacts.reportSignature = signaturePath;
        } else if (target.label === 'diagram.drawio') {
          context.artifacts.diagramSignature = signaturePath;
        }

        signatures.push({
          artifact: target.label,
          signaturePath,
          verification: {
            valid: verification.valid,
            keyId: verification.header?.kid ?? signatureKeyId,
            algorithm: verification.header?.alg ?? 'EdDSA',
          },
        });
      }

      context.multiAgent.signatures = signatures;
      return { signatures };
    });

    await runStep('open', async () => {
      if (options.open === false) {
        return { skipped: true };
      }
      const outcome = await launchWithGuardian(diagramResult.outputPath, {
        type: 'file',
        interactive: process.stdout?.isTTY ?? false,
        env: process.env,
      });
      if (!outcome.launched && !outcome.skipped) {
        const message = outcome.error?.message ?? 'Failed to open diagram automatically.';
        throw new Error(message);
      }
      return outcome;
    });
  } catch (error) {
    fatalError = fatalError ?? error;
  } finally {
    while (teardowns.length > 0) {
      const teardown = teardowns.pop();
      try {
        // eslint-disable-next-line no-await-in-loop
        await teardown();
      } catch {
        // Swallow teardown errors to avoid masking primary failure.
      }
    }
    registryServer = null;
  }

  const aggregateMap = new Map();
  for (const [step, category] of Object.entries(STEP_CATEGORIES)) {
    const duration = durations.get(step);
    if (duration === undefined) {
      continue;
    }
    if (!aggregateMap.has(category)) {
      aggregateMap.set(category, { ms: 0, ok: true });
    }
    const bucket = aggregateMap.get(category);
    bucket.ms += duration;
    bucket.ok = bucket.ok && (statuses.get(step) ?? false);
  }

  for (const [category, data] of aggregateMap.entries()) {
    aggregateEvents.push({
      step: category,
      ms: roundMs(data.ms),
      ok: data.ok,
    });
    try {
      await logEvent(category, data.ms, data.ok);
    } catch (error) {
      fatalError = fatalError ?? error;
    }
  }

  context.completedAt = new Date().toISOString();
  context.metrics.logPath = metricsContext.logPath;

  if (metricsContext.logPath) {
    try {
      const entries = await loadLogEntries(metricsContext.logPath);
      context.metrics.summary = summarizeMetrics(entries);
      const budgetsPath = path.resolve(options.budgetsPath ?? DEFAULT_BUDGETS_PATH);
      const budgets = await loadBudgets(budgetsPath);
      context.evaluation = evaluateBudgets(context.metrics.summary, budgets);
    } catch (error) {
      context.evaluation = { pass: false, violations: [], error: error.message };
      fatalError = fatalError ?? error;
    }
  }

  for (const [step, duration] of durations.entries()) {
    context.durations[step] = duration;
  }

  const errors = [];

  if (!context.evaluation) {
    errors.push(new Error('Performance evaluation did not complete.'));
  } else if (!context.evaluation.pass) {
    const violation = context.evaluation.violations?.[0];
    let detail = context.evaluation.error || 'Performance budgets exceeded.';
    if (violation) {
      const { tool, step, metric, actual, limit } = violation;
      if (typeof actual === 'number' && typeof limit === 'number') {
        detail = `${tool}/${step} exceeded ${metric} (${actual.toFixed(2)}ms > ${limit.toFixed(2)}ms)`;
      } else {
        detail = `${tool}/${step} exceeded ${metric}`;
      }
    }
    errors.push(new Error(detail));
  }

  if (fatalError) {
    errors.push(fatalError);
  }

  const coreArtifacts = [
    context.artifacts.draftManifest,
    context.artifacts.approvedManifest,
    context.artifacts.catalogGraph,
    context.artifacts.drawioDiagram,
    context.artifacts.cytoscapeExport,
    context.artifacts.reportJson,
    context.artifacts.reportSignature,
    context.artifacts.diagramSignature,
  ];

  const missingCoreArtifacts = [];
  for (const filePath of coreArtifacts) {
    if (!filePath) continue;
    // eslint-disable-next-line no-await-in-loop
    if (!(await fs.pathExists(filePath))) {
      missingCoreArtifacts.push(filePath);
    }
  }

  if (missingCoreArtifacts.length > 0) {
    errors.push(
      new Error(
        `Missing expected artifact(s): ${missingCoreArtifacts
          .map((filePath) => formatRelative(runDir, filePath))
          .join(', ')}`,
      ),
    );
  }

  context.errors = errors.slice();
  context.error = context.errors[0] ?? null;

  let summaryWritten = false;
  if (context.artifacts.docsSummary) {
    try {
      await writeSummaryDoc(context.artifacts.docsSummary, context);
      summaryWritten = true;
    } catch (error) {
      errors.push(error);
    }
  } else {
    errors.push(new Error('WSAP summary document path is not available.'));
  }

  if (summaryWritten) {
    if (!(await fs.pathExists(context.artifacts.docsSummary))) {
      errors.push(new Error('WSAP summary document was not created.'));
      summaryWritten = false;
    }
  }

  context.errors = errors.slice();
  context.error = context.errors[0] ?? null;

  context.success = context.errors.length === 0 && context.evaluation && context.evaluation.pass && summaryWritten;

  return context;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    let options;
    try {
      options = parseArgs(process.argv.slice(2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    if (options.help) {
      printHelp();
      return;
    }

    try {
      const result = await runWsap(options);
      if (result.success) {
        console.log(`WSAP session ${result.sessionId} completed successfully.`);
        console.log(`Artifacts directory: ${result.runDir}`);
      } else {
        console.error(`WSAP session ${result.sessionId} failed.`);
        if (result.errors?.length) {
          for (const err of result.errors) {
            const message = typeof err === 'string' ? err : err?.message ?? String(err);
            console.error(`  - ${message}`);
          }
        }
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('WSAP execution failed:', error.message);
      process.exitCode = 1;
    }
  })();
}

export default {
  runWsap,
  parseArgs,
};
