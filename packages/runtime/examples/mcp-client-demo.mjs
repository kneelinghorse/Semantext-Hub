#!/usr/bin/env node

/**
 * MCP Client Demo
 * 
 * Demonstrates MCP client usage for tool discovery and execution.
 * This example shows how to connect to an MCP server, list tools,
 * fetch schemas, and execute tools with proper error handling.
 */

import { createMCPClient, withMCPClient } from '../runtime/mcp-client.js';
import {
  MCPConnectionError,
  MCPTimeoutError,
  MCPToolError
} from '../runtime/mcp-types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Demo 1: Basic MCP client usage
 */
async function basicDemo() {
  console.log('\n=== Basic MCP Client Demo ===');
  
  const client = createMCPClient({
    endpoint: {
      command: 'node',
      args: [path.join(__dirname, '../bin/protocol-mcp-server.js')],
      env: {
        PROTOCOL_ROOT: path.join(__dirname, '..')
      }
    },
    timeout: 10000,
    enableLogging: true
  });

  try {
    console.log('Opening MCP connection...');
    await client.open();
    
    console.log('Connection established!');
    console.log('Server:', client.getState().serverName);
    console.log('Version:', client.getState().serverVersion);
    
    console.log('\nListing available tools...');
    const tools = await client.listTools();
    console.log(`Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    
    if (tools.length > 0) {
      const firstTool = tools[0];
      console.log(`\nGetting schema for ${firstTool.name}...`);
      const schema = await client.getToolSchema(firstTool.name);
      console.log('Schema:', JSON.stringify(schema.inputSchema, null, 2));
    }
    
  } catch (error) {
    console.error('Demo failed:', error.message);
    if (error instanceof MCPConnectionError) {
      console.error('Connection error details:', error.endpoint);
    }
  } finally {
    console.log('\nClosing connection...');
    await client.close();
    console.log('Connection closed.');
  }
}

/**
 * Demo 2: Tool execution with different scenarios
 */
async function toolExecutionDemo() {
  console.log('\n=== Tool Execution Demo ===');
  
  await withMCPClient({
    command: 'node',
    args: [path.join(__dirname, '../bin/protocol-mcp-server.js')],
    env: {
      PROTOCOL_ROOT: path.join(__dirname, '..')
    }
  }, async (client) => {
    console.log('Connected to MCP server');
    
    // List tools first
    const tools = await client.listTools();
    console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
    
    // Try to execute a tool that exists
    if (tools.some(t => t.name === 'protocol_list_test_files')) {
      console.log('\nExecuting protocol_list_test_files...');
      try {
        const result = await client.executeTool('protocol_list_test_files', {});
        console.log('Success! Result:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Tool execution failed:', error.message);
      }
    }
    
    // Try to execute a tool that doesn't exist
    console.log('\nTrying to execute non-existent tool...');
    try {
      await client.executeTool('non_existent_tool', {});
    } catch (error) {
      if (error instanceof MCPToolError) {
        console.log('Expected error caught:', error.message);
        console.log('Tool name:', error.toolName);
      } else {
        console.error('Unexpected error:', error.message);
      }
    }
    
    // Try to execute with timeout
    console.log('\nTesting timeout...');
    try {
      await client.executeTool('protocol_list_test_files', {}, {
        timeout: 1 // 1ms timeout to force timeout
      });
    } catch (error) {
      if (error instanceof MCPTimeoutError) {
        console.log('Timeout caught as expected:', error.message);
        console.log('Timeout duration:', error.timeout);
      } else {
        console.error('Unexpected error:', error.message);
      }
    }
  });
}

/**
 * Demo 3: Error handling scenarios
 */
async function errorHandlingDemo() {
  console.log('\n=== Error Handling Demo ===');
  
  // Test connection to non-existent server
  console.log('Testing connection to non-existent server...');
  const badClient = createMCPClient({
    endpoint: {
      command: 'nonexistent-command',
      args: []
    },
    timeout: 1000
  });
  
  try {
    await badClient.open();
  } catch (error) {
    if (error instanceof MCPConnectionError) {
      console.log('Connection error caught:', error.message);
    } else {
      console.error('Unexpected error:', error.message);
    }
  }
  
  // Test operations without connection
  console.log('\nTesting operations without connection...');
  const client = createMCPClient({
    endpoint: 'node'
  });
  
  try {
    await client.listTools();
  } catch (error) {
    if (error instanceof MCPConnectionError) {
      console.log('Expected error:', error.message);
    } else {
      console.error('Unexpected error:', error.message);
    }
  }
}

/**
 * Demo 4: Performance and monitoring
 */
async function performanceDemo() {
  console.log('\n=== Performance Demo ===');
  
  const client = createMCPClient({
    endpoint: {
      command: 'node',
      args: [path.join(__dirname, '../bin/protocol-mcp-server.js')],
      env: {
        PROTOCOL_ROOT: path.join(__dirname, '..')
      }
    },
    enableLogging: true
  });
  
  try {
    console.log('Opening connection...');
    const startTime = Date.now();
    await client.open();
    const connectTime = Date.now() - startTime;
    console.log(`Connection established in ${connectTime}ms`);
    
    console.log('\nMeasuring tool execution time...');
    const tools = await client.listTools();
    
    if (tools.length > 0) {
      const toolName = tools[0].name;
      const execStartTime = Date.now();
      
      try {
        await client.executeTool(toolName, {});
        const execTime = Date.now() - execStartTime;
        console.log(`Tool ${toolName} executed in ${execTime}ms`);
      } catch (error) {
        console.log(`Tool ${toolName} failed:`, error.message);
      }
    }
    
    console.log('\nConnection state:', client.getState());
    
  } finally {
    await client.close();
  }
}

/**
 * Main demo runner
 */
async function runDemos() {
  console.log('MCP Client Demo');
  console.log('===============');
  console.log('This demo shows various MCP client capabilities:');
  console.log('- Connection lifecycle management');
  console.log('- Tool discovery and schema fetching');
  console.log('- Tool execution with error handling');
  console.log('- Timeout and cancellation support');
  console.log('- Performance monitoring');
  
  try {
    await basicDemo();
    await toolExecutionDemo();
    await errorHandlingDemo();
    await performanceDemo();
    
    console.log('\n=== Demo Complete ===');
    console.log('All demos completed successfully!');
    
  } catch (error) {
    console.error('\nDemo failed:', error);
    process.exit(1);
  }
}

// Run demos if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemos().catch(error => {
    console.error('Demo runner failed:', error);
    process.exit(1);
  });
}

export { runDemos };
