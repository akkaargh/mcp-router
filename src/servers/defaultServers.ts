import { MCPServerConfig } from '../registry/serverRegistry';
import { filesystemServer } from './filesystemServer';

/**
 * Default calculator server configuration
 * The tool descriptions are provided by the server itself via list_tools
 */
export const calculatorServer: MCPServerConfig = {
  id: 'calculator',
  name: 'Calculator',
  description: 'A server that provides mathematical operations',
  path: './servers/calculator/calculator-server.js',
  connection: {
    type: 'stdio',
    command: 'node',
    args: []
  },
  tools: [] // Tool descriptions are provided by the server itself
};

/**
 * Get all default server configurations
 */
export function getDefaultServers(): MCPServerConfig[] {
  return [calculatorServer, filesystemServer];
}
