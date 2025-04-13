import { LLMProvider, OpenAIProvider, AnthropicProvider } from './llm';
import { ServerRegistry } from './registry/serverRegistry';
import { QueryRouter } from './router/queryRouter';
import { ToolExecutor } from './executor/toolExecutor';
import { ResponseFormatter } from './formatter/responseFormatter';
import { ConfigManager } from './config/configManager';
import { getDefaultServers } from './servers/defaultServers';
import { ConversationMemory, createMemory, Message } from './memory/conversationMemory';

// Import flow-related components
import { FlowRegistry } from './flow/flowRegistry';
import { FlowExecutor } from './flow/flowExecutor';
import { FlowRouter } from './flow/flowRouter';
import { getDefaultFlows } from './flow/defaultFlows';

export class MCPLLMRouter {
  private llmProvider: LLMProvider;
  private serverRegistry: ServerRegistry;
  private flowRegistry: FlowRegistry;
  queryRouter: QueryRouter; // Changed from private to public
  toolExecutor: ToolExecutor; // Changed from private to public
  private flowRouter: FlowRouter;
  private flowExecutor: FlowExecutor;
  private responseFormatter: ResponseFormatter;
  private memory: ConversationMemory;

  constructor(
    llmProviderType?: 'openai' | 'anthropic',
    memoryType: 'buffer' | 'provider' = 'buffer',
    memoryOptions = {}
  ) {
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

    // Initialize memory
    this.memory = createMemory(memoryType, memoryOptions);

    // Initialize registries
    this.serverRegistry = new ServerRegistry();
    this.flowRegistry = new FlowRegistry();

    // Initialize routers and executors
    this.toolExecutor = new ToolExecutor(this.serverRegistry);
    this.serverRegistry.setToolExecutor(this.toolExecutor); // Set tool executor reference
    
    this.queryRouter = new QueryRouter(this.llmProvider, this.serverRegistry, this.memory);
    this.flowRouter = new FlowRouter(this.llmProvider, this.flowRegistry, this.memory);
    this.flowExecutor = new FlowExecutor(this.flowRegistry, this.llmProvider, this.serverRegistry, this.memory);
    this.responseFormatter = new ResponseFormatter(this.llmProvider, this.memory);
  }

  getServerRegistry(): ServerRegistry {
    return this.serverRegistry;
  }
  
  getFlowRegistry(): FlowRegistry {
    return this.flowRegistry;
  }
  
  /**
   * Register default servers (calculator, direct_answer, filesystem)
   */
  registerDefaultServers(): void {
    const defaultServers = getDefaultServers();
    defaultServers.forEach(server => {
      this.serverRegistry.addServer(server);
    });
  }
  
  /**
   * Register default flows (server_builder, flow_builder)
   */
  registerDefaultFlows(): void {
    const defaultFlows = getDefaultFlows();
    defaultFlows.forEach(flow => {
      this.flowRegistry.addFlow(flow);
    });
  }

  getLLMProvider(): LLMProvider {
    return this.llmProvider;
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    // Update components that use the LLM provider
    this.queryRouter = new QueryRouter(this.llmProvider, this.serverRegistry, this.memory);
    this.flowRouter = new FlowRouter(this.llmProvider, this.flowRegistry, this.memory);
    this.flowExecutor = new FlowExecutor(this.flowRegistry, this.llmProvider, this.serverRegistry, this.memory);
    this.responseFormatter = new ResponseFormatter(this.llmProvider, this.memory);
  }

  // Memory management methods
  getMemory(): ConversationMemory {
    return this.memory;
  }

  clearMemory(): void {
    this.memory.clear();
  }

  addToMemory(role: 'user' | 'assistant' | 'system', content: string): void {
    this.memory.addMessage({ role, content });
  }

