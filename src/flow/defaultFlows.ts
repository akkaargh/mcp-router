import { Flow, FlowContext, FlowResult } from './flowTypes';
import { z } from 'zod';

/**
 * Server Builder Flow
 * Helps users create new MCP servers through conversation
 */
export const serverBuilderFlow: Flow = {
  id: 'server_builder',
  name: 'Server Builder',
  description: 'Create new MCP servers through conversation',
  paramSchema: {
    serverType: z.string().optional().describe('Type of server to create'),
    serverName: z.string().optional().describe('Name for the new server'),
    stage: z.string().optional().describe('Current stage of the server building process'),
    serverDetails: z.record(z.any()).optional().describe('Details about the server being built')
  },
  
  execute: async (context: FlowContext): Promise<FlowResult> => {
    const { llmProvider, userQuery, params, memory } = context;
    
    // Initialize or update server details
    const serverDetails = params.serverDetails || {};
    let stage = params.stage || 'intro';
    
    // Get conversation history for context
    const conversationHistory = memory.getMessages()
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
    
    let prompt = '';
    let response = '';
    
    // Handle different stages of the server building process
    switch (stage) {
      case 'intro':
        // Initial introduction
        prompt = `
You are an expert MCP (Model Context Protocol) server developer. The user wants to create a new MCP server. They said: "${userQuery}"

Based on their request, you need to help them create a TypeScript MCP server that will be saved to the mcp-servers folder.

Previous conversation:
${conversationHistory}

Provide a helpful response that:
1. Acknowledges their request to build a server
2. Asks for specific details about what tools/functionality they want the server to provide
3. Explains that we'll be creating a TypeScript MCP server
4. Keeps your response conversational and helpful

DO NOT ask what programming language they want to use - we will be using TypeScript.
`;
        response = await llmProvider.generateResponse(prompt);
        stage = 'gathering_requirements';
        break;
        
      case 'gathering_requirements':
        // Gathering requirements for the server
        prompt = `
You are an expert MCP (Model Context Protocol) server developer helping the user create a TypeScript MCP server.

Previous conversation:
${conversationHistory}

The user's latest input: "${userQuery}"

Based on the conversation so far, extract any specific requirements for the server:
- What tools should the server provide?
- What parameters should each tool accept?
- What should each tool return?

If you have enough information to start creating the server code, suggest moving to that stage.
If you need more information, ask specific questions to clarify the requirements.

Remember:
- We are creating a TypeScript MCP server
- The server will be saved to the mcp-servers folder
- Keep your response conversational and helpful
`;
        response = await llmProvider.generateResponse(prompt);
        
        // Check if we have enough information to move to code generation
        if (response.toLowerCase().includes("generate the code") || 
            response.toLowerCase().includes("create the server") ||
            response.toLowerCase().includes("write the code")) {
          stage = 'code_generation';
          
          // Extract server details from the conversation
          const extractionPrompt = `
Based on the following conversation, extract the key details for the MCP server:
${conversationHistory}

User's latest input: "${userQuery}"

Extract and format the following information as JSON:
{
  "serverName": "name of the server",
  "serverDescription": "brief description of what the server does",
  "tools": [
    {
      "name": "tool name",
      "description": "what the tool does",
      "parameters": [
        {"name": "parameter name", "type": "string/number/boolean", "description": "what the parameter is for"}
      ]
    }
  ]
}
`;
          const extractionResult = await llmProvider.generateResponse(extractionPrompt);
          try {
            // Try to parse the JSON from the response
            const jsonMatch = extractionResult.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const extractedDetails = JSON.parse(jsonMatch[0]);
              Object.assign(serverDetails, extractedDetails);
            }
          } catch (error) {
            console.error("Failed to parse server details:", error);
          }
        }
        break;
        
      case 'code_generation':
        // Generate the server code
        prompt = `
You are an expert MCP (Model Context Protocol) server developer. Based on the previous conversation, generate TypeScript code for an MCP server.

Previous conversation:
${conversationHistory}

User's latest input: "${userQuery}"

Server details extracted so far:
${JSON.stringify(serverDetails, null, 2)}

Generate complete, working TypeScript code for this MCP server using the @modelcontextprotocol/sdk package.
The code should:
1. Import necessary dependencies
2. Create an MCP server instance
3. Define all the tools mentioned in the conversation
4. Connect the server using StdioServerTransport
5. Be ready to save to a file in the mcp-servers folder

Format your response with the complete code in a code block, and explain what the code does.
`;
        response = await llmProvider.generateResponse(prompt);
        
        // Check if the user wants to save the code
        if (userQuery.toLowerCase().includes("save") || 
            userQuery.toLowerCase().includes("write to file") ||
            userQuery.toLowerCase().includes("create file")) {
          stage = 'save_code';
        }
        break;
        
      case 'save_code':
        // Save the code to a file
        prompt = `
You are an expert MCP (Model Context Protocol) server developer. The user wants to save the server code to a file.

Previous conversation:
${conversationHistory}

User's latest input: "${userQuery}"

Extract the complete TypeScript code from our conversation and prepare it for saving.
Also, determine an appropriate filename for this server (e.g., weather-server.ts).

Respond with:
1. The filename to use
2. The complete code to save
3. A brief confirmation message explaining what will be saved
`;
        response = await llmProvider.generateResponse(prompt);
        
        // TODO: Implement actual file saving using the filesystem MCP server
        // This would require extracting the code and filename from the response
        // and then calling the write_file tool
        
        stage = 'complete';
        break;
        
      case 'complete':
      default:
        // Server creation is complete
        prompt = `
You are an expert MCP (Model Context Protocol) server developer. The server creation process is complete.

Previous conversation:
${conversationHistory}

User's latest input: "${userQuery}"

Respond to the user's query in the context of the server we've just created.
If they're asking about using or modifying the server, provide helpful guidance.
If they're asking about creating a new server, suggest starting a new conversation.
`;
        response = await llmProvider.generateResponse(prompt);
        break;
    }
    
    // Return the response and updated metadata
    return {
      response,
      metadata: {
        stage,
        serverDetails
      }
    };
  }
};

/**
 * Flow Builder Flow
 * Helps users create new flows through conversation
 */
export const flowBuilderFlow: Flow = {
  id: 'flow_builder',
  name: 'Flow Builder',
  description: 'Create new flows through conversation',
  paramSchema: {
    flowType: z.string().optional().describe('Type of flow to create'),
    flowName: z.string().optional().describe('Name for the new flow')
  },
  
  execute: async (context: FlowContext): Promise<FlowResult> => {
    const { llmProvider, userQuery, params } = context;
    
    // If this is the first interaction, provide an introduction
    if (!params.stage || params.stage === 'intro') {
      const prompt = `
The user wants to create a new flow. They said: "${userQuery}"

Based on this, what type of flow might they want to create? Provide a helpful response that:
1. Acknowledges their request
2. Suggests what kind of flow they might want to build
3. Asks for more details about the flow's functionality
4. Explains that you can help them create the flow

Keep your response conversational and helpful.
`;
      
      const response = await llmProvider.generateResponse(prompt);
      
      return {
        response,
        metadata: {
          stage: 'requirements',
          flowType: params.flowType || ''
        }
      };
    }
    
    // More stages would be implemented here for the complete flow
    // This is a simplified version for demonstration
    
    return {
      response: "I'm still learning how to build flows. Let's continue this conversation to design your flow.",
      metadata: {
        stage: 'requirements'
      }
    };
  }
};

/**
 * Get all default flows
 */
export function getDefaultFlows(): Flow[] {
  return [serverBuilderFlow, flowBuilderFlow];
}
