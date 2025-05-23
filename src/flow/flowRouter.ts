import { LLMProvider } from '../llm';
import { FlowRegistry } from './flowRegistry';
import { ConversationMemory } from '../memory/conversationMemory';
import { Flow, FlowParams } from './flowTypes';

/**
 * Result of flow routing
 */
interface FlowRoutingResult {
  shouldUseFlow: boolean;
  flowId?: string;
  params?: FlowParams;
  directResponse?: string;
}

/**
 * Routes user queries to flows
 */
export class FlowRouter {
  constructor(
    private llmProvider: LLMProvider,
    private registry: FlowRegistry,
    private memory: ConversationMemory
  ) {}

  /**
   * Get a formatted description of all available flows
   */
  private getFlowsDescription(): string {
    const flows = this.registry.getFlows();
    let flowsDescription = '';
    
    flows.forEach(flow => {
      flowsDescription += `Flow: ${flow.name} (ID: ${flow.id})\n`;
      flowsDescription += `Description: ${flow.description}\n`;
      
      if (flow.paramSchema) {
        flowsDescription += 'Parameters:\n';
        Object.entries(flow.paramSchema).forEach(([paramName, schema]) => {
          // Cast to any to access the description property safely
          const description = (schema as any).description || '';
          flowsDescription += `  - ${paramName}: ${description}\n`;
        });
      }
      
      flowsDescription += '\n';
    });
    
    return flowsDescription;
  }

  /**
   * Get formatted conversation history
   */
  private getConversationHistoryText(): string {
    const conversationHistory = this.memory.getMessages();
    let historyText = '';
    
    if (conversationHistory.length > 0) {
      historyText = 'Conversation History:\n';
      conversationHistory.forEach(msg => {
        historyText += `${msg.role}: ${msg.content}\n`;
      });
      historyText += '\n';
    }
    
    return historyText;
  }

  /**
   * Determine if a user query should be handled by a flow
   */
  async routeQuery(userInput: string): Promise<FlowRoutingResult> {
    // Get formatted flow descriptions and conversation history
    const flowsDescription = this.getFlowsDescription();
    const historyText = this.getConversationHistoryText();
    
    // First, check if this is a server listing request that should NOT be handled by a flow
    if (userInput.toLowerCase().includes("list mcp servers") || 
        userInput.toLowerCase().includes("list the mcp servers") ||
        userInput.toLowerCase().includes("list servers for this") ||
        userInput.toLowerCase().includes("show mcp servers") ||
        userInput.toLowerCase().includes("show the mcp servers") ||
        userInput.toLowerCase().includes("what mcp servers") ||
        (userInput.toLowerCase().includes("list") && userInput.toLowerCase().includes("servers") && 
         (userInput.toLowerCase().includes("app") || userInput.toLowerCase().includes("application") || 
          userInput.toLowerCase().includes("program")))) {
      // This is likely a request to list servers, not create a new one
      return { shouldUseFlow: false };
    }
    
    // Construct the prompt for the LLM
    const prompt = `
You are an intelligent assistant designed to determine whether a user's query requires invoking a specialized flow or should be handled by the regular tool routing system.

${historyText}
User input: "${userInput}"

Available Flows:
${flowsDescription}

IMPORTANT GUIDELINES:
- If the user is asking to list, show, or get information about MCP servers in this application, do NOT use a flow. These requests should be handled by the regular tool routing system.
- Only use the server_builder flow if the user explicitly wants to CREATE a new server, not if they want to LIST existing servers.
- Only use the flow_builder flow if the user explicitly wants to CREATE a new flow, not if they want information about flows.

Based on the above, decide whether to:
1. Invoke a specific flow to handle the user's request
2. Process the query through the regular tool routing system

Respond in the following JSON format:

{
  "shouldUseFlow": true | false,
  "flowId": "flow_id_if_applicable",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "reasoning": "Explanation of why this decision is appropriate."
}

Notes:
- If shouldUseFlow is false, the flowId and params fields can be omitted.
- Only set shouldUseFlow to true if the user's query clearly indicates they want to CREATE or BUILD something new.
- Extract any relevant parameters from the user's query to pass to the flow.
- Remember: Requests to LIST or SHOW existing servers should return shouldUseFlow: false.
`;

    try {
      // Get the LLM's decision
      const response = await this.llmProvider.generateResponse(prompt);
      
      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { shouldUseFlow: false };
      }
      
      const decision = JSON.parse(jsonMatch[0]);
      
      // Validate the decision
      if (typeof decision.shouldUseFlow !== 'boolean') {
        return { shouldUseFlow: false };
      }
      
      if (decision.shouldUseFlow) {
        // Validate that the flow exists
        const flow = this.registry.getFlowById(decision.flowId);
        if (!flow) {
          return {
            shouldUseFlow: false,
            directResponse: `I couldn't find a flow with ID "${decision.flowId}". Let me try to help you another way.`
          };
        }
        
        return {
          shouldUseFlow: true,
          flowId: decision.flowId,
          params: decision.params || {}
        };
      }
      
      return { shouldUseFlow: false };
    } catch (error) {
      console.error('Error in flow routing:', error);
      return { shouldUseFlow: false };
    }
  }
}
