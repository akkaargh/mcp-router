import { FlowRegistry } from './flowRegistry';
import { Flow, FlowContext, FlowResult, FlowParams } from './flowTypes';
import { LLMProvider } from '../llm';
import { ServerRegistry } from '../registry/serverRegistry';
import { ConversationMemory } from '../memory/conversationMemory';

/**
 * Executes flows
 */
export class FlowExecutor {
  constructor(
    private registry: FlowRegistry,
    private llmProvider: LLMProvider,
    private serverRegistry: ServerRegistry,
    private memory: ConversationMemory
  ) {}

  /**
   * Execute a flow by ID
   */
  async executeFlow(
    flowId: string, 
    userQuery: string,
    params: FlowParams = {}
  ): Promise<FlowResult> {
    // Get the flow
    const flow = this.registry.getFlowById(flowId);
    if (!flow) {
      throw new Error(`Flow with ID ${flowId} not found`);
    }

    // Create the flow context
    const context: FlowContext = {
      llmProvider: this.llmProvider,
      serverRegistry: this.serverRegistry,
      memory: this.memory,
      userQuery,
      params,
      toolExecutor: this.serverRegistry.getToolExecutor() // Pass the tool executor for file operations
    };

    // Execute the flow
    return await flow.execute(context);
  }
}
