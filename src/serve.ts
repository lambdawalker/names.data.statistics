#!/usr/bin/env node
import { createStatisticsMcpServer } from './mcp.js';
import {startConfiguredService} from './local-service.js';
try {await startConfiguredService('statistics',(config,token)=>createStatisticsMcpServer({datasets:config.datasets}));}catch{console.error('Service startup failed; check configuration, control token and port.');process.exitCode=1;}
