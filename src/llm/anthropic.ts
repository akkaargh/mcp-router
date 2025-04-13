import { LLMProvider } from './index';

export class AnthropicProvider implements LLMProvider {
  private apiKey: string = '';
  private model: string = 'claude-3-sonnet-20240229';

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
      
      // Check for errors in the response
      if (data.error) {
        console.error('Anthropic API error details:', JSON.stringify(data.error, null, 2));
        throw new Error(`Anthropic API error: ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      // Handle the response format correctly
      if (data.content && Array.isArray(data.content) && data.content.length > 0) {
        return data.content[0].text;
      } else if (data.completion) {
        // Fallback for older API versions
        return data.completion;
      } else {
        console.log('Unexpected Anthropic API response format:', JSON.stringify(data, null, 2));
        return data.content?.[0]?.text || data.completion || JSON.stringify(data);
      }
    } catch (error) {
      console.error('Error generating response from Anthropic:', error);
      throw error;
    }
  }
}
