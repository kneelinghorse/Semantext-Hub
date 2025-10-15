/**
 * Version normalizer for AsyncAPI 2.x vs 3.x differences
 * Provides consistent interface for version-specific features
 */

/**
 * Normalize server data across AsyncAPI versions
 * @param {Object} document - AsyncAPI document
 * @returns {Array} Normalized server objects
 */
function normalizeServers(document) {
  const servers = document.servers();
  const normalized = [];

  for (const server of servers.all()) {
    normalized.push({
      id: server.id(),
      protocol: server.protocol(),
      protocolVersion: server.protocolVersion(),
      url: server.url(),
      description: server.description(),
      variables: extractServerVariables(server),
      bindings: server.bindings()
    });
  }

  return normalized;
}

/**
 * Extract server variables (handles version differences)
 * @param {Object} server - AsyncAPI server object
 * @returns {Object} Server variables
 */
function extractServerVariables(server) {
  try {
    const variables = server.variables();
    const result = {};

    for (const variable of variables.all()) {
      result[variable.id()] = {
        default: variable.defaultValue(),
        description: variable.description(),
        enum: variable.enum()
      };
    }

    return result;
  } catch (error) {
    return {};
  }
}

/**
 * Normalize channel data across AsyncAPI versions
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Object} Normalized channel data
 */
function normalizeChannel(channel) {
  return {
    id: channel.id(),
    address: channel.address() || channel.id(), // 3.x uses address, 2.x uses id
    description: channel.description(),
    servers: extractChannelServers(channel),
    bindings: channel.bindings(),
    parameters: extractChannelParameters(channel)
  };
}

/**
 * Extract channel servers (3.x feature)
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Array} Server references
 */
function extractChannelServers(channel) {
  try {
    const servers = channel.servers();
    return Array.from(servers.all()).map(s => s.id());
  } catch (error) {
    return [];
  }
}

/**
 * Extract channel parameters
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Object} Channel parameters
 */
function extractChannelParameters(channel) {
  try {
    const parameters = channel.parameters();
    const result = {};

    for (const param of parameters.all()) {
      result[param.id()] = {
        description: param.description(),
        schema: param.schema()
      };
    }

    return result;
  } catch (error) {
    return {};
  }
}

/**
 * Normalize operation data (3.x operations vs 2.x publish/subscribe)
 * @param {Object} channel - AsyncAPI channel object
 * @returns {Array} Normalized operations
 */
function normalizeOperations(channel) {
  const operations = [];

  try {
    const ops = channel.operations();
    for (const operation of ops.all()) {
      operations.push({
        id: operation.id(),
        action: operation.action(), // send/receive (3.x) or publish/subscribe (2.x)
        description: operation.description(),
        messages: extractOperationMessages(operation),
        bindings: operation.bindings()
      });
    }
  } catch (error) {
    // Fallback for version compatibility
  }

  return operations;
}

/**
 * Extract messages from an operation
 * @param {Object} operation - AsyncAPI operation object
 * @returns {Array} Message objects
 */
function extractOperationMessages(operation) {
  try {
    const messages = operation.messages();
    return Array.from(messages.all());
  } catch (error) {
    return [];
  }
}

/**
 * Normalize message data
 * @param {Object} message - AsyncAPI message object
 * @returns {Object} Normalized message data
 */
function normalizeMessage(message) {
  return {
    id: message.id(),
    name: message.name(),
    title: message.title(),
    description: message.description(),
    contentType: message.contentType(),
    payload: message.payload(),
    headers: message.headers(),
    bindings: message.bindings(),
    examples: extractMessageExamples(message)
  };
}

/**
 * Extract message examples
 * @param {Object} message - AsyncAPI message object
 * @returns {Array} Message examples
 */
function extractMessageExamples(message) {
  try {
    const examples = message.examples();
    return Array.from(examples.all()).map(ex => ({
      name: ex.name(),
      summary: ex.summary(),
      payload: ex.payload(),
      headers: ex.headers()
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Detect AsyncAPI version from document
 * @param {Object} document - AsyncAPI document
 * @returns {Object} Version info
 */
function detectVersion(document) {
  const version = document.version();
  const major = parseInt(version.split('.')[0]);

  return {
    full: version,
    major: major,
    is2x: major === 2,
    is3x: major === 3
  };
}

module.exports = {
  normalizeServers,
  normalizeChannel,
  normalizeOperations,
  normalizeMessage,
  extractServerVariables,
  extractChannelParameters,
  detectVersion
};