  async processQuery(userInput: string): Promise<string> {
    try {
      console.log('\n--- Processing Query ---');
      console.log(`User input: "${userInput}"`);
      
      // Check for special commands
      if (userInput.toLowerCase() === 'list servers') {
        return this.listServers();
      } else if (userInput.toLowerCase() === 'server status') {
        return this.getServerStatus();
      } else if (userInput.toLowerCase().startsWith('activate server ')) {
        const serverId = userInput.substring('activate server '.length).trim();
        return this.activateServer(serverId);
      } else if (userInput.toLowerCase().startsWith('deactivate server ')) {
        const serverId = userInput.substring('deactivate server '.length).trim();
        return this.deactivateServer(serverId);
      }
      
      // Add the user's message to memory
      this.addToMemory('user', userInput);
      
      // First, check if this query should be handled by a flow
      console.log('Checking if query should be handled by a flow...');
      const flowRouting = await this.flowRouter.routeQuery(userInput);
      
      if (flowRouting.shouldUseFlow && flowRouting.flowId) {
        console.log(`Using flow: ${flowRouting.flowId}`);
        
        // Execute the flow
        const flowResult = await this.flowExecutor.executeFlow(
          flowRouting.flowId,
          userInput,
          flowRouting.params
        );
        
        // Add the flow's response to memory
        this.addToMemory('assistant', flowResult.response);
        
        console.log('--- Flow Processing Complete ---\n');
        return flowResult.response;
      }
      
      // If we have a direct response from flow routing, use it
      if (flowRouting.directResponse) {
        this.addToMemory('assistant', flowRouting.directResponse);
        return flowRouting.directResponse;
      }
      
      // Otherwise, proceed with normal tool routing
      console.log('Routing query to tools...');
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
      
      // Add the assistant's response to memory
      this.addToMemory('assistant', formattedResponse);
      
      console.log('--- Query Processing Complete ---\n');
      return formattedResponse;
    } catch (error) {
      // Handle errors
      console.error('Error processing query:', error);
      const errorResponse = await this.responseFormatter.formatError(error as Error, userInput);
      
      // Add the error response to memory
      this.addToMemory('assistant', errorResponse);
      
      return errorResponse;
    }
  }
  
  // Server management methods
  private listServers(): string {
    const servers = this.serverRegistry.getServers();
    if (servers.length === 0) {
      return "No servers are currently registered.";
    }
    
    let response = "Available servers:\n\n";
    servers.forEach(server => {
      const status = server.disabled ? "🔴 Disabled" : "🟢 Active";
      response += `${server.name} (ID: ${server.id}) - ${status}\n`;
      response += `Description: ${server.description}\n`;
      response += "Tools:\n";
      
      server.tools.forEach(tool => {
        response += `- ${tool.name}: ${tool.description}\n`;
      });
      
      response += "\n";
    });
    
    response += "You can manage servers with these commands:\n";
    response += "- 'activate server <id>' - Enable a disabled server\n";
    response += "- 'deactivate server <id>' - Temporarily disable a server\n";
    response += "- 'server status' - Check which servers are active\n";
    
    return response;
  }
  
  private getServerStatus(): string {
    const servers = this.serverRegistry.getServers();
    if (servers.length === 0) {
      return "No servers are currently registered.";
    }
    
    let response = "Server Status:\n\n";
    const active = servers.filter(s => !s.disabled);
    const disabled = servers.filter(s => s.disabled);
    
    response += `Active Servers (${active.length}):\n`;
    active.forEach(server => {
      response += `- ${server.name} (ID: ${server.id})\n`;
    });
    
    response += `\nDisabled Servers (${disabled.length}):\n`;
    disabled.forEach(server => {
      response += `- ${server.name} (ID: ${server.id})\n`;
    });
    
    return response;
  }
  
  private activateServer(serverId: string): string {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    if (!server.disabled) {
      return `Server "${server.name}" is already active.`;
    }
    
    server.disabled = false;
    return `Server "${server.name}" has been activated and is now available for use.`;
  }
  
  private deactivateServer(serverId: string): string {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    if (server.disabled) {
      return `Server "${server.name}" is already disabled.`;
    }
    
    server.disabled = true;
    return `Server "${server.name}" has been deactivated and will not be used for query routing.`;
  }
}

// Export all components for advanced usage
export { ServerRegistry, type MCPServerConfig } from './registry/serverRegistry';
export { LLMProvider, OpenAIProvider, AnthropicProvider } from './llm';
export { QueryRouter } from './router/queryRouter';
export { ToolExecutor } from './executor/toolExecutor';
export { ResponseFormatter } from './formatter/responseFormatter';
export { ConfigManager } from './config/configManager';
export { getDefaultServers } from './servers/defaultServers';
export { FlowRegistry } from './flow/flowRegistry';
export { FlowExecutor } from './flow/flowExecutor';
export { FlowRouter } from './flow/flowRouter';
export { getDefaultFlows } from './flow/defaultFlows';
export { type Flow, type FlowContext, type FlowResult, type FlowParams } from './flow/flowTypes';
