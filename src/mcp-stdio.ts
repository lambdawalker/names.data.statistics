#!/usr/bin/env node
import{StdioServerTransport}from'@modelcontextprotocol/server/stdio';import{createStatisticsMcpServer}from'./mcp.js';
try{await createStatisticsMcpServer({datasets:process.env.STATISTICS_DATASETS?JSON.parse(process.env.STATISTICS_DATASETS):undefined}).connect(new StdioServerTransport());}catch{console.error('Statistics MCP startup failed. Verify Node.js 24+, installation and STATISTICS_DATASETS configuration.');process.exitCode=1;}
