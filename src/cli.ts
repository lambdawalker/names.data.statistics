#!/usr/bin/env node
import{parseArgs}from'node:util';import{createReadStream}from'node:fs';import{writeFile}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
import{IbgeClient}from'./ibge.js';import{readSsa}from'./ssa.js';import{readInsee,readInseeZip}from'./insee.js';import{writeImport}from'./import.js';import{toDocumentInput}from'./evidence.js';import{SourceError}from'./errors.js';import type{InseeSchema,SourceRecord}from'./types.js';
const HELP=`Usage (Node 24+, no provider credentials):
  names-statistics frequency NAME [--sex M|F] [--locality BR] [--document]
  names-statistics ranking [--decade 2000] [--sex M|F] [--locality BR] [--document]
  names-statistics import-ssa FILE.zip --version RELEASE --output FILE.jsonl [--name NAME]
  names-statistics import-insee FILE.csv|FILE.zip --schema 2026-national --version RELEASE --source-url HTTPS_URL --output FILE.jsonl [--name NAME]
  Imports accept --retrieved-at ISO_TIMESTAMP; default is import time (not a claimed original retrieval).
  --output refuses existing files. Full imports can be large; filter a name for research pilots.
`;
interface CliIO{stdout?:(s:string)=>void;stderr?:(s:string)=>void;fetch?:typeof fetch;signal?:AbortSignal}
export async function runCli(args:string[],io:CliIO={}):Promise<number>{
 const stdout=io.stdout??((s:string)=>{process.stdout.write(s);}),stderr=io.stderr??((s:string)=>{process.stderr.write(s);});
 try{
  const {values:v,positionals:p}=parseArgs({args,allowPositionals:true,strict:true,options:{sex:{type:'string'},locality:{type:'string'},decade:{type:'string'},name:{type:'string'},version:{type:'string'},schema:{type:'string'},'source-url':{type:'string'},'retrieved-at':{type:'string'},output:{type:'string'},document:{type:'boolean'},help:{type:'boolean'}}});
  if(v.help){stdout(HELP);return 0;}const command=p[0];const allowed:Record<string,string[]>={frequency:['sex','locality','output','document'],ranking:['sex','locality','decade','output','document'],'import-ssa':['name','version','output','source-url','retrieved-at'],'import-insee':['name','version','output','source-url','retrieved-at','schema']};
  if(!command||!allowed[command]||Object.keys(v).some(k=>!allowed[command]!.includes(k))||p.length!==(command==='ranking'?1:2))throw Error('arguments');
  if(command.startsWith('import-')){
   if(!v.output||!v.version||(command==='import-insee'&&(!v.schema||!v['source-url'])))throw Error('arguments');
   const release={version:v.version,retrievedAt:v['retrieved-at']??new Date().toISOString(),locator:v['source-url']??'https://www.ssa.gov/oact/babynames/names.zip',signal:io.signal};
   const stream=createReadStream(p[1]!);const rows=command==='import-ssa'?readSsa(stream,release):(p[1]!.toLowerCase().endsWith('.zip')?readInseeZip:readInsee)(stream,{...release,schema:v.schema as InseeSchema});
   const name=v.name?.normalize('NFC').toUpperCase();async function* selected():AsyncGenerator<SourceRecord>{for await(const r of rows)if(!name||r.data.name.normalize('NFC').toUpperCase()===name)yield r;}
   try{stdout(JSON.stringify(await writeImport(selected(),v.output,{signal:io.signal}))+'\n');}finally{stream.destroy();}return 0;
  }
  if(v.decade!==undefined&&!/^\d{4}$/.test(v.decade))throw Error('arguments');const client=new IbgeClient(io.fetch?{fetch:io.fetch}:{});
  const selection={sex:v.sex as 'M'|'F'|undefined,locality:v.locality,signal:io.signal};const record=command==='frequency'?await client.frequency(p[1]!,selection):await client.ranking({...selection,decade:v.decade?Number(v.decade):undefined});
  const out=JSON.stringify(v.document?toDocumentInput(record):record,null,2)+'\n';if(v.output)await writeFile(v.output,out,{flag:'wx',mode:0o600});else stdout(out);return 0;
 }catch(error){stderr(`ERROR: ${error instanceof SourceError?error.code:'configuration_or_input'}: Statistics command failed. Check --help, schema/release, source availability and output path.\n`);return 1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const c=new AbortController(),cancel=()=>c.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);process.exitCode=await runCli(process.argv.slice(2),{signal:c.signal});process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
