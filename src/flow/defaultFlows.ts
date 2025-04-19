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
    
    // Check if this is actually a request to list servers rather than create one
    if (userQuery.toLowerCase().includes("list") && 
        userQuery.toLowerCase().includes("server") &&
        (userQuery.toLowerCase().includes("mcp") || 
         userQuery.toLowerCase().includes("this app") || 
         userQuery.toLowerCase().includes("application") || 
         userQuery.toLowerCase().includes("program"))) {
      
      // This appears to be a request to list servers, not create one
      return {
        response: "I notice you're asking to list the MCP servers for this application. Let me redirect you to the server listing functionality instead of the server builder.",
        metadata: {
          shouldRedirect: true,
          redirectAction: "list_servers"
        }
      };
    }
    
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

IMPORTANT: If the user is asking to LIST servers or get information about EXISTING servers, respond that you'll redirect them to the server listing functionality.

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
            response.toLowerCase().includes("write the code") ||
            response.toLowerCase().includes("let's make") ||
            response.toLowerCase().includes("lets make") ||
            response.toLowerCase().includes("build the server") ||
            response.toLowerCase().includes("implement the server")) {
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

FOLLOW THIS EXACT PATTERN - DO NOT DEVIATE:

\`\`\`typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Weather Server",
  version: "1.0.0"
});

// Add tools
server.tool("getWeather",
  { city: z.string().describe("City name") },
  async ({ city }) => ({
    content: [{ type: "text", text: "rainy" }]
  })
);

server.tool("getForecast",
  { city: z.string().describe("City name") },
  async ({ city }) => ({
    content: [{ type: "text", text: "sunny" }]
  })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
\`\`\`

IMPORTANT:
1. Use EXACTLY the imports shown above
2. Create the server with McpServer constructor
3. Define each tool using server.tool() with the exact pattern shown
4. Connect using StdioServerTransport
5. Make sure the file is a valid ES module
6. DO NOT use any other patterns or frameworks

Replace the example tools with the actual tools needed for your server based on the conversation.
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

The code MUST follow this exact pattern:
1. Import these exact packages:
   - import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   - import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   - import { z } from "zod";

2. Create a server with: const server = new McpServer({ name: "...", version: "1.0.0" });

3. Define tools using this exact pattern:
   server.tool("toolName",
     { param: z.string().describe("description") },
     async ({ param }) => ({
       content: [{ type: "text", text: "result" }]
     })
   );

4. Connect with: 
   const transport = new StdioServerTransport();
   await server.connect(transport);

If the code doesn't match this pattern exactly, fix it to conform.
Return ONLY the corrected code, without any explanation or markdown formatting.
`;
        const validatedCodeResponse = await llmProvider.generateResponse(prompt);
        const validatedCode = validatedCodeResponse.replace(/```(?:typescript|js|javascript)?|```/g, '').trim();
        serverDetails.code = validatedCode;
        
        // Save the file using the filesystem MCP server
        try {
          // Create a server directory
          const serverDirName = serverDetails.serverName || 'custom-server';
          const serverDir = `servers/${serverDirName.toLowerCase().replace(/\s+/g, '-')}`;
          
          // Create the directory if it doesn't exist
          await toolExecutor.execute('filesystem', 'create_directory', {
            path: serverDir
          });
          
          // Write the server file
          const serverFilename = serverDetails.filename || `${serverDirName.toLowerCase().replace(/\s+/g, '-')}.js`;
          await toolExecutor.execute('filesystem', 'write_file', {
            path: `${serverDir}/${serverFilename}`,
            content: serverDetails.code
          });
          
          // Create package.json
          await toolExecutor.execute('filesystem', 'write_file', {
            path: `${serverDir}/package.json`,
            content: JSON.stringify({
              "name": serverDirName.toLowerCase().replace(/\s+/g, '-'),
              "version": "1.0.0",
              "description": serverDetails.serverDescription || `MCP server for ${serverDirName}`,
              "type": "module",
              "main": serverFilename,
              "dependencies": {
                "@modelcontextprotocol/sdk": "^1.9.0",
                "zod": "^3.24.2"
              }
            }, null, 2)
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
                toolNames.forEach((name: string) => {
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
          const serverId = serverDirName.toLowerCase().replace(/\s+/g, '_');
          serverDetails.serverConfig = {
            id: serverId,
            name: serverName,
            description: serverDetails.serverDescription || `MCP server for ${serverName}`,
            path: `./${serverDir}/${serverFilename}`,
            connection: {
              type: 'stdio',
              command: 'node',
              args: []
            },
            tools: tools
          };
          
          response = `Great! I've saved your MCP server to ${serverDir}/${serverFilename}.

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
              
              const registeredServerId = serverDetails.serverConfig.id;
              response = `Success! I've registered the ${serverDetails.serverConfig.name} server with the system.

Would you like me to install the dependencies for this server now? This will run 'npm install' in the server directory.

You can also manage your server with these commands:
- Ask to "list servers" - Show all available servers
- Ask for "server status" - Check which servers are active
- Ask to "activate server ${registeredServerId}" - Enable the server if it's disabled
- Ask to "deactivate server ${registeredServerId}" - Temporarily disable the server
- Ask to "remove server ${registeredServerId}" - Remove the server from the registry
- Ask to "install dependencies for server ${registeredServerId}" - Install dependencies for the server

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
