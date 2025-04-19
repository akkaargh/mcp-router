import { LLMProvider } from '../llm';
import { ServerRegistry, MCPServerConfig } from '../registry/serverRegistry';
import { ConversationMemory } from '../memory/conversationMemory';

// Define the structured response format
interface ToolDecisionResponse {
  action: 
    'respond_directly' | 
    'call_tool' | 
    'list_servers' | 
    'server_status' | 
    'activate_server' | 
    'deactivate_server' | 
    'remove_server' |
    'install_server';
  response: string;
  reasoning: string;
  tool?: {
    serverId: string;
    name: string;
    parameters: Record<string, any>;
    missing_parameters: string[];
  };
  server?: {
    id: string;
    deleteFiles?: boolean;
  };
}

export class QueryRouter {
  constructor(
    private llmProvider: LLMProvider, 
    private registry: ServerRegistry,
    private memory: ConversationMemory
  ) {}

  /**
   * Generate a formatted description of all available tools
   */
  private getToolsDescription(): string {
    // Only include active servers
    const servers = this.registry.getServers().filter(server => !server.disabled);
    let toolsDescription = '';
    
    servers.forEach(server => {
      toolsDescription += `Server: ${server.name} (ID: ${server.id})\n`;
      toolsDescription += `Description: ${server.description}\n`;
      toolsDescription += 'Available tools:\n';
      
      server.tools.forEach(tool => {
        toolsDescription += `- ${tool.name}: ${tool.description}\n`;
        if (tool.paramSchema) {
          const params = Object.entries(tool.paramSchema.shape || {});
          if (params.length > 0) {
            toolsDescription += `  Required Parameters:\n`;
            params.forEach(([paramName, paramSchema]) => {
              // Cast to any to access the description property safely
              const description = (paramSchema as any).description || '';
              const type = (paramSchema as any)._def?.typeName || 'unknown';
              toolsDescription += `    - ${paramName} (${type}): ${description}\n`;
            });
          }
        }
      });
      
      toolsDescription += '\n';
    });
    
    return toolsDescription;
  }

  /**
   * Get formatted conversation history
   */
  private getConversationHistoryText(): string {
    const conversationHistory = this.memory.getMessages();
    let historyText = '';
    
    if (conversationHistory.length > 0) {
      historyText = 'Conversation History:\n';
      conversationHistory.forEach(msg => {
        historyText += `${msg.role}: ${msg.content}\n`;
      });
      historyText += '\n';
    }
    
    return historyText;
  }

  /**
   * Parse and validate the LLM's JSON response
   */
  private parseToolDecisionResponse(jsonString: string): ToolDecisionResponse {
    try {
      // Parse the JSON string
      const parsedResponse = JSON.parse(jsonString);
      console.log('Parsed tool decision response:', parsedResponse);
      
      // Validate that we have the required fields
      if (!parsedResponse.action || !parsedResponse.response || !parsedResponse.reasoning) {
        throw new Error('Missing required fields in LLM response');
      }
      
      // Validate action-specific fields
      switch (parsedResponse.action) {
        case 'call_tool':
          if (!parsedResponse.tool || !parsedResponse.tool.serverId || !parsedResponse.tool.name) {
            throw new Error('Missing tool information in LLM response');
          }
          
          // Ensure the server and tool exist
          const server = this.registry.getServerById(parsedResponse.tool.serverId);
          if (!server) {
            throw new Error(`Server with ID ${parsedResponse.tool.serverId} not found`);
          }
          
          const tool = server.tools.find(t => t.name === parsedResponse.tool.name);
          if (!tool) {
            throw new Error(`Tool ${parsedResponse.tool.name} not found on server ${parsedResponse.tool.serverId}`);
          }
          
          // Ensure parameters and missing_parameters are present
          if (!parsedResponse.tool.parameters) {
            parsedResponse.tool.parameters = {};
          }
          
          if (!parsedResponse.tool.missing_parameters) {
            parsedResponse.tool.missing_parameters = [];
          }
          break;
          
        case 'activate_server':
        case 'deactivate_server':
        case 'remove_server':
        case 'install_server':
          if (!parsedResponse.server || !parsedResponse.server.id) {
            throw new Error(`Missing server ID for ${parsedResponse.action} action`);
          }
          break;
      }
      
      return parsedResponse as ToolDecisionResponse;
    } catch (error) {
      console.error('Failed to parse tool decision response:', error);
      throw error;
    }
  }

  /**
   * Extract JSON from a text response that might contain additional content
   */
  private extractJsonFromResponse(response: string): string | null {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return null;
  }

