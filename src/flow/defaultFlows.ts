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
    const { llmProvider, userQuery, params, memory, serverRegistry, toolExecutor } = context;
    
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
1. Import necessary dependencies:
   - import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   - import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   - import { z } from "zod";

2. Create an MCP server instance:
   - const server = new McpServer({ name: "Server Name", version: "1.0.0" });

3. Define all the tools mentioned in the conversation using the server.tool() method:
   - server.tool("tool-name", { param: z.string() }, async ({ param }) => { ... });

4. Connect the server using StdioServerTransport:
   - const transport = new StdioServerTransport();
   - await server.connect(transport);

5. Be ready to save to a file in the mcp-servers folder

IMPORTANT: Follow this exact structure for MCP servers. Do NOT use classes or other patterns.
Make sure the code is valid TypeScript and can be run with Node.js.
The file should be a valid ES module (use import/export syntax).

Format your response with the complete code in a code block, and explain what the code does.
`;
        response = await llmProvider.generateResponse(prompt);
        
        // Extract the code from the response
        const codeMatch = response.match(/```(?:typescript|js|javascript)([\s\S]*?)```/);
        if (codeMatch && codeMatch[1]) {
          serverDetails.code = codeMatch[1].trim();
        }
        
        // Determine if the user wants to create/save the MCP server
        const intentPrompt = `
Based on the following conversation, determine if the user is expressing an intent to create, save, or generate the MCP server file.

Previous conversation:
${conversationHistory}

User's latest input: "${userQuery}"

Respond with a JSON object with a single field "intent" that is either "create_mcp_server" if the user wants to create/save/generate the server file, or "continue_discussion" if they are just asking questions or providing more details.

Example:
{"intent": "create_mcp_server"}
or
{"intent": "continue_discussion"}
`;
        
        const intentResponse = await llmProvider.generateResponse(intentPrompt);
        try {
          // Extract JSON from the response
          const jsonMatch = intentResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const intentData = JSON.parse(jsonMatch[0]);
            if (intentData.intent === "create_mcp_server") {
              stage = 'save_code';
            }
          }
        } catch (error) {
          console.error("Failed to parse intent response:", error);
        }
        break;
        
      case 'save_code':
        // If we don't have code yet, extract it from the conversation
        if (!serverDetails.code) {
          prompt = `
Extract the complete TypeScript code for the MCP server from our conversation.
Previous conversation:
${conversationHistory}

Return ONLY the code, without any explanation or markdown formatting.
`;
          const codeResponse = await llmProvider.generateResponse(prompt);
          const extractedCode = codeResponse.replace(/```(?:typescript|js|javascript)?|```/g, '').trim();
          serverDetails.code = extractedCode;
        }
        
        // Determine an appropriate filename
        if (!serverDetails.filename) {
          prompt = `
Based on our conversation about creating an MCP server, suggest an appropriate filename for this server.
The filename should be in kebab-case (e.g., weather-server.ts) and end with .ts extension.
Previous conversation:
${conversationHistory}

Return ONLY the filename, without any explanation.
`;
          const filenameResponse = await llmProvider.generateResponse(prompt);
          serverDetails.filename = filenameResponse.trim().replace(/['"]/g, '');
          
          // Ensure the filename has .ts extension
          if (!serverDetails.filename.endsWith('.ts')) {
            serverDetails.filename += '.ts';
          }
        }
        
        // Validate the code to ensure it's using the correct imports and structure
        prompt = `
Review this MCP server code and ensure it follows the correct structure with proper imports.
If there are any issues, fix them and return the corrected code.

${serverDetails.code}

Specifically check for:
1. Correct imports from "@modelcontextprotocol/sdk/server/mcp.js" and "@modelcontextprotocol/sdk/server/stdio.js"
2. Proper use of McpServer and StdioServerTransport
3. Correct tool definitions using server.tool()
4. Proper connection setup with await server.connect(transport)

