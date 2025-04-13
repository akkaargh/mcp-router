import { MCPLLMRouter, OpenAIProvider } from '../src';

// Mock the OpenAI provider to avoid making actual API calls during tests
jest.mock('../src/llm/openai', () => {
  return {
    OpenAIProvider: jest.fn().mockImplementation(() => {
      return {
        setApiKey: jest.fn(),
        setModel: jest.fn(),
        generateResponse: jest.fn().mockResolvedValue(JSON.stringify({
          serverId: 'calculator',
          toolName: 'add',
          parameters: { a: 5, b: 3 }
        }))
      };
    })
  };
});

describe('MCPLLMRouter', () => {
  let router: MCPLLMRouter;

  beforeEach(() => {
    router = new MCPLLMRouter('openai');
    
    // Add a test server
    router.getServerRegistry().addServer({
      id: 'calculator',
      name: 'Calculator',
      description: 'A calculator server',
      connection: {
        type: 'stdio',
        command: 'node',
        args: ['calculator.js']
      },
      tools: [
        {
          name: 'add',
          description: 'Add two numbers'
        }
      ]
    });
  });

  test('should process a query and return a response', async () => {
    // Mock the response formatter to return a fixed string
    const mockFormatter = {
      formatResponse: jest.fn().mockResolvedValue('The result is 8'),
      formatError: jest.fn().mockResolvedValue('An error occurred')
    };
    
    // @ts-ignore - Accessing private property for testing
    router.responseFormatter = mockFormatter;
    
    const response = await router.processQuery('What is 5 plus 3?');
    
    expect(response).toBe('The result is 8');
    expect(mockFormatter.formatResponse).toHaveBeenCalled();
  });
});
