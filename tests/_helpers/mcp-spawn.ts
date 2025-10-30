import path from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient, MCPClient } from '../../packages/runtime/runtime/mcp-client.js';
import { startA2AStub } from './a2a-stub';

type SpawnResult = {
  client: MCPClient;
  stop: () => Promise<void>;
};

// Spawns the MCP server via stdio, with an ephemeral local A2A stub.
// Returns an open MCP client and a stop() method to teardown both.
export async function spawnMCPWithA2AStub(opts: { protocolRoot?: string, enableLogging?: boolean, env?: Record<string, string> } = {}): Promise<SpawnResult> {
  const stub = await startA2AStub();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = opts.protocolRoot || path.resolve(__dirname, '../../');
  const registryApiKey = 'mcp-e2e-test-key';
  const envOverrides = opts.env || {};

  const client = createMCPClient({
    endpoint: {
      command: 'node',
      args: [path.join(appRoot, 'packages/runtime/bin/protocol-mcp-server.js')],
      env: {
        PROTOCOL_ROOT: appRoot,
        A2A_BASE_URL: stub.url,
        A2A_ENABLE_LOGGING: 'false',
        OSSP_REGISTRY_API_KEY: registryApiKey,
        ...envOverrides
      }
    },
    timeout: 5000,
    enableLogging: opts.enableLogging === true
  });

  await client.open();

  return {
    client,
    stop: async () => {
      await client.close();
      await stub.close();
    }
  };
}
