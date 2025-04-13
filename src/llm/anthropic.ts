import { LLMProvider } from './index';

export class AnthropicProvider implements LLMProvider {
  private apiKey: string = '';
  private model: string = 'claude-2';

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async generateResponse(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not set');
    }

    try {
      // This is a simplified implementation
      // In a real implementation, you would use the Anthropic SDK
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        })
      });

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Error generating response from Anthropic:', error);
      throw error;
    }
  }
}
