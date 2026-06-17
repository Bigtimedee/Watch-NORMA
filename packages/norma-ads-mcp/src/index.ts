#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getApiKey } from "./lib/auth.js";
import { createNormaServer } from "./server-factory.js";

const server = createNormaServer();

async function main() {
  // Validate API key is configured before accepting connections
  try {
    getApiKey();
  } catch {
    process.stderr.write(
      "Error: NORMA_API_KEY environment variable is not set.\n" +
        "Get your API key at https://getnorma.app/developers\n"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("norma-ads-mcp server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
