import { LLMProvider } from '../llm';
import { ConversationMemory } from '../memory/conversationMemory';

export class ResponseFormatter {
  constructor(
    private llmProvider: LLMProvider,
    private memory?: ConversationMemory  // Add memory as an optional parameter
  ) {}

  private getConversationHistoryText(): string {
    if (!this.memory) return '';
    
    const conversationHistory = this.memory.getMessages();
    let historyText = '';
    
    if (conversationHistory.length > 0) {
      historyText = 'Conversation History:\n';
      conversationHistory.forEach(msg => {
        historyText += `${msg.role}: ${msg.content}\n`;
      });
      historyText += '\n';
    }
    
    return historyText;
  }

  async formatResponse(toolResult: any, userQuery: string): Promise<string> {
    const historyText = this.getConversationHistoryText();
    
    const prompt = `
${historyText}
The user asked: "${userQuery}"

The system executed a tool and got the following result:
${JSON.stringify(toolResult, null, 2)}

Please format this result into a natural, user-friendly response. 
Focus on the most important information and present it in a clear, concise way.
If the user's query refers to previous parts of the conversation, make sure to acknowledge that context in your response.
`;

    return await this.llmProvider.generateResponse(prompt);
  }

  async formatError(error: Error, userQuery: string): Promise<string> {
    const historyText = this.getConversationHistoryText();
    
    const prompt = `
${historyText}
The user asked: "${userQuery}"

The system encountered an error:
${error.message}

Please format this error into a helpful, user-friendly response that explains what went wrong
and possibly suggests alternatives or next steps.
If the user's query refers to previous parts of the conversation, make sure to acknowledge that context in your response.
`;

    return await this.llmProvider.generateResponse(prompt);
  }
}
