import { LLMProvider, OpenAIProvider, AnthropicProvider } from './llm';
import { ServerRegistry } from './registry/serverRegistry';
import { QueryRouter } from './router/queryRouter';
import { ToolExecutor } from './executor/toolExecutor';
import { ResponseFormatter } from './formatter/responseFormatter';
import { ConfigManager } from './config/configManager';

export class MCPLLMRouter {
  private llmProvider: LLMProvider;
  private serverRegistry: ServerRegistry;
  queryRouter: QueryRouter; // Changed from private to public
  toolExecutor: ToolExecutor; // Changed from private to public
  private responseFormatter: ResponseFormatter;

  constructor(llmProviderType?: 'openai' | 'anthropic') {
    // Initialize the LLM provider
    const providerType = llmProviderType || ConfigManager.getDefaultLLMProvider() as 'openai' | 'anthropic';
    
    if (providerType === 'openai') {
      this.llmProvider = new OpenAIProvider();
      this.llmProvider.setApiKey(ConfigManager.getOpenAIApiKey());
      this.llmProvider.setModel(ConfigManager.getDefaultOpenAIModel());
    } else if (providerType === 'anthropic') {
      this.llmProvider = new AnthropicProvider();
      this.llmProvider.setApiKey(ConfigManager.getAnthropicApiKey());
      this.llmProvider.setModel(ConfigManager.getDefaultAnthropicModel());
    } else {
      throw new Error(`Unsupported LLM provider: ${providerType}`);
    }

    // Initialize other components
    this.serverRegistry = new ServerRegistry();
    this.queryRouter = new QueryRouter(this.llmProvider, this.serverRegistry);
    this.toolExecutor = new ToolExecutor(this.serverRegistry);
    this.responseFormatter = new ResponseFormatter(this.llmProvider);
  }

  getServerRegistry(): ServerRegistry {
    return this.serverRegistry;
  }

  getLLMProvider(): LLMProvider {
    return this.llmProvider;
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    // Update components that use the LLM provider
    this.queryRouter = new QueryRouter(this.llmProvider, this.serverRegistry);
    this.responseFormatter = new ResponseFormatter(this.llmProvider);
  }

  async processQuery(userInput: string): Promise<string> {
    try {
      console.log('\n--- Processing Query ---');
      console.log(`User input: "${userInput}"`);
      
      // Route the query to determine which tool to use
      console.log('Routing query...');
      const routingInfo = await this.queryRouter.routeQuery(userInput);
      console.log('Routing complete:', {
        serverId: routingInfo.serverId,
        toolName: routingInfo.toolName,
        parameterCount: Object.keys(routingInfo.parameters).length
      });
      
      // Execute the tool
      console.log(`Executing tool: ${routingInfo.toolName} on server: ${routingInfo.serverId}`);
      const result = await this.toolExecutor.execute(
        routingInfo.serverId,
        routingInfo.toolName,
        routingInfo.parameters
      );
      console.log('Tool execution complete');
      
      // Format the response
      console.log('Formatting response...');
      const formattedResponse = await this.responseFormatter.formatResponse(result, userInput);
      console.log('--- Query Processing Complete ---\n');
      return formattedResponse;
    } catch (error) {
      // Handle errors
      console.error('Error processing query:', error);
      return await this.responseFormatter.formatError(error as Error, userInput);
    }
  }
}

// Export all components for advanced usage
export { ServerRegistry, type MCPServerConfig } from './registry/serverRegistry';
export { LLMProvider, OpenAIProvider, AnthropicProvider } from './llm';
export { QueryRouter } from './router/queryRouter';
export { ToolExecutor } from './executor/toolExecutor';
export { ResponseFormatter } from './formatter/responseFormatter';
export { ConfigManager } from './config/configManager';
