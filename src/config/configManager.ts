export class ConfigManager {
  static getOpenAIApiKey(): string {
    return process.env.OPENAI_API_KEY || '';
  }

  static getAnthropicApiKey(): string {
    return process.env.ANTHROPIC_API_KEY || '';
  }

  static getDefaultLLMProvider(): string {
    return process.env.DEFAULT_LLM_PROVIDER || 'openai';
  }

  static getDefaultOpenAIModel(): string {
    return process.env.DEFAULT_OPENAI_MODEL || 'gpt-4';
  }

  static getDefaultAnthropicModel(): string {
    return process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-3-7-sonnet-20240620';
  }

  static getLogLevel(): string {
    return process.env.LOG_LEVEL || 'info';
  }
}
