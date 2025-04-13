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
      // First, determine if this is a question that needs a tool
      // Get conversation history to provide context for the decision
      const conversationHistory = router.getMemory().getMessages();
      let historyText = '';
      
      if (conversationHistory.length > 0) {
        historyText = 'Conversation history:\n';
        conversationHistory.forEach(msg => {
          historyText += `${msg.role}: ${msg.content}\n`;
        });
        historyText += '\n';
      }
      
      const needsToolPrompt = `
${historyText}
User input: "${userInput}"

Determine if this query requires using a specific tool or if it's a general knowledge question or a question about the conversation history that can be answered directly.

RULES:
1. If the query requires mathematical calculations (like addition, subtraction, etc.), respond with "NEEDS_TOOL".
2. If the query is about general knowledge (like "What is the capital of France?"), respond with "DIRECT_ANSWER".
3. If the query is about the conversation history or personal information shared during the conversation (like "What is my name?"), respond with "DIRECT_ANSWER".
4. If the query is a follow-up to previous messages, respond with "DIRECT_ANSWER".
5. If the query is a greeting or casual conversation, respond with "DIRECT_ANSWER".

Examples:
- "What is 5 plus 3?" -> "NEEDS_TOOL" (requires calculation)
- "What is the capital of France?" -> "DIRECT_ANSWER" (general knowledge)
- "What's my name?" -> "DIRECT_ANSWER" (personal information from conversation)
- "What did I just ask about?" -> "DIRECT_ANSWER" (refers to conversation history)

Respond with ONLY "NEEDS_TOOL" or "DIRECT_ANSWER".
`;

      const needsToolResponse = await router.getLLMProvider().generateResponse(needsToolPrompt);
      console.log(`Tool decision: ${needsToolResponse.trim()}`);
      
      if (needsToolResponse.trim().includes("DIRECT_ANSWER")) {
        console.log('Using direct answer (no tool needed)');
        // For direct questions, create a special routing that doesn't use any tool
        return {
          serverId: "direct_answer",
          toolName: "answer",
          parameters: { query: userInput }
        };
      } else {
        console.log('Using tool-based answer');
        // For tool-based questions, use the original routing logic
        return await originalRouteQuery(userInput);
      }
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
      // For direct answers, include the conversation history
      const conversationHistory = router.getMemory().getMessages();
      let historyText = '';
      
      if (conversationHistory.length > 0) {
        historyText = 'Conversation history:\n';
        conversationHistory.forEach(msg => {
          historyText += `${msg.role}: ${msg.content}\n`;
        });
        historyText += '\n';
      }
      
      const directPrompt = `
${historyText}
Please answer the following question directly and concisely:
${parameters.query}

If the question refers to information shared in the conversation history (like the user's name, preferences, or previous topics), 
use that information in your response.

If the user is asking about personal information they shared earlier (like their name), 
acknowledge and use that information respectfully.
`;
      const directAnswer = await router.getLLMProvider().generateResponse(directPrompt);
      return {
        content: [{ type: "text", text: directAnswer }]
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
