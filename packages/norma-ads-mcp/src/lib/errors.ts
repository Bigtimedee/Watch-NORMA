import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export function invalidParams(message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, message);
}

export function internalError(message: string): McpError {
  return new McpError(ErrorCode.InternalError, message);
}

export function unauthorized(message = "Invalid or missing API key"): McpError {
  return new McpError(ErrorCode.InvalidRequest, message);
}

export function notFound(resource: string): McpError {
  return new McpError(ErrorCode.InvalidParams, `${resource} not found`);
}

export function toolError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
