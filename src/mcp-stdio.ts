#!/usr/bin/env node
import{StdioServerTransport}from'@modelcontextprotocol/server/stdio';import{createStatisticsMcpServer}from'./mcp.js';
try{await createStatisticsMcpServer().connect(new StdioServerTransport());}catch{console.error('Statistics MCP startup failed. Verify Node.js 24+ and installation.');process.exitCode=1;}
