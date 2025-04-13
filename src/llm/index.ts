export interface LLMProvider {
  setApiKey(apiKey: string): void;
  setModel(model: string): void;
  generateResponse(prompt: string): Promise<string>;
}

export * from './openai';
export * from './anthropic';
