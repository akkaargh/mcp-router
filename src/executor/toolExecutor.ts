import { ServerRegistry, MCPServerConfig } from '../registry/serverRegistry';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class ToolExecutor {
  constructor(private registry: ServerRegistry) {}

  async execute(serverId: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    // Get the server configuration
    const serverConfig = this.registry.getServerById(serverId);
    if (!serverConfig) {
      throw new Error(`Server with ID ${serverId} not found`);
    }

    // Execute the tool based on the connection type
    return await this.executeOnServer(serverConfig, toolName, parameters);
  }

  private async executeOnServer(
    serverConfig: MCPServerConfig, 
    toolName: string, 
    parameters: Record<string, any>
  ): Promise<any> {
    // Implementation depends on the connection type
    switch (serverConfig.connection.type) {
      case 'stdio':
        return await this.executeViaStdio(serverConfig, toolName, parameters);
      case 'sse':
        return await this.executeViaSse(serverConfig, toolName, parameters);
      default:
        throw new Error(`Unsupported connection type: ${serverConfig.connection.type}`);
    }
  }

  private async executeViaStdio(
    serverConfig: MCPServerConfig, 
    toolName: string, 
    parameters: Record<string, any>
  ): Promise<any> {
    // Get the command and args
    const command = serverConfig.connection.command || 'node';
    
    // If the server has a path, use it as the first argument
    const args = [...(serverConfig.connection.args || [])];
    if (serverConfig.path) {
      args.unshift(serverConfig.path);
    }
    
    // Create an MCP client for stdio
    const transport = new StdioClientTransport({
      command: command,
      args: args
    });
    
    const client = new Client({
      name: "mcp-llm-router-client",
      version: "1.0.0"
    });
    
    try {
      // Connect to the server
      await client.connect(transport);
      
      // Log tool descriptions when first connecting to a server
      try {
        const tools = await client.listTools();
        console.log(`\n--- MCP Server Tool Descriptions for ${serverConfig.name} ---`);
        if (tools && Array.isArray(tools.tools)) {
          tools.tools.forEach((tool: any) => {
            console.log(`Tool: ${tool.name}`);
            
            // Handle case where description might be undefined
            // First try the tool's description from the server
            // Then try the tool's description from the server config
            // Finally fall back to a generic description
            const description = tool.description || 
                               (serverConfig.tools.find(t => t.name === tool.name)?.description) || 
                               `Tool for ${tool.name.replace(/_/g, ' ')}`;
                               
            console.log(`Description: ${description}`);
            
            // Log parameter information if available
            if (tool.inputSchema?.properties) {
              console.log('Parameters:', JSON.stringify(tool.inputSchema.properties, null, 2));
            } else {
              console.log('Parameters: No parameter information available');
            }
            console.log('---');
          });
        } else {
          console.log(`No tools found for ${serverConfig.name} server`);
        }
        console.log(`--- End Tool Descriptions ---\n`);
      } catch (error) {
        console.error('Error fetching tool descriptions:', error);
      }
      
      // Call the tool
      const result = await client.callTool({
        name: toolName,
        arguments: parameters
      });
      
      return result;
    } finally {
      // Close the transport
      await transport.close();
    }
  }

  private async executeViaSse(
    serverConfig: MCPServerConfig, 
    toolName: string, 
    parameters: Record<string, any>
  ): Promise<any> {
    // Create an MCP client for SSE
    const transport = new SSEClientTransport(
      new URL(serverConfig.connection.url || '')
    );
    
    const client = new Client({
      name: "mcp-llm-router-client",
      version: "1.0.0"
    });
    
    try {
      // Connect to the server
      await client.connect(transport);
      
      // Call the tool
      const result = await client.callTool({
        name: toolName,
        arguments: parameters
      });
      
      return result;
    } finally {
      // Close the transport
      await transport.close();
    }
  }
}
