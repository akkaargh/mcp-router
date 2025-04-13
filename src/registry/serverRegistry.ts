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
}

export class ServerRegistry {
  private servers: MCPServerConfig[] = [];

  addServer(config: MCPServerConfig) {
    this.servers.push(config);
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
