export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MemoryOptions {
  maxMessages?: number;
  includeSystemMessages?: boolean;
}

export interface ConversationMemory {
  addMessage(message: Message): void;
  getMessages(): Message[];
  clear(): void;
}

/**
 * Simple buffer-based conversation memory that stores the entire conversation history
 */
export class BufferMemory implements ConversationMemory {
  private messages: Message[] = [];
  private maxMessages: number;
  private includeSystemMessages: boolean;

  constructor(options: MemoryOptions = {}) {
    this.maxMessages = options.maxMessages || 10;
    this.includeSystemMessages = options.includeSystemMessages !== false;
  }

  addMessage(message: Message): void {
    // Only add the message if it's a user/assistant message or if we're including system messages
    if (message.role !== 'system' || this.includeSystemMessages) {
      this.messages.push(message);
      
      // Trim the history if it exceeds the maximum number of messages
      if (this.messages.length > this.maxMessages) {
        this.messages = this.messages.slice(this.messages.length - this.maxMessages);
      }
    }
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}

/**
 * Factory function to create the appropriate memory implementation
 */
export function createMemory(type: 'buffer' | 'provider' = 'buffer', options: MemoryOptions = {}): ConversationMemory {
  switch (type) {
    case 'buffer':
      return new BufferMemory(options);
    case 'provider':
      // In the future, this could return a provider-specific implementation
      console.warn('Provider-managed memory not yet implemented, falling back to buffer memory');
      return new BufferMemory(options);
    default:
      return new BufferMemory(options);
  }
}
