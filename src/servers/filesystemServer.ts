import { MCPServerConfig } from '../registry/serverRegistry';

/**
 * Filesystem server configuration
 * Provides tools for reading, writing, and manipulating files
 * Tool descriptions are provided by the server itself via list_tools
 */
export const filesystemServer: MCPServerConfig = {
  id: 'filesystem',
  name: 'Filesystem',
  description: 'A server that provides filesystem operations',
  connection: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
  },
  tools: [] // Tool descriptions are provided by the server itself
};
