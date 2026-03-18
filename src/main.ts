#!/usr/bin/env node

// Version is automatically updated during release process
export const VERSION = "0.1.0";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import express from "express";
import { createTools } from "./tools/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Store active transports for SSE connections (legacy)
const sseTransports = new Map<string, SSEServerTransport>();

// Store active transports for Streamable HTTP connections
const streamableTransports = new Map<string, StreamableHTTPServerTransport>();

function createServer() {
	const server = new Server(
		{
			name: "Evolution API MCP Server",
			version: VERSION,
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	const tools = createTools();

	// Register tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: tools.map(({ handler, ...tool }) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			})),
		};
	});

	// Register tool handlers
	server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
		try {
			const { name, arguments: args } = request.params;
			const tool = tools.find((t) => t.name === name);

			if (!tool) {
				throw new Error(`Unknown tool: ${name}`);
			}

			try {
				return await tool.handler(args);
			} catch (error) {
				if (error instanceof Error &&
					(error.message.includes('EVOLUTION_API_KEY') ||
						error.message.includes('EVOLUTION_API_URL'))) {
					return {
						content: [
							{
								type: "text",
								text: "Authentication required: Please provide your Evolution API credentials in the configuration settings.",
							},
						],
						isError: true,
					};
				}
				throw error;
			}
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			};
		}
	});

	return server;
}

// Health check endpoint
app.get("/health", (_req, res) => {
	res.json({ status: "ok", version: VERSION });
});

// =============================================================================
// Streamable HTTP transport (modern protocol - used by Claude Code 2.1.76+)
// =============================================================================

// Handle POST /mcp - messages from client (including initialization)
app.post("/mcp", express.json(), async (req, res) => {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;

	// If we have an existing session, route to it
	if (sessionId && streamableTransports.has(sessionId)) {
		const transport = streamableTransports.get(sessionId)!;
		await transport.handleRequest(req, res, req.body);
		return;
	}

	// New session - create transport and server
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
	});

	const server = createServer();
	await server.connect(transport);

	transport.onclose = () => {
		const sid = transport.sessionId;
		if (sid) {
			streamableTransports.delete(sid);
		}
		// Nullify onclose before server.close() to prevent infinite recursion
		// (server.close -> transport.close -> onclose -> server.close -> ...)
		transport.onclose = undefined;
		server.close().catch(console.error);
	};

	// Handle the current request FIRST â sessionId is generated during handleRequest
	await transport.handleRequest(req, res, req.body);

	// Store transport AFTER handleRequest so sessionId is available
	const newSessionId = transport.sessionId;
	if (newSessionId) {
		streamableTransports.set(newSessionId, transport);
	}
});

// Handle GET /mcp - SSE stream for server-initiated messages
app.get("/mcp", async (req, res) => {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;

	if (!sessionId || !streamableTransports.has(sessionId)) {
		res.status(400).json({ error: "Invalid or missing session ID" });
		return;
	}

	const transport = streamableTransports.get(sessionId)!;
	await transport.handleRequest(req, res);
});

// Handle DELETE /mcp - session termination
app.delete("/mcp", async (req, res) => {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;

	if (!sessionId || !streamableTransports.has(sessionId)) {
		res.status(400).json({ error: "Invalid or missing session ID" });
		return;
	}

	const transport = streamableTransports.get(sessionId)!;
	await transport.handleRequest(req, res);
});

// =============================================================================
// Legacy SSE transport (classic protocol - backwards compatible)
// =============================================================================

// SSE endpoint - client connects here to receive events
app.get("/sse", async (req, res) => {
	const transport = new SSEServerTransport("/messages", res);
	const sessionId = transport.sessionId;
	sseTransports.set(sessionId, transport);

	const server = createServer();

	res.on("close", () => {
		sseTransports.delete(sessionId);
		server.close().catch(console.error);
	});

	await server.connect(transport);
});

// Messages endpoint - client sends messages here (legacy SSE)
app.post("/messages", express.json(), async (req, res) => {
	const sessionId = req.query.sessionId as string;
	const transport = sseTransports.get(sessionId);

	if (!transport) {
		res.status(400).json({ error: "No active SSE connection for this session" });
		return;
	}

	await transport.handlePostMessage(req, res);
});

app.listen(PORT, "0.0.0.0", () => {
	console.log(`Evolution API MCP Server listening on port ${PORT}`);
	console.log(`Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
	console.log(`Legacy SSE endpoint: http://0.0.0.0:${PORT}/sse`);
	console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});
