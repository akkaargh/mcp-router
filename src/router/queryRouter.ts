import { LLMProvider } from '../llm';
import { ServerRegistry } from '../registry/serverRegistry';
import { ConversationMemory } from '../memory/conversationMemory';

export class QueryRouter {
  constructor(
    private llmProvider: LLMProvider, 
    private registry: ServerRegistry,
    private memory: ConversationMemory
  ) {}

  private processJsonResponse(jsonString: string, userInput: string): {
    serverId: string;
    toolName: string;
    parameters: Record<string, any>;
  } {
    try {
      // Parse the JSON string
      const parsedResponse = JSON.parse(jsonString);
      console.log('Parsed routing response:', parsedResponse);
      
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
      
      // Log parameter extraction
      console.log('Extracted parameters:', {
        original: parsedResponse.parameters,
        types: Object.entries(parsedResponse.parameters).reduce((acc, [key, value]) => {
          acc[key] = typeof value;
          return acc;
        }, {} as Record<string, string>)
      });
      
      // Return the validated and potentially converted parameters
      return {
        serverId: parsedResponse.serverId,
        toolName: parsedResponse.toolName,
        parameters: parsedResponse.parameters
      };
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      throw error;
    }
  }

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
    
    // Get conversation history
    const conversationHistory = this.memory.getMessages();
    let historyText = '';
    
    if (conversationHistory.length > 0) {
      historyText = 'Conversation history:\n';
      conversationHistory.forEach(msg => {
        historyText += `${msg.role}: ${msg.content}\n`;
      });
      historyText += '\n';
    }
    
    const prompt = `
${historyText}
User input: "${userInput}"

Available tools:
${toolsDescription}

Based on the user input and conversation history, determine which tool would be most appropriate to use.
Extract any relevant numbers or values from the user input to use as parameters.

For example, if the user asks "What is 5 plus 3?", you should identify that:
- The "add" tool on the "calculator" server is appropriate
- The parameters should be: { "a": 5, "b": 3 }

If the user previously asked about adding numbers and now provides the numbers (like "five and 13"), 
you should understand from context that they want to use the add tool with those numbers.

If the user's query is ambiguous or missing required parameters (like "I want to add two numbers" without specifying which numbers), respond with:
"I need more information. Which specific numbers would you like to add?"

Return your response in the following JSON format ONLY if you have all required parameters:
{
  "serverId": "the ID of the server",
  "toolName": "the name of the tool",
  "parameters": {
    // Include all required parameters with their correct types
    // For numeric parameters, use actual numbers, not strings
  }
}

IMPORTANT: 
1. Make sure to include all required parameters with their correct types.
2. For numeric parameters, use actual numbers (e.g., 5), not strings (e.g., "5").
3. If any required parameters are missing, DO NOT return JSON. Instead, ask for the missing information.
4. Use the conversation history to understand the context of the current request.
5. Convert word-form numbers (like "five") to numeric values (like 5).
`;

    const response = await this.llmProvider.generateResponse(prompt);
    
    try {
      console.log('Raw LLM routing response:', response);
      
      // Check if the response is not in JSON format
      if (!response.trim().startsWith('{')) {
        // Try to handle ambiguous queries by asking for more information
        if (response.toLowerCase().includes('need more information') || 
            response.toLowerCase().includes('which numbers') ||
            response.toLowerCase().includes('please specify')) {
          
          console.log('Detected ambiguous query that needs more information');
          return {
            serverId: "direct_answer",
            toolName: "answer",
            parameters: { 
              query: `The user asked: "${userInput}". Please ask for the specific information needed to complete this request.` 
            }
          };
        }
        
        // If it's not a request for more information, try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('Extracted JSON from non-JSON response');
          const extractedJson = jsonMatch[0];
          return this.processJsonResponse(extractedJson, userInput);
        } else {
          throw new Error(`Response is not in JSON format: ${response.substring(0, 100)}...`);
        }
      }
      
      // Parse the LLM's response to extract the routing information
      return this.processJsonResponse(response, userInput);
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      
      // For ambiguous queries like "I want to add 2 numbers", provide a helpful response
      if (userInput.toLowerCase().includes('add') && userInput.toLowerCase().includes('numbers')) {
        console.log('Detected ambiguous math query, asking for clarification');
        return {
          serverId: "direct_answer",
          toolName: "answer",
          parameters: { 
            query: `The user said: "${userInput}". Ask which specific numbers they want to add.` 
          }
        };
      }
      
      throw new Error('Failed to determine appropriate tool for the query');
    }
  }
}
