import { LLMProvider } from '../llm';
import { ServerRegistry } from '../registry/serverRegistry';

export class QueryRouter {
  constructor(private llmProvider: LLMProvider, private registry: ServerRegistry) {}

  async routeQuery(userInput: string): Promise<{
    serverId: string;
    toolName: string;
    parameters: Record<string, any>;
  }> {
    // Get all available servers and their tools
    const servers = this.registry.getServers();
    
    // Construct a prompt that includes all available tools
    let toolsDescription = '';
    servers.forEach(server => {
      toolsDescription += `Server: ${server.name} (${server.id})\n`;
      toolsDescription += `Description: ${server.description}\n`;
      toolsDescription += 'Available tools:\n';
      
      server.tools.forEach(tool => {
        toolsDescription += `- ${tool.name}: ${tool.description}\n`;
      });
      
      toolsDescription += '\n';
    });
    
    const prompt = `
User input: "${userInput}"

Available tools:
${toolsDescription}

Based on the user input, determine which tool would be most appropriate to use.
Return your response in the following JSON format:
{
  "serverId": "the ID of the server",
  "toolName": "the name of the tool",
  "parameters": {
    // Any parameters needed for the tool
  }
}
`;

    const response = await this.llmProvider.generateResponse(prompt);
    
    try {
      // Parse the LLM's response to extract the routing information
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      throw new Error('Failed to determine appropriate tool for the query');
    }
  }
}
