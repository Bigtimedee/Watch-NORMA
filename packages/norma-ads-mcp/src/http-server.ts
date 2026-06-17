#!/usr/bin/env node
import express from "express";
import type { Server as HttpServer } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { validateApiKey } from "./lib/auth.js";
import { createNormaServer } from "./server-factory.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

// Active SSE sessions: sessionId -> transport
const sessions = new Map<string, SSEServerTransport>();

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  // CORS — allow any agent origin
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check — no auth required
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "norma-ads-mcp",
      version: "1.0.0",
      transport: "http-sse",
      sessions: sessions.size,
    });
  });

  // SSE endpoint — client opens a persistent connection here
  app.get("/sse", async (req, res) => {
    // validateApiKey silently passes when headerValue is null (stdio bypass),
    // so we must check header presence explicitly in the HTTP context.
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      validateApiKey(authHeader);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const transport = new SSEServerTransport("/message", res);
    const server = createNormaServer();

    sessions.set(transport.sessionId, transport);
    transport.onclose = () => sessions.delete(transport.sessionId);

    await server.connect(transport);
  });

  // Message endpoint — client sends JSON-RPC messages here
  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return app;
}

export interface ServerHandle {
  close(): Promise<void>;
}

export function startServer(port: number): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const app = buildApp();
    const httpServer: HttpServer = app.listen(port, () => {
      process.stdout.write(`norma-ads-mcp HTTP server listening on port ${port}\n`);

      // Track open sockets so SSE connections don't block graceful shutdown
      const sockets = new Set<import("net").Socket>();
      httpServer.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });

      resolve({
        close(): Promise<void> {
          return new Promise((res, rej) => {
            // Destroy open sockets (including long-lived SSE connections)
            for (const socket of sockets) socket.destroy();
            httpServer.close((err) => {
              if (err) rej(err);
              else res();
            });
          });
        },
      });
    });
    httpServer.on("error", reject);
  });
}

// Auto-start when executed directly: node dist/http-server.js
if (require.main === module) {
  startServer(PORT).catch((err: Error) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
