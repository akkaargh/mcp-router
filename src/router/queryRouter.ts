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
    'install_server' |
    'direct_response';
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
      
      // Only include the last 10 messages to keep context manageable
      const recentMessages = conversationHistory.slice(-10);
      
      recentMessages.forEach(msg => {
        // Skip system messages in the displayed history
        if (msg.role !== 'system') {
          historyText += `${msg.role}: ${msg.content}\n`;
        }
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
      // Clean the JSON string to handle control characters
      const cleanedJson = jsonString.replace(/[\n\r\t\b\f\v]/g, ' ');
      
      // Parse the JSON string
      const parsedResponse = JSON.parse(cleanedJson);
      
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
    try {
      // Try to find JSON object in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Clean the JSON string to handle control characters
        return jsonMatch[0].replace(/[\n\r\t\b\f\v]/g, ' ');
      }
      return null;
    } catch (error) {
      console.error('Error extracting JSON from response:', error);
      return null;
    }
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

3. MANAGE MCP SERVERS: Perform operations on the MCP servers registered with this application.
   - IMPORTANT: If the user mentions "MCP servers", "servers for this program", "servers in this application", 
     or similar phrases, they are likely referring to the MCP servers registered with this application.
   - If the user asks to "list servers", "show servers", "what servers are available", "list mcp servers", 
     "show me the servers", or similar phrases, use action: "list_servers"
   - If the user asks about "server status", "which servers are active", "active servers", 
     use action: "server_status"
   - If the user asks to "activate server X", "enable server X", use action: "activate_server"
   - If the user asks to "deactivate server X", "disable server X", use action: "deactivate_server"
   - If the user asks to "remove server X", "delete server X", use action: "remove_server"
   - If the user asks to "install dependencies for server X", use action: "install_server"
   
   If the user is asking about servers in general (like web servers, application servers, etc.) and NOT about the MCP servers registered with this application, use "direct_response" instead.
   
   IMPORTANT: If the user has previously asked about general server types and then follows up with a request like "list servers" or "show servers", they are likely now asking about the MCP servers in this application, especially if they clarify with phrases like "no, I mean the servers in this program".

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

For listing MCP servers:
{
  "action": "list_servers",
  "response": "Here are all the available MCP servers registered with this application.",
  "reasoning": "The user is specifically asking about the MCP servers registered with this application, not about servers in general."
}

For listing MCP servers after a clarification:
{
  "action": "list_servers",
  "response": "Let me show you the MCP servers registered with this application.",
  "reasoning": "Although the user initially asked about servers in general, they have now clarified that they want to see the MCP servers in this application."
}

For a general question about server types:
{
  "action": "direct_response",
  "response": "There are many types of servers including web servers (like Apache, Nginx), application servers (like Tomcat, JBoss), database servers (like MySQL, PostgreSQL), etc.",
  "reasoning": "The user is asking about servers in general, not specifically about the MCP servers registered with this application."
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

    let llmResponse = '';
    try {
      // Get the LLM's decision
      console.log('Sending query to LLM for routing decision...');
      llmResponse = await this.llmProvider.generateResponse(prompt);
      console.log('LLM routing response:', llmResponse);
      
      // Extract JSON from the response if needed
      const jsonString = this.extractJsonFromResponse(llmResponse) || llmResponse;
      
      // Parse the response
      const decision = this.parseToolDecisionResponse(jsonString);
      
      // Return the decision directly without additional logging
      return decision;
      
    } catch (error) {
      console.error('Error in routing query:', error);
      
      // Try to extract a meaningful response from the LLM output even if JSON parsing failed
      let fallbackResponse = `I'm having trouble understanding how to process your request: "${userInput}". Could you please rephrase or provide more details?`;
      
      // If we have a response from the LLM, try to use it
      if (typeof llmResponse === 'string' && llmResponse.length > 0) {
        // Look for a response field in the text
        const responseMatch = llmResponse.match(/"response"\s*:\s*"([^"]+)"/);
        if (responseMatch && responseMatch[1]) {
          fallbackResponse = responseMatch[1].replace(/\\n/g, '\n');
        } else {
          // If no response field, just use the first paragraph that's not JSON-like
          const paragraphs = llmResponse.split('\n').filter((p: string) => 
            p.trim().length > 0 && 
            !p.includes('{') && 
            !p.includes('}') && 
            !p.includes('"action"') &&
            !p.includes('"reasoning"')
          );
          
          if (paragraphs.length > 0) {
            fallbackResponse = paragraphs[0];
          }
        }
      }
      
      // Fallback to direct answer
      return {
        action: 'direct_response',
        response: fallbackResponse,
        reasoning: 'Error parsing LLM response, using fallback'
      };
    }
  }
}
