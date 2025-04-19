import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Calculator",
  version: "1.0.0"
});

// Define tool schemas with descriptions
const addSchema = {
  a: z.number().describe("First number to add"),
  b: z.number().describe("Second number to add")
};

const subtractSchema = {
  a: z.number().describe("Number to subtract from"),
  b: z.number().describe("Number to subtract")
};

const multiplySchema = {
  a: z.number().describe("First number to multiply"),
  b: z.number().describe("Second number to multiply")
};

const divideSchema = {
  a: z.number().describe("Number to divide (dividend)"),
  b: z.number().describe("Number to divide by (divisor)")
};

// Add calculator tools with detailed descriptions
const addTool = server.tool(
  "add",
  addSchema,
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);
// Set description explicitly
addTool.description = "Add two numbers together. Use this tool for addition operations.";

const subtractTool = server.tool(
  "subtract",
  subtractSchema,
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a - b) }]
  })
);
subtractTool.description = "Subtract the second number from the first. Use this tool for subtraction operations.";

const multiplyTool = server.tool(
  "multiply",
  multiplySchema,
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }]
  })
);
multiplyTool.description = "Multiply two numbers together. Use this tool for multiplication operations.";

const divideTool = server.tool(
  "divide",
  divideSchema,
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
  }
);
divideTool.description = "Divide the first number by the second. Use this tool for division operations. Returns an error if attempting to divide by zero.";

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Calculator MCP Server running on stdio");
