import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  // Create a new router instance
  const router = new MCPLLMRouter('openai');

  // Register an MCP server
  router.getServerRegistry().addServer({
    id: 'calculator',
    name: 'Calculator',
    description: 'A server that provides mathematical operations',
    connection: {
      type: 'stdio',
      command: 'node',
      args: ['calculator-server.js']
    },
    tools: [
      {
        name: 'add',
        description: 'Add two numbers'
      },
      {
        name: 'subtract',
        description: 'Subtract two numbers'
      },
      {
        name: 'multiply',
        description: 'Multiply two numbers'
      },
      {
        name: 'divide',
        description: 'Divide two numbers'
      }
    ]
  });

  // Process a user query
  const userQuery = 'What is 5 plus 3?';
  console.log(`User query: ${userQuery}`);
  
  const response = await router.processQuery(userQuery);
  console.log(`Response: ${response}`);
}

main().catch(error => {
  console.error('Error in example:', error);
});
