import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

async function main() {
  console.log('Starting MCP-LLM-Router Chat Interface...');
  console.log('Type "exit" or "quit" to end the session.');
  console.log('---------------------------------------------');

  // Create a new router instance with memory and register default servers
  const router = new MCPLLMRouter('openai', 'buffer', { maxMessages: 10 });
  router.registerDefaultServers();

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
