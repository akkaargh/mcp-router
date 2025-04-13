import { LLMProvider } from '../llm';
import { ServerRegistry, MCPServerConfig } from '../registry/serverRegistry';
import { ConversationMemory } from '../memory/conversationMemory';

// Define the structured response format
interface ToolDecisionResponse {
  action: 'respond_directly' | 'call_tool';
  response: string;
  reasoning: string;
  tool?: {
    serverId: string;
    name: string;
    parameters: Record<string, any>;
    missing_parameters: string[];
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
      
      // If action is call_tool, validate tool information
      if (parsedResponse.action === 'call_tool') {
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
  async routeQuery(userInput: string): Promise<{
    serverId: string;
    toolName: string;
    parameters: Record<string, any>;
    directResponse?: string;
  }> {
    // Get formatted tool descriptions and conversation history
    const toolsDescription = this.getToolsDescription();
    const historyText = this.getConversationHistoryText();
    
    // Get only active servers
    const activeServers = this.registry.getServers().filter(server => !server.disabled);
    
    // Construct the prompt for the LLM
    const prompt = `
You are an intelligent assistant designed to determine whether a user's query requires invoking a tool or can be answered directly based on the conversation history. Analyze the following information and decide the appropriate action.

${historyText}
User input: "${userInput}"

Available Tools:
${toolsDescription}

Based on the above, decide whether to:
1. Respond directly using the conversation history or general knowledge.
2. Invoke an appropriate tool to fulfill the user's request.

IMPORTANT: You should respond directly with a complete, informative answer for:
1. Questions about available tools or system capabilities
2. General knowledge questions (e.g., "What is the capital of France?")
3. Requests for information or explanations that don't require external data
4. Questions about the conversation history
5. Requests for opinions, advice, or creative content that you can generate
6. ANY query that doesn't specifically require a tool to answer

Only suggest using a tool when the user's request CANNOT be fulfilled with your existing knowledge or when a specific computation or external data access is required. Your goal is to provide helpful, accurate responses directly whenever possible.

Respond in the following JSON format:

{
  "action": "respond_directly" | "call_tool",
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
  }
}

Notes:
- If action is "respond_directly", the "tool" field can be omitted.
- If action is "call_tool" and all required parameters are provided, proceed with the tool invocation.
- If action is "call_tool" but some parameters are missing, list them in "missing_parameters" and include a response that prompts the user for the necessary information.
- For numeric parameters, use actual numbers (e.g., 5), not strings (e.g., "5").
- Convert word-form numbers (like "five") to numeric values (like 5).
- Use the conversation history to understand the context of the current request.

Examples:

For direct response:
{
  "action": "respond_directly",
  "response": "Based on our conversation, your name is Eric.",
  "reasoning": "The user is asking about information shared earlier in the conversation history."
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

For tool invocation with missing parameters:
{
  "action": "call_tool",
  "response": "I need more information. Which specific numbers would you like to add?",
  "reasoning": "The user wants to perform addition but hasn't specified the numbers.",
  "tool": {
    "serverId": "calculator",
    "name": "add",
    "parameters": {},
    "missing_parameters": ["a", "b"]
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
      
      // Handle direct responses
      if (decision.action === 'respond_directly') {
        console.log('LLM decided to respond directly');
        return {
          serverId: "direct_answer",
          toolName: "answer",
          parameters: { 
            query: "" // Empty query since we'll use directResponse
          },
          directResponse: decision.response // Include the complete response
        };
      }
      
      // Handle tool invocations
      if (decision.action === 'call_tool' && decision.tool) {
        console.log('LLM decided to use a tool:', decision.tool.name);
        
        // Check if there are missing parameters
        if (decision.tool.missing_parameters && decision.tool.missing_parameters.length > 0) {
          console.log('Tool has missing parameters:', decision.tool.missing_parameters);
          return {
            serverId: "direct_answer",
            toolName: "answer",
            parameters: { 
              query: decision.response || `I need more information to ${decision.tool.name}. Please provide: ${decision.tool.missing_parameters.join(', ')}.`
            }
          };
        }
        
        // All parameters are present, proceed with tool invocation
        return {
          serverId: decision.tool.serverId,
          toolName: decision.tool.name,
          parameters: decision.tool.parameters
        };
      }
      
      // This should not happen if the LLM follows the format
      throw new Error('Invalid decision format from LLM');
      
    } catch (error) {
      console.error('Error in routing query:', error);
      
      // Fallback to direct answer
      return {
        serverId: "direct_answer",
        toolName: "answer",
        parameters: { 
          query: `I'm having trouble understanding how to process your request: "${userInput}". Could you please rephrase or provide more details?`
        }
      };
    }
  }
}
