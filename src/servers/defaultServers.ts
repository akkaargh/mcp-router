import { z } from 'zod';
import { MCPServerConfig } from '../registry/serverRegistry';

/**
 * Default calculator server configuration
 */
export const calculatorServer: MCPServerConfig = {
  id: 'calculator',
  name: 'Calculator',
  description: 'A server that provides mathematical operations',
  connection: {
    type: 'stdio',
    command: 'node',
    args: ['./mcp-servers/calculator-server.js']
  },
  tools: [
    {
      name: 'add',
      description: 'Add two numbers',
      paramSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      })
    },
    {
      name: 'subtract',
      description: 'Subtract two numbers',
      paramSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      })
    },
    {
      name: 'multiply',
      description: 'Multiply two numbers',
      paramSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      })
    },
    {
      name: 'divide',
      description: 'Divide two numbers',
      paramSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number')
      })
    }
  ]
};

/**
 * Direct answer server for handling general knowledge questions
 */
export const directAnswerServer: MCPServerConfig = {
  id: 'direct_answer',
  name: 'Direct Answer',
  description: 'A server that provides direct answers to general knowledge questions',
  connection: {
    type: 'stdio',
    command: 'node',
    args: []
  },
  tools: [
    {
      name: 'answer',
      description: 'Answer a general knowledge question',
      paramSchema: z.object({
        query: z.string().describe('The question to answer')
      })
    }
  ]
};

/**
 * Get all default server configurations
 */
export function getDefaultServers(): MCPServerConfig[] {
  return [calculatorServer, directAnswerServer];
}
