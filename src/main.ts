#!/usr/bin/env node

// Version is automatically updated during release process
export const VERSION = "0.1.0";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { createTools } from "./tools/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Store active transports for SSE connections
const transports = new Map<string, SSEServerTransport>();

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

// SSE endpoint - client connects here to receive events
app.get("/sse", async (req, res) => {
	const transport = new SSEServerTransport("/messages", res);
	const sessionId = transport.sessionId;
	transports.set(sessionId, transport);

	const server = createServer();

	res.on("close", () => {
		transports.delete(sessionId);
		server.close().catch(console.error);
	});

	await server.connect(transport);
});

// Messages endpoint - client sends messages here
app.post("/messages", express.json(), async (req, res) => {
	const sessionId = req.query.sessionId as string;
	const transport = transports.get(sessionId);

	if (!transport) {
		res.status(400).json({ error: "No active SSE connection for this session" });
		return;
	}

	await transport.handlePostMessage(req, res);
});

app.listen(PORT, "0.0.0.0", () => {
	console.log(`Evolution API MCP Server listening on port ${PORT}`);
	console.log(`SSE endpoint: http://0.0.0.0:${PORT}/sse`);
	console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});
