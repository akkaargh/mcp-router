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
    serverName: z.string().optional().describe('Name for the new server')
  },
  
  execute: async (context: FlowContext): Promise<FlowResult> => {
    const { llmProvider, userQuery, params } = context;
    
    // If this is the first interaction, provide an introduction
    if (!params.stage || params.stage === 'intro') {
      const prompt = `
The user wants to create a new MCP server. They said: "${userQuery}"

Based on this, what type of server might they want to create? Provide a helpful response that:
1. Acknowledges their request
2. Suggests what kind of server they might want to build
3. Asks for more details about the server's functionality
4. Explains that you can help them create the server code

Keep your response conversational and helpful.
`;
      
      const response = await llmProvider.generateResponse(prompt);
      
      return {
        response,
        metadata: {
          stage: 'requirements',
          serverType: params.serverType || ''
        }
      };
    }
    
    // More stages would be implemented here for the complete flow
    // This is a simplified version for demonstration
    
    return {
      response: "I'm still learning how to build servers. Let's continue this conversation to design your server.",
      metadata: {
        stage: 'requirements'
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
