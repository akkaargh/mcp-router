import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import readline from 'readline';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

async function main() {
  console.log('Starting MCP-LLM-Router Chat Interface...');
  console.log('Type "exit" or "quit" to end the session.');
  console.log('Type "help" to see available commands.');
  console.log('---------------------------------------------');

  // Create a new router instance with memory
  const router = new MCPLLMRouter('anthropic', 'buffer', { maxMessages: 10 });
  
  // Register default servers and flows
  await router.registerDefaultServers();
  router.registerDefaultFlows();

  // Simplified server and flow registration output
  const servers = router.getServerRegistry().getServers().filter(s => s.id !== 'direct_answer');
  const flows = router.getFlowRegistry().getFlows();
  
  console.log(`Ready with ${servers.length} servers and ${flows.length} flows`);
  console.log('---------------------------------------------');

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
      
      if (userInput.toLowerCase() === 'help') {
        console.log('Available commands:');
        console.log('  exit, quit - Exit the chat interface');
        console.log('  help - Show this help message');
        console.log('  clear - Clear the conversation history');
        console.log('  list servers - Show all available servers');
        console.log('  server status - Check which servers are active');
        console.log('  activate server <id> - Enable a disabled server');
        console.log('  deactivate server <id> - Temporarily disable a server');
        console.log('\nAvailable flows:');
        router.getFlowRegistry().getFlows().forEach(flow => {
          console.log(`  ${flow.name} - ${flow.description}`);
        });
        console.log('\nYou can also ask me anything, and I\'ll try to help!');
        askQuestion();
        return;
      }
      
      if (userInput.toLowerCase() === 'clear') {
        router.clearMemory();
        console.log('Conversation history cleared.');
        askQuestion();
        return;
      }

      try {
        console.log(chalk.gray('Processing...'));
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

  // Start the conversation
  askQuestion();
}

main().catch(error => {
  console.error('Error in chat interface:', error);
});
