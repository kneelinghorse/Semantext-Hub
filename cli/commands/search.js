#!/usr/bin/env node

import path from 'node:path';

import chalk from 'chalk';
import Table from 'cli-table3';

import { createConsole } from '../../src/cli/ux/console.js';
import { ToolHubSearchService } from '../../packages/runtime/services/tool-hub/search-service.js';
import { ToolHubActivationService } from '../../packages/runtime/services/tool-hub/activation-service.js';

const MAX_LIMIT = 25;

function resolveLimitOption(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: undefined, warning: null };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return {
      value: undefined,
      warning: `Ignoring invalid --limit value "${raw}".`
    };
  }

  if (parsed <= 0) {
    return {
      value: undefined,
      warning: `Ignoring non-positive --limit value "${raw}".`
    };
  }

  const clamped = Math.min(Math.floor(parsed), MAX_LIMIT);

  if (clamped !== Math.floor(parsed)) {
    return {
      value: clamped,
      warning: `Clamped --limit to ${clamped} (maximum ${MAX_LIMIT}).`
    };
  }

  return {
    value: clamped,
    warning: null
  };
}

function toDisplayScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return '—';
  }
  if (score >= 1) {
    return score.toFixed(2);
  }
  return score.toFixed(3);
}

function normaliseText(value) {
  if (value == null) {
    return '—';
  }
  const text = typeof value === 'string' ? value.trim() : String(value).trim();
  return text.length > 0 ? text : '—';
}

function formatCapabilities(capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return '—';
  }
  return capabilities.join(', ');
}

function buildResultTable(results) {
  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Score'),
      chalk.cyan('Tool'),
      chalk.cyan('Summary'),
      chalk.cyan('Capabilities'),
      chalk.cyan('Schema')
    ],
    wordWrap: true,
    colWidths: [4, 8, 30, 44, 28, 30]
  });

  results.forEach((result, index) => {
    const rank = result?.rank ?? index + 1;
    const score = toDisplayScore(result?.score);
    const name = result?.name ? result.name : null;
    const toolId = result?.tool_id ?? null;
    const urn = result?.urn && result.urn !== toolId ? result.urn : null;
    const summary = normaliseText(result?.summary);
    const schema = normaliseText(result?.schema_uri ?? result?.schemaUri);
    const capabilities = formatCapabilities(result?.capabilities);

    const toolLines = [];
    if (name) {
      toolLines.push(name);
    }
    if (toolId || urn) {
      const identifiers = [];
      if (toolId) {
        identifiers.push(toolId);
      }
      if (urn) {
        identifiers.push(urn);
      }
      toolLines.push(chalk.gray(identifiers.join(' | ')));
    }
    if (toolLines.length === 0 && summary !== '—') {
      toolLines.push(summary);
    } else if (toolLines.length === 0) {
      toolLines.push('—');
    }

    table.push([
      String(rank),
      score,
      toolLines.join('\n'),
      summary,
      capabilities,
      schema
    ]);
  });

  return table.toString();
}

function formatMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  if (numeric >= 100) {
    return `${numeric.toFixed(0)} ms`;
  }
  return `${numeric.toFixed(1)} ms`;
}

