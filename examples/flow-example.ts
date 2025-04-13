import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import readline from 'readline';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

async function main() {
  console.log('Starting Flow Example...');
  
  // Create a new router instance with memory
  const router = new MCPLLMRouter('anthropic', 'buffer', { maxMessages: 10 });
  
  // Register default servers and flows
  router.registerDefaultServers();
  router.registerDefaultFlows();

  console.log('Registered flows:');
  router.getFlowRegistry().getFlows().forEach(flow => {
    console.log(`- ${flow.name}: ${flow.description}`);
  });
  console.log('---------------------------------------------');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Start with the Server Builder flow
  console.log('Starting Server Builder flow...');
  console.log('This flow will help you create a new MCP server through conversation.');
  console.log('---------------------------------------------');
  
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
        // Add a separator line before the response for better visibility
        console.log('\n' + chalk.bold.white('─'.repeat(50)));
        console.log(chalk.bold.white(response));
        console.log(chalk.bold.white('─'.repeat(50)) + '\n');
      } catch (error) {
        console.error('Error:', error);
        console.log(chalk.bold.red('Sorry, I encountered an error processing your request.'));
      }

      // Continue the loop
      askQuestion();
    });
  };

  // Start with an initial prompt to the Server Builder flow
  const initialResponse = await router.processQuery('I want to create a new MCP server for weather data');
  console.log('\n' + chalk.bold.white('─'.repeat(50)));
  console.log(chalk.bold.white(initialResponse));
  console.log(chalk.bold.white('─'.repeat(50)) + '\n');

  // Continue the conversation
  askQuestion();
}

main().catch(error => {
  console.error('Error in flow example:', error);
});