  /**
   * Route the user query to the appropriate tool or direct response
   */
  async routeQuery(userInput: string): Promise<ToolDecisionResponse> {
    // Get formatted tool descriptions and conversation history
    const toolsDescription = this.getToolsDescription();
    const historyText = this.getConversationHistoryText();
    
    // Get only active servers
    const activeServers = this.registry.getServers().filter(server => !server.disabled);
    
    // Construct the prompt for the LLM
    const prompt = `
You are an intelligent assistant designed to determine the appropriate action based on a user's query. Analyze the following information and decide what action to take.

${historyText}
User input: "${userInput}"

Available Tools:
${toolsDescription}

Based on the above, decide on the appropriate action to take. You can:

1. DIRECT RESPONSE: Answer the user's question using your knowledge or the conversation history.
   - Use this for general knowledge questions, explanations, or when no specific tool is needed.
   - IMPORTANT: For general knowledge questions like "What is the capital of France?", ALWAYS use direct_response, NOT call_tool.

2. CALL A TOOL: Use one of the available tools to fulfill the user's request.
   - Use this when the user's request requires computation or external data.

3. MANAGE SERVERS: Perform server management operations.
   - LIST SERVERS: Show all available servers
   - SERVER STATUS: Check which servers are active/disabled
   - ACTIVATE SERVER: Enable a disabled server
   - DEACTIVATE SERVER: Temporarily disable a server
   - REMOVE SERVER: Remove a server from the registry (optionally delete files)
   - INSTALL SERVER: Install dependencies for a server

Respond in the following JSON format:

{
  "action": "direct_response" | "call_tool" | "list_servers" | "server_status" | "activate_server" | "deactivate_server" | "remove_server" | "install_server",
  "response": "Your message to the user explaining the action taken.",
  "reasoning": "Explanation of why this action is appropriate.",
  "tool": {
    "serverId": "server_id",
    "name": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    },
    "missing_parameters": ["param3"]
  },
  "server": {
    "id": "server_id",
    "deleteFiles": true | false
  }
}

Notes:
- The "tool" field is only required for "call_tool" action.
- The "server" field is only required for "activate_server", "deactivate_server", "remove_server", and "install_server" actions.
- For "remove_server" action, include "deleteFiles" to indicate whether to delete the server files.
- For numeric parameters, use actual numbers (e.g., 5), not strings (e.g., "5").
- Convert word-form numbers (like "five") to numeric values (like 5).
- Use the conversation history to understand the context of the current request.

Examples:

For direct response:
{
  "action": "direct_response",
  "response": "The capital of France is Paris.",
  "reasoning": "This is a general knowledge question that I can answer directly without using a tool."
}

For tool invocation with all parameters:
{
  "action": "call_tool",
  "response": "I'll calculate 5 plus 3 for you.",
  "reasoning": "The user is asking for a mathematical calculation that requires the add tool.",
  "tool": {
    "serverId": "calculator",
    "name": "add",
    "parameters": {
      "a": 5,
      "b": 3
    },
    "missing_parameters": []
  }
}

For listing servers:
{
  "action": "list_servers",
  "response": "Here are all the available servers.",
  "reasoning": "The user asked to see a list of all servers."
}

For activating a server:
{
  "action": "activate_server",
  "response": "I'll activate the calculator server for you.",
  "reasoning": "The user wants to enable the calculator server.",
  "server": {
    "id": "calculator"
  }
}

For removing a server with file deletion:
{
  "action": "remove_server",
  "response": "I'll remove the weather server and delete its files.",
  "reasoning": "The user wants to completely remove the weather server.",
  "server": {
    "id": "weather",
    "deleteFiles": true
  }
}
`;

    try {
      // Get the LLM's decision
      console.log('Sending tool decision prompt to LLM...');
      const response = await this.llmProvider.generateResponse(prompt);
      console.log('Raw LLM tool decision response:', response);
      
      // Extract JSON from the response if needed
      const jsonString = this.extractJsonFromResponse(response) || response;
      
      // Parse the response
      const decision = this.parseToolDecisionResponse(jsonString);
      
      // Return the decision directly
      return decision;
      
    } catch (error) {
      console.error('Error in routing query:', error);
      
      // Fallback to direct answer
      return {
        action: 'respond_directly',
        response: `I'm having trouble understanding how to process your request: "${userInput}". Could you please rephrase or provide more details?`,
        reasoning: 'Error parsing LLM response'
      };
    }
  }
}
