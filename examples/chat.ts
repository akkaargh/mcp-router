import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import readline from 'readline';
import { z } from 'zod';

// Load environment variables
dotenv.config();

async function main() {
  console.log('Starting MCP-LLM-Router Chat Interface...');
  console.log('Type "exit" or "quit" to end the session.');
  console.log('---------------------------------------------');

  // Create a new router instance with memory
  const router = new MCPLLMRouter('openai', 'buffer', { maxMessages: 10 });

  // Register the calculator MCP server
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

  // Modify the query router to handle direct questions
  const originalRouteQuery = router.queryRouter.routeQuery.bind(router.queryRouter);
  router.queryRouter.routeQuery = async (userInput: string) => {
    try {
      // Use the improved QueryRouter directly - it now handles both direct answers and tool-based answers
      return await originalRouteQuery(userInput);
    } catch (error) {
      console.error('Error in routing query:', error);
      throw error;
    }
  };

  // Register a special "direct_answer" server for handling general knowledge questions
  router.getServerRegistry().addServer({
    id: 'direct_answer',
    name: 'Direct Answer',
    description: 'A server that provides direct answers to general knowledge questions',
    connection: {
      type: 'stdio',
      command: 'node',
      args: []
    },
    tools: [
      {
        name: 'answer',
        description: 'Answer a general knowledge question',
        paramSchema: z.object({
          query: z.string().describe('The question to answer')
        })
      }
    ]
  });

  // Add a custom handler for the direct_answer server in the toolExecutor
  const originalExecute = router.toolExecutor.execute.bind(router.toolExecutor);
  router.toolExecutor.execute = async (serverId: string, toolName: string, parameters: Record<string, any>) => {
    if (serverId === "direct_answer" && toolName === "answer") {
      // For direct answers, just return the query as the response
      // This preserves the context-aware response from the router
      return {
        content: [{ type: "text", text: parameters.query }]
      };
    } else {
      // For tool-based questions, use the original execution logic
      return await originalExecute(serverId, toolName, parameters);
    }
  };

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Start the chat loop
  const askQuestion = () => {
    rl.question('> ', async (userInput) => {
      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log('Goodbye!');
        rl.close();
        process.exit(0);
        return;
      }

      try {
        console.log('Processing...');
        const response = await router.processQuery(userInput);
        console.log(response);
      } catch (error) {
        console.error('Error:', error);
        console.log('Sorry, I encountered an error processing your request.');
      }

      // Continue the loop
      askQuestion();
    });
  };

  // Start the conversation
  askQuestion();
}

main().catch(error => {
  console.error('Error in chat interface:', error);
});
