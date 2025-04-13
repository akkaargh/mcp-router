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

    // Check if the tool exists on the server
    const tool = serverConfig.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverId}`);
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
    // Create an MCP client for stdio
    const transport = new StdioClientTransport({
      command: serverConfig.connection.command || '',
      args: serverConfig.connection.args || []
    });
    
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
