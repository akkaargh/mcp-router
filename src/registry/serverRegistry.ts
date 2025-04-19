import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  path?: string; // Path to the server file
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
  private configPath: string = './config/servers.json';

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath;
    }
    this.loadServers();
  }

  private loadServers(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        this.servers = config.servers || [];
      } else {
        console.warn(`Server configuration file not found at ${this.configPath}`);
        this.servers = [];
      }
    } catch (error) {
      console.warn(`Could not load server configuration: ${error}`);
      this.servers = [];
    }
  }

  private saveServers(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(
        this.configPath, 
        JSON.stringify({ servers: this.servers }, null, 2)
      );
    } catch (error) {
      console.error(`Failed to save server configuration: ${error}`);
    }
  }

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
    this.saveServers();
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

  removeServer(id: string, deleteFiles: boolean = false): boolean {
    const server = this.getServerById(id);
    if (!server) {
      return false;
    }
    
    // If deleteFiles is true and the server has a path, delete the directory
    if (deleteFiles && server.path) {
      try {
        const serverDir = path.dirname(server.path);
        if (fs.existsSync(serverDir)) {
          fs.rmdirSync(serverDir, { recursive: true });
        }
      } catch (error) {
        console.error(`Failed to delete server files: ${error}`);
      }
    }
    
    // Remove from the registry
    this.servers = this.servers.filter(s => s.id !== id);
    this.saveServers();
    return true;
  }

  /**
   * Activate a server by ID
   */
  activateServer(id: string): boolean {
    const server = this.getServerById(id);
    if (!server) {
      return false;
    }
    
    server.disabled = false;
    this.saveServers();
    return true;
  }

  /**
   * Deactivate a server by ID
   */
  deactivateServer(id: string): boolean {
    const server = this.getServerById(id);
    if (!server) {
      return false;
    }
    
    server.disabled = true;
    this.saveServers();
    return true;
  }

  /**
   * Install dependencies for a server
   */
  async installServerDependencies(id: string): Promise<boolean> {
    const server = this.getServerById(id);
    if (!server || !server.path) {
      return false;
    }
    
    try {
      const serverDir = path.dirname(server.path);
      if (!fs.existsSync(serverDir)) {
        return false;
      }
      
      // Run npm install in the server directory
      return new Promise((resolve, reject) => {
        const npm = spawn('npm', ['install'], { cwd: serverDir });
        
        npm.on('close', (code) => {
          if (code === 0) {
            resolve(true);
          } else {
            reject(new Error(`npm install failed with code ${code}`));
          }
        });
        
        npm.on('error', (err) => {
          reject(err);
        });
      });
    } catch (error) {
      console.error(`Failed to install dependencies: ${error}`);
      return false;
    }
  }
}

export type { MCPServerConfig };
