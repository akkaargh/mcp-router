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
   * Register default servers (calculator, filesystem)
   */
  async registerDefaultServers(): Promise<void> {
    const defaultServers = getDefaultServers();
    for (const server of defaultServers) {
      await this.serverRegistry.addServer(server);
    }
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
      // Simplified processing start log
      console.log('\n--- Processing Query ---');
      
      // Add the user's message to memory
      this.addToMemory('user', userInput);
      
      // First, check if this query should be handled by a flow
      const flowRouting = await this.flowRouter.routeQuery(userInput);
      
      if (flowRouting.shouldUseFlow && flowRouting.flowId) {
        console.log(`Using flow: ${flowRouting.flowId}`);
        
        // Execute the flow
        const flowResult = await this.flowExecutor.executeFlow(
          flowRouting.flowId,
          userInput,
          flowRouting.params
        );
        
        // Check if the flow is redirecting to a server action
        if (flowResult.metadata?.shouldRedirect && flowResult.metadata?.redirectAction) {
          console.log(`Flow redirecting to action: ${flowResult.metadata.redirectAction}`);
          
          // Handle the redirection based on the action
          switch (flowResult.metadata.redirectAction) {
            case 'list_servers':
              console.log('Redirecting to list servers action');
              const serversResponse = this.listServers();
              this.addToMemory('assistant', serversResponse);
              return serversResponse;
            default:
              // For other actions, just continue with the flow response
              break;
          }
        }
        
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
      const routingInfo = await this.queryRouter.routeQuery(userInput);
      
      // Handle different actions based on the LLM's decision
      switch (routingInfo.action) {
        case 'respond_directly':
        case 'direct_response':
          // Handle direct response
          // Direct response - no need for verbose logging
          const directResponse = routingInfo.response || 'I understand your request.';
          this.addToMemory('assistant', directResponse);
          return directResponse;
          
        case 'call_tool':
          // Execute the tool
          if (!routingInfo.tool) {
            throw new Error('Tool information missing for call_tool action');
          }
          
          console.log(`\n--- MCP Server Tool Call: ${routingInfo.tool.serverId}.${routingInfo.tool.name} ---`);
          
          if (routingInfo.tool.missing_parameters.length > 0) {
            // Use LLM to create a natural language request for the missing parameters
            const missingParamsPrompt = `
The user asked: "${userInput}"

I need to use the ${routingInfo.tool.name} tool from the ${routingInfo.tool.serverId} server, but I'm missing these parameters: ${routingInfo.tool.missing_parameters.join(', ')}.

Respond directly to the user in a natural, conversational way asking for the missing values.
For example, instead of saying "Please provide values for: a, b", say something like "Could you tell me the two numbers you'd like to add?"

DO NOT start your response with phrases like "Here's a natural way to ask..." or "Certainly! Here's...".
Just respond as if you are directly asking the user for the information.
`;
            console.log(`Requesting missing parameters: ${routingInfo.tool.missing_parameters.join(', ')}`);
            const missingParamsResponse = await this.responseFormatter.generateResponse(missingParamsPrompt);
            
            this.addToMemory('assistant', missingParamsResponse);
            return missingParamsResponse;
          }
          
          try {
            const result = await this.toolExecutor.execute(
              routingInfo.tool.serverId,
              routingInfo.tool.name,
              routingInfo.tool.parameters
            );
            
            console.log(`Tool execution complete`);
            
            // Format the response
            const formattedResponse = await this.responseFormatter.formatResponse(result, userInput);
            
            this.addToMemory('assistant', formattedResponse);
            return formattedResponse;
          } catch (error) {
            console.error(`Error executing tool:`, error);
            throw error;
          }
          
        case 'list_servers':
          // List all servers
          const serversResponse = this.listServers();
          this.addToMemory('assistant', serversResponse);
          return serversResponse;
          
        case 'server_status':
          // Get server status
          const statusResponse = this.getServerStatus();
          this.addToMemory('assistant', statusResponse);
          return statusResponse;
          
        case 'activate_server':
          // Activate a server
          if (!routingInfo.server?.id) {
            throw new Error('Server ID missing for activate_server action');
          }
          
          console.log(`Activating server: ${routingInfo.server.id}`);
          const activateResponse = this.activateServerCommand(routingInfo.server.id);
          this.addToMemory('assistant', activateResponse);
          return activateResponse;
          
        case 'deactivate_server':
          // Deactivate a server
          if (!routingInfo.server?.id) {
            throw new Error('Server ID missing for deactivate_server action');
          }
          
          console.log(`Deactivating server: ${routingInfo.server.id}`);
          const deactivateResponse = this.deactivateServerCommand(routingInfo.server.id);
          this.addToMemory('assistant', deactivateResponse);
          return deactivateResponse;
          
        case 'remove_server':
          // Remove a server
          if (!routingInfo.server?.id) {
            throw new Error('Server ID missing for remove_server action');
          }
          
          console.log(`Removing server: ${routingInfo.server.id}`);
          const deleteFiles = routingInfo.server.deleteFiles || false;
          const removeResponse = this.removeServerCommand(routingInfo.server.id, deleteFiles);
          this.addToMemory('assistant', removeResponse);
          return removeResponse;
          
        case 'install_server':
          // Install server dependencies
          if (!routingInfo.server?.id) {
            throw new Error('Server ID missing for install_server action');
          }
          
          console.log(`Installing dependencies for server: ${routingInfo.server.id}`);
          const installResponse = await this.installServerDependenciesCommand(routingInfo.server.id);
          this.addToMemory('assistant', installResponse);
          return installResponse;
          
        default:
          // Unknown action
          const errorMsg = `Unknown action: ${routingInfo.action}`;
          console.error(errorMsg);
          const errorResponse = `I'm not sure how to process that request. Please try again with a different query.`;
          this.addToMemory('assistant', errorResponse);
          return errorResponse;
      }
    } catch (error) {
      // Handle errors
      console.error('Error processing query:', error);
      
      // Handle error more concisely
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Error: ${errorMessage}`);
      const errorResponse = await this.responseFormatter.formatError(error instanceof Error ? error : new Error(String(error)), userInput);
      
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
      
      if (server.path) {
        response += `Path: ${server.path}\n`;
      }
      
      response += "Tools:\n";
      
      server.tools.forEach(tool => {
        response += `- ${tool.name}: ${tool.description}\n`;
      });
      
      response += "\n";
    });
    
    response += "You can manage servers with these commands:\n";
    response += "- Ask to 'list servers' - Show all available servers\n";
    response += "- Ask for 'server status' - Check which servers are active\n";
    response += "- Ask to 'activate server <id>' - Enable a disabled server\n";
    response += "- Ask to 'deactivate server <id>' - Temporarily disable a server\n";
    response += "- Ask to 'remove server <id>' - Remove a server from the registry\n";
    response += "- Ask to 'remove server <id> and delete files' - Remove a server and delete its files\n";
    response += "- Ask to 'install dependencies for server <id>' - Install dependencies for a server\n";
    
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
  
  private activateServerCommand(serverId: string): string {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    if (!server.disabled) {
      return `Server "${server.name}" is already active.`;
    }
    
    this.serverRegistry.activateServer(serverId);
    return `Server "${server.name}" has been activated and is now available for use.`;
  }
  
  private deactivateServerCommand(serverId: string): string {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    if (server.disabled) {
      return `Server "${server.name}" is already disabled.`;
    }
    
    this.serverRegistry.deactivateServer(serverId);
    return `Server "${server.name}" has been deactivated and will not be used for query routing.`;
  }
  
  private removeServerCommand(serverId: string, deleteFiles: boolean): string {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    const serverName = server.name;
    const result = this.serverRegistry.removeServer(serverId, deleteFiles);
    
    if (result) {
      if (deleteFiles) {
        return `Server "${serverName}" has been removed from the registry and its files have been deleted.`;
      } else {
        return `Server "${serverName}" has been removed from the registry. The server files are still on disk.`;
      }
    } else {
      return `Failed to remove server "${serverName}". Please try again.`;
    }
  }
  
  private async installServerDependenciesCommand(serverId: string): Promise<string> {
    const server = this.serverRegistry.getServerById(serverId);
    if (!server) {
      return `Server with ID "${serverId}" not found. Use 'list servers' to see available servers.`;
    }
    
    try {
      const result = await this.serverRegistry.installServerDependencies(serverId);
      if (result) {
        return `Dependencies for server "${server.name}" have been successfully installed.`;
      } else {
        return `Failed to install dependencies for server "${server.name}". Please check the server path and try again.`;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Error installing dependencies for server "${server.name}": ${errorMessage}`;
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
export { getDefaultServers } from './servers/defaultServers';
export { FlowRegistry } from './flow/flowRegistry';
export { FlowExecutor } from './flow/flowExecutor';
export { FlowRouter } from './flow/flowRouter';
export { getDefaultFlows } from './flow/defaultFlows';
export { type Flow, type FlowContext, type FlowResult, type FlowParams } from './flow/flowTypes';
