import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

async function main() {
  // Create a new router instance with memory
  const router = new MCPLLMRouter('openai', 'buffer', { maxMessages: 10 });

  // Register an MCP server
  router.getServerRegistry().addServer({
    id: 'calculator',
    name: 'Calculator',
    description: 'A server that provides mathematical operations',
    connection: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/calculator-server.js']
    },
    tools: [
      {
        name: 'add',
        description: 'Add two numbers',
        paramSchema: z.object({
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        })
      },
      {
        name: 'subtract',
        description: 'Subtract two numbers',
        paramSchema: z.object({
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        })
      },
      {
        name: 'multiply',
        description: 'Multiply two numbers',
        paramSchema: z.object({
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        })
      },
      {
        name: 'divide',
        description: 'Divide two numbers',
        paramSchema: z.object({
          a: z.number().describe('First number'),
          b: z.number().describe('Second number')
        })
      }
    ]
  });

  // Process a user query
  const userQuery = 'What is 5 plus 3?';
  console.log(`User query: ${userQuery}`);
  
  try {
    // Log the routing information before executing the tool
    const routingInfo = await router.queryRouter.routeQuery(userQuery);
    console.log('Routing information:', JSON.stringify(routingInfo, null, 2));
    
    const response = await router.processQuery(userQuery);
    console.log(`Response: ${response}`);
    
    // Try a follow-up query that should use conversation history
    const followUpQuery = 'What calculation did I just ask you to perform?';
    console.log(`\nFollow-up query: ${followUpQuery}`);
    
    const followUpResponse = await router.processQuery(followUpQuery);
    console.log(`Response: ${followUpResponse}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(error => {
  console.error('Error in example:', error);
});