Return ONLY the corrected code, without any explanation or markdown formatting.
`;
        const validatedCodeResponse = await llmProvider.generateResponse(prompt);
        const validatedCode = validatedCodeResponse.replace(/```(?:typescript|js|javascript)?|```/g, '').trim();
        serverDetails.code = validatedCode;
        
        // Save the file using the filesystem MCP server
        try {
          const filePath = `mcp-servers/${serverDetails.filename}`;
          
          // Create the directory if it doesn't exist
          await toolExecutor.execute('filesystem', 'create_directory', {
            path: 'mcp-servers'
          });
          
          // Write the file
          await toolExecutor.execute('filesystem', 'write_file', {
            path: filePath,
            content: serverDetails.code
          });
          
          // Generate server configuration for registration
          const serverNameMatch = serverDetails.code.match(/name:\s*["']([^"']+)["']/);
          const serverName = serverNameMatch ? serverNameMatch[1] : serverDetails.filename.replace('.ts', '');
          
          // Extract tool names and parameters
          const toolRegex = /server\.tool\(\s*["']([^"']+)["']\s*,\s*\{([^}]+)\}/g;
          const tools = [];
          let match;
          
          while ((match = toolRegex.exec(serverDetails.code)) !== null) {
            const toolName = match[1];
            const paramsText = match[2];
            tools.push({
              name: toolName,
              description: `Tool for ${toolName.replace(/-/g, ' ')}`
            });
          }
          
          // If no tools were found with the regex, try to extract them another way
          if (tools.length === 0) {
            const toolNamesPrompt = `
Extract the names of all tools defined in this MCP server code:

${serverDetails.code}

Return a JSON array of tool names only, like: ["toolName1", "toolName2"]
`;
            const toolNamesResponse = await llmProvider.generateResponse(toolNamesPrompt);
            try {
              const jsonMatch = toolNamesResponse.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const toolNames = JSON.parse(jsonMatch[0]);
                toolNames.forEach(name => {
                  tools.push({
                    name,
                    description: `Tool for ${name.replace(/-/g, ' ')}`
                  });
                });
              }
            } catch (error) {
              console.error("Failed to parse tool names:", error);
            }
          }
          
          // Save server configuration for registration
          serverDetails.serverConfig = {
            id: serverName.toLowerCase().replace(/\s+/g, '_'),
            name: serverName,
            description: `MCP server for ${serverName}`,
            connection: {
              type: 'stdio',
              command: 'node',
              args: [`./mcp-servers/${serverDetails.filename}`]
            },
            tools: tools
          };
          
          response = `Great! I've saved your MCP server to ${filePath}.

The server includes the following tools:
${tools.map(t => `- ${t.name}`).join('\n')}

Would you like me to register this server with the system so you can use it right away?`;
          
          stage = 'register_server';
        } catch (error) {
          console.error('Error saving server file:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          response = `I encountered an error while trying to save your server: ${errorMessage}. Please try again or save the code manually.`;
        }
        break;
        
      case 'register_server':
        // Determine if the user wants to register the server
        const registerIntentPrompt = `
Based on the following conversation, determine if the user is expressing an intent to register the MCP server with the system.

Previous conversation:
${conversationHistory}

User's latest input: "${userQuery}"

Respond with a JSON object with a single field "intent" that is either "register_server" if the user wants to register the server, or "skip_registration" if they don't want to register it now.

Example:
{"intent": "register_server"}
or
{"intent": "skip_registration"}
`;
        
        const registerIntentResponse = await llmProvider.generateResponse(registerIntentPrompt);
        let registerIntent = "skip_registration";
        
        try {
          // Extract JSON from the response
          const jsonMatch = registerIntentResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const intentData = JSON.parse(jsonMatch[0]);
            registerIntent = intentData.intent;
          }
        } catch (error) {
          console.error("Failed to parse register intent response:", error);
        }
        
        if (registerIntent === "register_server") {
          if (serverDetails.serverConfig) {
            try {
              // Add the server to the registry
              serverRegistry.addServer(serverDetails.serverConfig);
              
              response = `Success! I've registered the ${serverDetails.serverConfig.name} server with the system.

You can now use it by asking questions that require its tools. For example:
"What's the weather in New York?"

You can also manage your servers with these commands:
- "list servers" - Show all available servers
- "server status" - Check which servers are active
- "deactivate server ${serverDetails.serverConfig.id}" - Temporarily disable this server
- "activate server ${serverDetails.serverConfig.id}" - Re-enable the server if it's disabled

Is there anything else you'd like to know about your new server?`;
            } catch (error) {
              console.error('Error registering server:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              response = `I encountered an error while trying to register your server: ${errorMessage}. You may need to restart the application for the server to be recognized.`;
            }
          } else {
            response = `I'm sorry, but I don't have the server configuration details. Let's try again by generating the server code first.`;
            stage = 'code_generation';
          }
        } else {
          response = `No problem. The server has been saved to mcp-servers/${serverDetails.filename}, but it hasn't been registered with the system yet.

You can register it later by saying "register the ${serverDetails.filename.replace('.ts', '')} server" or by restarting the application.

Is there anything else you'd like to do with your server?`;
        }
        
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
