import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/shared/protocol.js";

/**
 * Calculator MCP Server
 * 
 * A simple MCP server that provides basic arithmetic operations.
 * Supports addition, subtraction, multiplication, and division.
 */

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

/**
 * Tool definitions with complete metadata
 */
const ADD_TOOL = {
  name: "add",
  description: "Add two numbers together. Use this tool for addition operations.",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number", description: "First number to add" },
      b: { type: "number", description: "Second number to add" }
    },
    required: ["a", "b"]
  }
};

const SUBTRACT_TOOL = {
  name: "subtract",
  description: "Subtract the second number from the first. Use this tool for subtraction operations.",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number", description: "Number to subtract from" },
      b: { type: "number", description: "Number to subtract" }
    },
    required: ["a", "b"]
  }
};

const MULTIPLY_TOOL = {
  name: "multiply",
  description: "Multiply two numbers together. Use this tool for multiplication operations.",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number", description: "First number to multiply" },
      b: { type: "number", description: "Second number to multiply" }
    },
    required: ["a", "b"]
  }
};

const DIVIDE_TOOL = {
  name: "divide",
  description: "Divide the first number by the second. Use this tool for division operations. Returns an error if attempting to divide by zero.",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number", description: "Number to divide (dividend)" },
      b: { type: "number", description: "Number to divide by (divisor)" }
    },
    required: ["a", "b"]
  }
};

/**
 * Helper function to validate and convert input values
 * Ensures inputs are proper numbers and handles string number inputs
 */
function validateNumericInput(value) {
  if (typeof value === 'string') {
    // Try to convert string to number
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid numeric input: "${value}"`);
    }
    return num;
  } else if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      throw new Error(`Invalid numeric input: ${value}`);
    }
    return value;
  }
  throw new Error(`Expected number but got ${typeof value}`);
}

// Add calculator tools with enhanced error handling and input validation
server.tool(
  "add",
  addSchema,
  async ({ a, b }) => {
    try {
      // Validate and convert inputs
      const validA = validateNumericInput(a);
      const validB = validateNumericInput(b);
      
      // Perform calculation
      const result = validA + validB;
      
      // Check for overflow
      if (!isFinite(result)) {
        return {
          content: [{ type: "text", text: "Error: Calculation resulted in an overflow" }],
          isError: true
        };
      }
      
      return {
        content: [{ type: "text", text: String(result) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "subtract",
  subtractSchema,
  async ({ a, b }) => {
    try {
      // Validate and convert inputs
      const validA = validateNumericInput(a);
      const validB = validateNumericInput(b);
      
      // Perform calculation
      const result = validA - validB;
      
      return {
        content: [{ type: "text", text: String(result) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "multiply",
  multiplySchema,
  async ({ a, b }) => {
    try {
      // Validate and convert inputs
      const validA = validateNumericInput(a);
      const validB = validateNumericInput(b);
      
      // Perform calculation
      const result = validA * validB;
      
      // Check for overflow
      if (!isFinite(result)) {
        return {
          content: [{ type: "text", text: "Error: Calculation resulted in an overflow" }],
          isError: true
        };
      }
      
      return {
        content: [{ type: "text", text: String(result) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "divide",
  divideSchema,
  async ({ a, b }) => {
    try {
      // Validate and convert inputs
      const validA = validateNumericInput(a);
      const validB = validateNumericInput(b);
      
      // Check for division by zero
      if (validB === 0) {
        return {
          content: [{ type: "text", text: "Error: Cannot divide by zero" }],
          isError: true
        };
      }
      
      // Perform calculation
      const result = validA / validB;
      
      return {
        content: [{ type: "text", text: String(result) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Set up the list_tools request handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ADD_TOOL, SUBTRACT_TOOL, MULTIPLY_TOOL, DIVIDE_TOOL],
}));

// Log server startup
console.error("Starting Calculator MCP Server...");

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Calculator MCP Server running on stdio");
