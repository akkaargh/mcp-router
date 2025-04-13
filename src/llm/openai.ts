import { LLMProvider } from './index';

export class OpenAIProvider implements LLMProvider {
  private apiKey: string = '';
  private model: string = 'gpt-4';

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async generateResponse(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not set');
    }

    try {
      // This is a simplified implementation
      // In a real implementation, you would use the OpenAI SDK
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error generating response from OpenAI:', error);
      throw error;
    }
  }
}
