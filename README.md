# MCP LLM Router

A TypeScript library for routing user queries to MCP (Machine Comprehension Protocol) servers using Large Language Models (LLMs).

## Features

- Connect to multiple MCP servers
- Use LLMs to interpret user queries and route them to the appropriate tool
- Support for different LLM providers (OpenAI, Anthropic)
- Format responses in a user-friendly way

## Installation

```bash
npm install mcp-llm-router
```

## Quick Start

```typescript
import { MCPLLMRouter } from 'mcp-llm-router';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a new router instance
const router = new MCPLLMRouter('openai');

// Register an MCP server
router.getServerRegistry().addServer({
  id: 'calculator',
  name: 'Calculator',
  description: 'A server that provides mathematical operations',
  connection: {
    type: 'stdio',
    command: 'node',
    args: ['calculator-server.js']
  },
  tools: [
    {
      name: 'add',
      description: 'Add two numbers'
    },
    {
      name: 'subtract',
      description: 'Subtract two numbers'
    }
  ]
});

// Process a user query
async function main() {
  const userQuery = 'What is 5 plus 3?';
  const response = await router.processQuery(userQuery);
  console.log(response);
}

main().catch(console.error);
```

## Environment Variables

Create a `.env` file in your project root:

```
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
DEFAULT_LLM_PROVIDER=openai
DEFAULT_OPENAI_MODEL=gpt-4
DEFAULT_ANTHROPIC_MODEL=claude-2
LOG_LEVEL=info
```

## Advanced Usage

For more advanced usage, you can directly access the individual components:

```typescript
import { 
  ServerRegistry, 
  OpenAIProvider, 
  QueryRouter, 
  ToolExecutor, 
  ResponseFormatter 
} from 'mcp-llm-router';

// Create components manually
const registry = new ServerRegistry();
const llm = new OpenAIProvider();
llm.setApiKey('your_api_key');

const router = new QueryRouter(llm, registry);
const executor = new ToolExecutor(registry);
const formatter = new ResponseFormatter(llm);

// Use components directly
// ...
```

## License

MIT
