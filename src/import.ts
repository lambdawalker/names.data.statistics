import{open,link,unlink,lstat}from'node:fs/promises';
import{dirname,basename,join}from'node:path';
import{createHash,randomUUID}from'node:crypto';
import{SourceError,checkAbort}from'./errors.js';
import{raceAbort}from'./stream.js';
import type{SourceRecord}from'./types.js';
/** Publishes only after full iterator exhaustion. Existing output is never replaced. */
export async function writeImport(records:AsyncIterable<SourceRecord>,output:string,options:{maxOutputBytes?:number;signal?:AbortSignal}={}){
 const max=options.maxOutputBytes??4294967296;if(!Number.isSafeInteger(max)||max<1||max>8589934592)throw new SourceError('invalid_input','Invalid output limit');checkAbort(options.signal);
 try{await lstat(output);throw new SourceError('invalid_input','Output file already exists');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
 const temp=join(dirname(output),'.'+basename(output)+'.'+randomUUID()+'.partial');const file=await open(temp,'wx',0o600);let recordsCount=0,size=0;const digest=createHash('sha256');let closed=false;const iterator=records[Symbol.asyncIterator]();
 try{
  while(true){const next=await raceAbort(iterator.next(),options.signal);if(next.done)break;const record=next.value;checkAbort(options.signal);const line=JSON.stringify(record)+'\n';size+=Buffer.byteLength(line);if(size>max)throw new SourceError('too_large','Import exceeds output byte limit');await file.writeFile(line);digest.update(line);recordsCount++;}
  checkAbort(options.signal);const receipt={type:'complete' as const,records:recordsCount,sha256:digest.digest('hex')};const footer=JSON.stringify(receipt)+'\n';if(size+Buffer.byteLength(footer)>max)throw new SourceError('too_large','Import receipt exceeds output limit');await file.writeFile(footer);await file.sync();await file.close();closed=true;checkAbort(options.signal);await link(temp,output);return receipt;
 }finally{void iterator.return?.().catch(()=>{});if(!closed)await file.close();await unlink(temp).catch(()=>{});}
}
