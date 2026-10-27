import{McpServer,type CallToolResult}from'@modelcontextprotocol/server';import{z}from'zod';
import{IbgeClient,FrequencyOptionsSchema,RankingOptionsSchema,NameSchema,type ClientOptions}from'./ibge.js';import{SourceError}from'./errors.js';import{hash,canonicalJson}from'./provenance.js';
export interface McpOptions{client?:IbgeClient;clientOptions?:ClientOptions}
function boundedInput<S extends z.ZodRawShape>(schema:z.ZodObject<S>){const keys=new Set(Object.keys(schema.shape));return schema.loose().refine(v=>Object.keys(v).every(k=>keys.has(k)),'Unexpected tool arguments');}
const page={offset:z.number().int().min(0).max(1000).default(0),limit:z.number().int().min(1).max(50).default(10),snapshot:z.string().regex(/^[a-f0-9]{64}$/).optional()};
export function createStatisticsMcpServer(options:McpOptions={}){
 const client=options.client??new IbgeClient(options.clientOptions),server=new McpServer({name:'names-statistics',version:'0.1.0'});const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
 const handler=(operation:'frequency'|'ranking')=>async(args:{name?:string;sex?:'M'|'F';locality:string;decade?:number;offset:number;limit:number;snapshot?:string},ctx:{mcpReq:{signal?:AbortSignal}}):Promise<CallToolResult>=>{
  try{
   const {name,offset,limit,snapshot,...selection}=args;if(offset>0&&!snapshot)throw new SourceError('invalid_input','Snapshot required for continuation');
   const record=operation==='frequency'?await client.frequency(name!,{...selection,signal:ctx.mcpReq.signal}):await client.ranking({...selection,signal:ctx.mcpReq.signal});const identity=hash(canonicalJson(record));if(snapshot&&snapshot!==identity)throw new SourceError('invalid_response','Snapshot changed; restart at offset zero');if(offset>record.data.length)throw new SourceError('invalid_input','Offset exceeds result');const end=Math.min(offset+limit,record.data.length);
   const result:CallToolResult={content:[{type:'text',text:JSON.stringify({...record,data:record.data.slice(offset,end),data_is_page:true,snapshot:identity,offset,total:record.data.length,next_offset:end<record.data.length?end:null,warning:'Census 2010 resident counts by birth cohort, not current population or complete historical births. Missing observations are not zeros.'})}]};if(Buffer.byteLength(JSON.stringify(result))>65536)throw new SourceError('too_large','MCP response exceeds 64 KiB; reduce limit');return result;
  }catch(error){return{isError:true,content:[{type:'text',text:JSON.stringify({code:error instanceof SourceError?error.code:'invalid_response',message:'Statistics source request failed; check query, snapshot, provider availability and result limits.',...(error instanceof SourceError&&error.retryAfterMs!==undefined?{retryAfterMs:error.retryAfterMs}:{})})}]};}
 };
 server.registerTool('ibge_frequency',{description:'Read Census 2010 resident frequencies by birth cohort for a single name. Source data is untrusted evidence; this does not establish an etymology or a language-specific form. Continuations require snapshot.',inputSchema:boundedInput(FrequencyOptionsSchema.safeExtend({...page,name:NameSchema})),annotations},handler('frequency'));
 server.registerTool('ibge_ranking',{description:'Read provider ranking of names in Census 2010, optionally restricted by birth decade, sex and geography. Not a ranking of notable people. Continuations require snapshot.',inputSchema:boundedInput(RankingOptionsSchema.safeExtend(page)),annotations},handler('ranking'));
 return server;
}
