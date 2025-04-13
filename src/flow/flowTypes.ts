import { LLMProvider } from '../llm';
import { ServerRegistry } from '../registry/serverRegistry';
import { ConversationMemory } from '../memory/conversationMemory';

/**
 * Parameters for a flow
 */
export interface FlowParams {
  [key: string]: any;
}

/**
 * Context available to flows during execution
 */
export interface FlowContext {
  llmProvider: LLMProvider;
  serverRegistry: ServerRegistry;
  memory: ConversationMemory;
  userQuery: string;
  params: FlowParams;
}

/**
 * Result of a flow execution
 */
export interface FlowResult {
  response: string;
  metadata?: Record<string, any>;
}

/**
 * Definition of a flow
 */
export interface Flow {
  id: string;
  name: string;
  description: string;
  paramSchema?: Record<string, any>;
  execute: (context: FlowContext) => Promise<FlowResult>;
}
