import { LLMProvider } from '../llm';

export class ResponseFormatter {
  constructor(private llmProvider: LLMProvider) {}

  async formatResponse(toolResult: any, userQuery: string): Promise<string> {
    const prompt = `
The user asked: "${userQuery}"

The system executed a tool and got the following result:
${JSON.stringify(toolResult, null, 2)}

Please format this result into a natural, user-friendly response. 
Focus on the most important information and present it in a clear, concise way.
`;

    return await this.llmProvider.generateResponse(prompt);
  }

  async formatError(error: Error, userQuery: string): Promise<string> {
    const prompt = `
The user asked: "${userQuery}"

The system encountered an error:
${error.message}

Please format this error into a helpful, user-friendly response that explains what went wrong
and possibly suggests alternatives or next steps.
`;

    return await this.llmProvider.generateResponse(prompt);
  }
}
