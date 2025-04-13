import { z } from "zod";

interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  connection: {
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
  };
  tools: Array<{
    name: string;
    description: string;
    paramSchema?: z.ZodObject<any>;
  }>;
  disabled?: boolean; // Flag to indicate if the server is disabled
  config?: Record<string, string>; // Configuration values like API keys
}

export class ServerRegistry {
  private servers: MCPServerConfig[] = [];
  private toolExecutor: any; // Reference to the tool executor

  addServer(config: MCPServerConfig) {
    // Check if server with this ID already exists
    const existingIndex = this.servers.findIndex(s => s.id === config.id);
    if (existingIndex >= 0) {
      // Replace existing server
      this.servers[existingIndex] = config;
    } else {
      // Add new server
      this.servers.push(config);
    }
  }
  
  setToolExecutor(executor: any) {
    this.toolExecutor = executor;
  }
  
  getToolExecutor() {
    return this.toolExecutor;
  }

  getServers(): MCPServerConfig[] {
    return this.servers;
  }

  getServerById(id: string): MCPServerConfig | undefined {
    return this.servers.find(server => server.id === id);
  }

  removeServer(id: string): boolean {
    const initialLength = this.servers.length;
    this.servers = this.servers.filter(server => server.id !== id);
    return this.servers.length !== initialLength;
  }
}

export type { MCPServerConfig };
