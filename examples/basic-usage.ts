import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  // Create a new router instance with memory and register default servers
  const router = new MCPLLMRouter('openai', 'buffer', { maxMessages: 10 });
  router.registerDefaultServers();

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
