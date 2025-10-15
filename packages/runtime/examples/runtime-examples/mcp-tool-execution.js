#!/usr/bin/env node

/**
 * MCP Tool Execution Example
 * 
 * This example demonstrates MCP (Model Context Protocol) tool execution including:
 * - Connecting to MCP server
 * - Listing available tools
 * - Executing tools with different parameters
 * - Error handling and timeout management
 * - Connection lifecycle management
 */

import { createMCPClient } from '../../runtime/mcp-client.js';

async function mcpToolExecutionExample() {
  console.log('=== MCP Tool Execution Example ===\n');
  
  // Initialize MCP client
  console.log('1. Initializing MCP client...');
  const mcpClient = createMCPClient({
    endpoint: 'npx @modelcontextprotocol/server-filesystem',
    enableLogging: true,
    timeout: 15000,
    maxRetries: 3,
    circuitBreakerThreshold: 3,
    circuitBreakerSuccessThreshold: 2,
    circuitBreakerTimeout: 30000
  });
  console.log('✓ MCP client initialized\n');
  
  // Connect to MCP server
  console.log('2. Connecting to MCP server...');
  try {
    await mcpClient.open();
    console.log('✓ Connected to MCP server');
    
    // Get connection state
    const state = mcpClient.getState();
    console.log('✓ Connection state:');
    console.log(`  Connected: ${state.connected}`);
    console.log(`  Initialized: ${state.initialized}`);
    console.log(`  Server name: ${state.serverName}`);
    console.log(`  Server version: ${state.serverVersion}`);
    console.log(`  Capabilities: ${JSON.stringify(state.capabilities, null, 2)}`);
  } catch (error) {
    console.log('⚠ MCP connection failed (expected in demo):', error.message);
    console.log('  This is expected if the MCP server is not available');
    console.log('  The example will continue with mock operations\n');
    
    // Continue with mock operations
    await mockMCPOperations();
    return;
  }
  console.log('');
  
  // List available tools
  console.log('3. Listing available tools...');
  try {
    const tools = await mcpClient.listTools();
    console.log(`✓ Found ${tools.length} tools:`);
    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}`);
      console.log(`     Description: ${tool.description}`);
      console.log(`     Input schema: ${JSON.stringify(tool.inputSchema, null, 6)}`);
    });
  } catch (error) {
    console.log('⚠ Failed to list tools:', error.message);
  }
  console.log('');
  
  // Get tool schema
  console.log('4. Getting tool schema...');
  try {
    const schema = await mcpClient.getToolSchema('read_file');
    console.log('✓ Tool schema for read_file:');
    console.log(`  Name: ${schema.name}`);
    console.log(`  Description: ${schema.description}`);
    console.log(`  Input schema: ${JSON.stringify(schema.inputSchema, null, 2)}`);
  } catch (error) {
    console.log('⚠ Failed to get tool schema:', error.message);
  }
  console.log('');
  
  // Execute tools
  console.log('5. Executing tools...');
  
  // Execute read_file tool
  try {
    const readResult = await mcpClient.executeTool('read_file', {
      path: '/path/to/file.txt'
    }, {
      timeout: 5000
    });
    
    console.log('✓ read_file tool execution successful:');
    console.log(`  Success: ${readResult.success}`);
    console.log(`  Content: ${JSON.stringify(readResult.content, null, 2)}`);
    console.log(`  Metadata: ${JSON.stringify(readResult.metadata, null, 2)}`);
  } catch (error) {
    console.log('⚠ read_file tool execution failed:', error.message);
  }
  
  // Execute list_directory tool
  try {
    const listResult = await mcpClient.executeTool('list_directory', {
      path: '/path/to/directory'
    });
    
    console.log('✓ list_directory tool execution successful:');
    console.log(`  Success: ${listResult.success}`);
    console.log(`  Content: ${JSON.stringify(listResult.content, null, 2)}`);
  } catch (error) {
    console.log('⚠ list_directory tool execution failed:', error.message);
  }
  
  // Execute write_file tool
  try {
    const writeResult = await mcpClient.executeTool('write_file', {
      path: '/path/to/output.txt',
      content: 'Hello, MCP!'
    });
    
    console.log('✓ write_file tool execution successful:');
    console.log(`  Success: ${writeResult.success}`);
    console.log(`  Content: ${JSON.stringify(writeResult.content, null, 2)}`);
  } catch (error) {
    console.log('⚠ write_file tool execution failed:', error.message);
  }
  console.log('');
  
  // Tool execution with timeout
  console.log('6. Tool execution with timeout...');
  try {
    const timeoutResult = await mcpClient.executeTool('slow_operation', {
      duration: 10000
    }, {
      timeout: 5000
    });
    
    console.log('✓ Tool execution completed within timeout');
  } catch (error) {
    console.log('⚠ Tool execution timed out (expected):', error.message);
  }
  console.log('');
  
  // Tool execution with cancellation
  console.log('7. Tool execution with cancellation...');
  try {
    const controller = new AbortController();
    
    // Cancel after 2 seconds
    setTimeout(() => {
      controller.abort();
      console.log('  Cancellation signal sent');
    }, 2000);
    
    const cancelResult = await mcpClient.executeTool('long_operation', {
      duration: 10000
    }, {
      signal: controller.signal
    });
    
    console.log('✓ Tool execution completed before cancellation');
  } catch (error) {
    console.log('⚠ Tool execution was cancelled (expected):', error.message);
  }
  console.log('');
  
  // Error handling demonstration
  console.log('8. Error handling demonstration...');
  try {
    // This will fail and demonstrate error handling
    await mcpClient.executeTool('nonexistent_tool', {
      invalid: 'parameter'
    });
  } catch (error) {
    console.log('✓ Error handling demonstration:');
    console.log(`  Error type: ${error.constructor.name}`);
    console.log(`  Error message: ${error.message}`);
    if (error.toolName) {
      console.log(`  Tool name: ${error.toolName}`);
    }
    if (error.timeout) {
      console.log(`  Timeout: ${error.timeout}ms`);
    }
  }
  console.log('');
  
  // Connection state monitoring
  console.log('9. Connection state monitoring...');
  const finalState = mcpClient.getState();
  console.log('✓ Final connection state:');
  console.log(`  Connected: ${finalState.connected}`);
  console.log(`  Initialized: ${finalState.initialized}`);
  console.log(`  Last heartbeat: ${finalState.lastHeartbeat}`);
  console.log(`  Reconnect attempts: ${finalState.reconnectAttempts}`);
  console.log('');
  
  // Close connection
  console.log('10. Closing MCP connection...');
  try {
    await mcpClient.close();
    console.log('✓ MCP connection closed');
  } catch (error) {
    console.log('⚠ Error closing connection:', error.message);
  }
  console.log('');
  
  console.log('=== Example completed successfully ===');
}

// Mock MCP operations for when server is not available
async function mockMCPOperations() {
  console.log('3. Mock MCP operations (server not available)...');
  
  // Mock tool listing
  const mockTools = [
    {
      name: 'read_file',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' }
        },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Write contents to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'list_directory',
      description: 'List contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the directory' }
        },
        required: ['path']
      }
    }
  ];
  
  console.log(`✓ Mock tools available (${mockTools.length}):`);
  mockTools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.name}`);
    console.log(`     Description: ${tool.description}`);
  });
  console.log('');
  
  // Mock tool execution
  console.log('4. Mock tool execution...');
  const mockResults = [
    { tool: 'read_file', success: true, content: ['Hello, World!'] },
    { tool: 'write_file', success: true, content: ['File written successfully'] },
    { tool: 'list_directory', success: true, content: ['file1.txt', 'file2.txt', 'subdir/'] }
  ];
  
  mockResults.forEach(result => {
    console.log(`✓ Mock ${result.tool} execution:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Content: ${JSON.stringify(result.content)}`);
  });
  console.log('');
  
  console.log('=== Mock example completed successfully ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  mcpToolExecutionExample().catch(error => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export { mcpToolExecutionExample };
