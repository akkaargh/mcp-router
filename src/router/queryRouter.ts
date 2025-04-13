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
    
    // Construct a prompt that includes all available tools with their parameter schemas
    let toolsDescription = '';
    servers.forEach(server => {
      toolsDescription += `Server: ${server.name} (${server.id})\n`;
      toolsDescription += `Description: ${server.description}\n`;
      toolsDescription += 'Available tools:\n';
      
      server.tools.forEach(tool => {
        toolsDescription += `- ${tool.name}: ${tool.description}\n`;
        if (tool.paramSchema) {
          const params = Object.entries(tool.paramSchema.shape || {});
          if (params.length > 0) {
            toolsDescription += `  Parameters:\n`;
            params.forEach(([paramName, paramSchema]) => {
              // Cast to any to access the description property safely
              const description = (paramSchema as any).description || '';
              toolsDescription += `    - ${paramName}: ${description}\n`;
            });
          }
        }
      });
      
      toolsDescription += '\n';
    });
    
    const prompt = `
User input: "${userInput}"

Available tools:
${toolsDescription}

Based on the user input, determine which tool would be most appropriate to use.
Extract any relevant numbers or values from the user input to use as parameters.

For example, if the user asks "What is 5 plus 3?", you should identify that:
- The "add" tool on the "calculator" server is appropriate
- The parameters should be: { "a": 5, "b": 3 }

Return your response in the following JSON format:
{
  "serverId": "the ID of the server",
  "toolName": "the name of the tool",
  "parameters": {
    // Include all required parameters with their correct types
    // For numeric parameters, use actual numbers, not strings
  }
}

IMPORTANT: Make sure to include all required parameters with their correct types.
For numeric parameters, use actual numbers (e.g., 5), not strings (e.g., "5").
`;

    const response = await this.llmProvider.generateResponse(prompt);
    
    try {
      // Parse the LLM's response to extract the routing information
      const parsedResponse = JSON.parse(response);
      
      // Validate that we have the required fields
      if (!parsedResponse.serverId || !parsedResponse.toolName || !parsedResponse.parameters) {
        throw new Error('Missing required fields in LLM response');
      }
      
      // Ensure parameters are the correct type (convert strings to numbers if needed)
      const server = this.registry.getServerById(parsedResponse.serverId);
      if (!server) {
        throw new Error(`Server with ID ${parsedResponse.serverId} not found`);
      }
      
      const tool = server.tools.find(t => t.name === parsedResponse.toolName);
      if (!tool) {
        throw new Error(`Tool ${parsedResponse.toolName} not found on server ${parsedResponse.serverId}`);
      }
      
      // Return the validated and potentially converted parameters
      return {
        serverId: parsedResponse.serverId,
        toolName: parsedResponse.toolName,
        parameters: parsedResponse.parameters
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      throw new Error('Failed to determine appropriate tool for the query');
    }
  }
}
