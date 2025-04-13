import { MCPLLMRouter } from '../src';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

async function main() {
  // Create a new router instance with memory
  const router = new MCPLLMRouter('anthropic', 'buffer', { maxMessages: 10 });
  
  // Register default servers and flows
  router.registerDefaultServers();
  router.registerDefaultFlows();

  console.log('Registered servers:', router.getServerRegistry().getServers().map(s => s.name).join(', '));
  console.log('Registered flows:', router.getFlowRegistry().getFlows().map(f => f.name).join(', '));
  console.log('---------------------------------------------');

  // Process a user query
  const userQuery = 'What is 5 plus 3?';
  console.log(`User query: ${userQuery}`);
  
  try {
    // Log the routing information before executing the tool
    const routingInfo = await router.queryRouter.routeQuery(userQuery);
    console.log('Routing information:', JSON.stringify(routingInfo, null, 2));
    
    const response = await router.processQuery(userQuery);
    console.log(`Response: ${chalk.white(response)}`);
    
    // Try a follow-up query that should use conversation history
    const followUpQuery = 'What calculation did I just ask you to perform?';
    console.log(`\nFollow-up query: ${followUpQuery}`);
    
    const followUpResponse = await router.processQuery(followUpQuery);
    console.log(`Response: ${chalk.white(followUpResponse)}`);
    
    // Try a flow-related query
    const flowQuery = 'I want to create a new server for weather data';
    console.log(`\nFlow query: ${flowQuery}`);
    
    const flowResponse = await router.processQuery(flowQuery);
    console.log(`Response: ${chalk.white(flowResponse)}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(error => {
  console.error('Error in example:', error);
});
