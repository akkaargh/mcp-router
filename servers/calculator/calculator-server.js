import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Calculator",
  version: "1.0.0"
});

// Add calculator tools with detailed descriptions
server.tool("add",
  { 
    a: z.number().describe("First number to add"),
    b: z.number().describe("Second number to add")
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  }),
  "Add two numbers together. Use this tool for addition operations."
);

// Add description to the tool definition
server.tools.find(t => t.name === "add").description = "Add two numbers together. Use this tool for addition operations.";

server.tool("subtract",
  { 
    a: z.number().describe("Number to subtract from"),
    b: z.number().describe("Number to subtract")
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a - b) }]
  }),
  "Subtract the second number from the first. Use this tool for subtraction operations."
);

// Add description to the tool definition
server.tools.find(t => t.name === "subtract").description = "Subtract the second number from the first. Use this tool for subtraction operations.";

server.tool("multiply",
  { 
    a: z.number().describe("First number to multiply"),
    b: z.number().describe("Second number to multiply")
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }]
  }),
  "Multiply two numbers together. Use this tool for multiplication operations."
);

// Add description to the tool definition
server.tools.find(t => t.name === "multiply").description = "Multiply two numbers together. Use this tool for multiplication operations.";

server.tool("divide",
  { 
    a: z.number().describe("Number to divide (dividend)"),
    b: z.number().describe("Number to divide by (divisor)")
  },
  async ({ a, b }) => {
    if (b === 0) {
      return {
        content: [{ type: "text", text: "Error: Cannot divide by zero" }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: String(a / b) }]
    };
  },
  "Divide the first number by the second. Use this tool for division operations. Returns an error if attempting to divide by zero."
);

// Add description to the tool definition
server.tools.find(t => t.name === "divide").description = "Divide the first number by the second. Use this tool for division operations. Returns an error if attempting to divide by zero.";

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Calculator MCP Server running on stdio");