function humaniseTimingKey(key) {
  return key
    .replace(/Ms$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimings(timings) {
  if (!timings || typeof timings !== 'object') {
    return [];
  }

  const segments = [];
  for (const [key, value] of Object.entries(timings)) {
    const formatted = formatMs(value);
    if (!formatted) {
      continue;
    }
    segments.push(`${humaniseTimingKey(key)}: ${formatted}`);
  }

  return segments;
}

function summariseActivation(activation) {
  if (!activation || typeof activation !== 'object') {
    return [];
  }

  const lines = [];
  const metadata = activation.metadata && typeof activation.metadata === 'object'
    ? activation.metadata
    : {};

  if (metadata.name) {
    lines.push(`Name: ${metadata.name}`);
  }
  if (activation.urn) {
    lines.push(`URN: ${activation.urn}`);
  }
  if (Array.isArray(activation.capabilities) && activation.capabilities.length > 0) {
    lines.push(`Capabilities: ${activation.capabilities.join(', ')}`);
  }
  if (metadata.entrypoint) {
    lines.push(`Entrypoint: ${metadata.entrypoint}`);
  }
  if (metadata.instructions) {
    lines.push(`Instructions: ${metadata.instructions}`);
  }

  return lines;
}

export async function searchCommand(query, options = {}) {
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  if (!trimmedQuery) {
    throw new Error('Search query is required.');
  }

  const consoleUi = options.console ?? createConsole();
  const workspace = options.workspace ? path.resolve(options.workspace) : process.cwd();
  const outputJson = Boolean(options.json);
  const activateTopResult = Boolean(options.activate);

  const { value: limit, warning: limitWarning } = resolveLimitOption(options.limit);
  if (limitWarning) {
    consoleUi.warn(limitWarning);
  }

  const spinner = outputJson ? null : consoleUi.spinner('Searching semantic tool registry…');
  let searchSpinnerCompleted = false;
  if (spinner) {
    spinner.start();
  }

  let searchService;
  let activationService;
  try {
    searchService =
      typeof options.searchServiceFactory === 'function'
        ? await options.searchServiceFactory({ workspace })
        : new ToolHubSearchService({
            workspace,
            dbPath: path.join(workspace, 'var', 'registry.sqlite'),
            lancedbPath: path.join(workspace, 'data', 'lancedb'),
            logger: console
          });

    const searchResponse = await searchService.search({
      query: trimmedQuery,
      ...(limit ? { limit } : {})
    });

    if (spinner) {
      spinner.succeed('Search completed.');
      searchSpinnerCompleted = true;
    }

    if (!searchResponse || searchResponse.ok === false || searchResponse.success === false) {
      const message =
        searchResponse?.error ||
        'tool_hub.search returned an unsuccessful response.';
      throw new Error(message);
    }

    const results = Array.isArray(searchResponse.results)
      ? searchResponse.results
      : [];

    const payload = {
      success: true,
      workspace,
      query: searchResponse.query ?? trimmedQuery,
      limit: searchResponse.limit ?? limit ?? null,
      returned: searchResponse.returned ?? results.length,
      totalCandidates: searchResponse.total_candidates ?? searchResponse.totalCandidates ?? results.length,
      results,
      timings: searchResponse.timings ?? {}
    };

    if (activateTopResult) {
      if (results.length === 0) {
        if (!outputJson) {
          consoleUi.warn('Activation skipped: no search results to activate.', [
            `Query: ${payload.query}`
          ]);
        }
      } else {
        const activationSpinner = outputJson ? null : consoleUi.spinner('Activating top result…');
        if (activationSpinner) {
          activationSpinner.start();
        }

        try {
          activationService =
            typeof options.activationServiceFactory === 'function'
              ? await options.activationServiceFactory({ workspace })
              : new ToolHubActivationService({
                  logger: console,
                  dbPath: path.join(workspace, 'var', 'registry.sqlite')
                });

          const top = results[0];
          const toolIdentifier = top?.urn ?? top?.tool_id;
          if (!toolIdentifier) {
            throw new Error('Unable to determine tool identifier for activation.');
          }

          const activation = await activationService.activate({
            tool_id: toolIdentifier,
            include_manifest: false,
            include_provenance: false
          });

          payload.activation = {
            urn: activation?.urn ?? toolIdentifier,
            tool_id: activation?.tool_id ?? toolIdentifier,
            metadata: activation?.metadata ?? null,
            capabilities: Array.isArray(activation?.capabilities)
              ? activation.capabilities
              : [],
            activation_hints: activation?.activation_hints ?? null,
            resources: activation?.resources ?? null
          };

          if (activationSpinner) {
            activationSpinner.succeed('Activation ready.');
          }
        } catch (activationError) {
          if (activationSpinner) {
            activationSpinner.fail('Activation failed.');
          }
          throw activationError;
        }
      }
    }

    if (outputJson) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (results.length === 0) {
      consoleUi.warn('No matching tools found.', [
        `Query: ${payload.query}`,
        `Workspace: ${workspace}`
      ]);
    } else {
      consoleUi.success(
        `Found ${results.length} tool${results.length === 1 ? '' : 's'}.`,
        [
          `Query: ${payload.query}`,
          `Workspace: ${workspace}`
        ]
      );
      console.log();
      console.log(buildResultTable(results));

      const timingSegments = formatTimings(payload.timings);
      if (timingSegments.length > 0) {
        consoleUi.info(`Timings → ${timingSegments.join(' | ')}`);
      }

      if (payload.activation) {
        const activationLines = summariseActivation(payload.activation);
        consoleUi.success('Activation metadata ready.', activationLines);
      }
    }

    return payload;
  } catch (error) {
    if (spinner && !searchSpinnerCompleted) {
      spinner.fail('Search failed.');
    }

    const message = error?.message ?? String(error);
    const details = [`Query: ${trimmedQuery}`, `Workspace: ${workspace}`];
    if (message) {
      details.unshift(message);
    }
    consoleUi.error('Search failed.', details);
    process.exitCode = 1;
    return null;
  } finally {
    try {
      if (activationService?.shutdown) {
        await activationService.shutdown();
      }
    } catch {
      // Ignore shutdown failures in CLI.
    }

    try {
      if (searchService?.shutdown) {
        await searchService.shutdown();
      }
    } catch {
      // Ignore shutdown failures in CLI.
    }
  }
}

export default {
  searchCommand
};
