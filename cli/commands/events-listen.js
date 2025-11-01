import chalk from 'chalk';
import ora from 'ora';

import { RedisEventConsumer } from '../../packages/runtime/events/event-consumer.js';
import { buildStreamName } from '../../packages/runtime/events/stream-utils.js';

const defaultGroup = 'cli-listener';

function resolveOption(value, fallback) {
  return value !== undefined && value !== null && value !== '' ? value : fallback;
}

function formatEvent(message, jsonOutput = false) {
  if (jsonOutput) {
    return JSON.stringify({
      id: message.id,
      stream: message.stream,
      metadata: message.metadata,
      payload: message.payload
    });
  }

  const metadata = message.metadata || {};
  const payload = message.payload || {};
  const parts = [
    chalk.gray(metadata.timestamp || new Date().toISOString()),
    chalk.cyan(metadata.eventType || 'event'),
    chalk.white(payload.urn || payload.toolId || message.stream)
  ];

  if (payload.actor?.id) {
    parts.push(chalk.magenta(`actor=${payload.actor.id}`));
  }

  if (Array.isArray(payload.capabilities) && payload.capabilities.length > 0) {
    parts.push(chalk.yellow(`capabilities=${payload.capabilities.join(',')}`));
  }

  return parts.join(' ');
}

export async function eventsListenCommand(options = {}) {
  const redisUrl = resolveOption(options.redisUrl, process.env.SEMANTEXT_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379/0');
  const env = (resolveOption(options.env, process.env.SEMANTEXT_ENV || process.env.NODE_ENV || 'development')).toLowerCase();
  const domain = resolveOption(options.domain, 'semantext');
  const object = resolveOption(options.object, 'tool');
  const event = resolveOption(options.event, 'activated');
  const objectId = resolveOption(options.objectId, 'global');
  const group = resolveOption(options.group, defaultGroup);
  const consumerName = resolveOption(options.consumer, `${group}-${process.pid}`);
  const count = Number.isInteger(options.count) && options.count > 0 ? options.count : 10;
  const blockMs = Number.isInteger(options.block) && options.block >= 0 ? options.block : 5000;
  const acknowledge = options.ack !== false;
  const jsonOutput = Boolean(options.json);

  const streamSegments = { env, domain, object, event, objectId };
  const streamName = buildStreamName(streamSegments);

  const spinner = ora(`Connecting to Redis at ${redisUrl}`).start();

  const consumer = new RedisEventConsumer({
    redisUrl,
    streamDefaults: streamSegments,
    logger: console
  });

  try {
    await consumer.ensureGroup({
      streamSegments,
      group,
      mkStream: true
    });
    spinner.succeed(`Listening on ${chalk.green(streamName)} as ${chalk.blue(group)}/${chalk.blue(consumerName)}`);
  } catch (error) {
    spinner.fail(`Failed to prepare consumer group: ${error.message}`);
    await consumer.close();
    process.exitCode = 1;
    return;
  }

  let running = true;
  const handleSignal = (signal) => {
    console.log(chalk.gray(`\nReceived ${signal}, closing listener...`));
    running = false;
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    while (running) {
      // eslint-disable-next-line no-await-in-loop
      const messages = await consumer.read({
        streamSegments,
        group,
        consumer: consumerName,
        count,
        blockMs
      });

      if (!messages || messages.length === 0) {
        continue;
      }

      for (const message of messages) {
        console.log(formatEvent(message, jsonOutput));
        if (acknowledge) {
          // eslint-disable-next-line no-await-in-loop
          await consumer.acknowledge({
            streamSegments,
            group,
            id: message.id
          });
        }
      }

      if (options.oneshot) {
        running = false;
      }
    }
  } catch (error) {
    console.error(chalk.red(`Event listener failure: ${error.message}`));
    process.exitCode = 1;
  } finally {
    await consumer.close();
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}
