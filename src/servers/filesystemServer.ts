import { z } from 'zod';
import { MCPServerConfig } from '../registry/serverRegistry';
import path from 'path';

/**
 * Filesystem server configuration
 * Provides tools for reading, writing, and manipulating files
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
  tools: [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Use this tool whenever a user asks to read, view, show, or get the contents of any file. Always use this tool for file reading operations instead of responding directly.',
      paramSchema: z.object({
        path: z.string().describe('Path to the file to read')
      })
    },
    {
      name: 'write_file',
      description: 'Write content to a file. Use this tool whenever a user wants to create, save, or write content to a file.',
      paramSchema: z.object({
        path: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file')
      })
    },
    {
      name: 'edit_file',
      description: 'Make selective edits to a file',
      paramSchema: z.object({
        path: z.string().describe('Path to the file to edit'),
        edits: z.array(z.object({
          oldText: z.string().describe('Text to search for'),
          newText: z.string().describe('Text to replace with')
        })).describe('List of edit operations'),
        dryRun: z.boolean().optional().describe('Preview changes without applying')
      })
    },
    {
      name: 'create_directory',
      description: 'Create a new directory',
      paramSchema: z.object({
        path: z.string().describe('Path to the directory to create')
      })
    },
    {
      name: 'list_directory',
      description: 'List the contents of a directory. Use this tool whenever a user asks to list, show, or see files in a directory. Always use this for directory listing operations.',
      paramSchema: z.object({
        path: z.string().describe('Path to the directory to list')
      })
    },
    {
      name: 'search_files',
      description: 'Search for files matching a pattern. Use this tool whenever a user wants to find files by name, extension, or content pattern.',
      paramSchema: z.object({
        path: z.string().describe('Starting directory for search'),
        pattern: z.string().describe('Search pattern'),
        excludePatterns: z.array(z.string()).optional().describe('Patterns to exclude')
      })
    },
    {
      name: 'get_file_info',
      description: 'Get metadata about a file',
      paramSchema: z.object({
        path: z.string().describe('Path to the file')
      })
    }
  ]
};
