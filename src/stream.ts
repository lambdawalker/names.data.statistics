import { SourceError, checkAbort } from './errors.js';
export async function raceAbort<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return promise;checkAbort(signal);return new Promise((resolve,reject)=>{const abort=()=>reject(new SourceError('aborted','Operation cancelled'));signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export async function* checkedChunks(stream:AsyncIterable<Uint8Array>,maxBytes=268435456,signal?:AbortSignal){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>536870912)throw new SourceError('invalid_input','Invalid stream byte limit');
 checkAbort(signal);const iterator=stream[Symbol.asyncIterator]();let size=0;
 try{while(true){const next=await raceAbort(iterator.next(),signal);if(next.done)break;checkAbort(signal);size+=next.value.byteLength;if(size>maxBytes)throw new SourceError('too_large','Input exceeds byte limit');yield next.value;}}finally{void iterator.return?.().catch(()=>{});}
}
export async function collect(stream:AsyncIterable<Uint8Array>,maxBytes:number,signal?:AbortSignal){const parts:Uint8Array[]=[];for await(const part of checkedChunks(stream,maxBytes,signal))parts.push(part.slice());return Buffer.concat(parts);}
/** RFC-style quotes including quoted separators/newlines, fatal UTF-8 and bounded records. */
export async function* readRows(stream:AsyncIterable<Uint8Array>,separator:string,options:{maxBytes?:number;maxLineBytes?:number;signal?:AbortSignal}={}){
 const max=options.maxLineBytes??65536;if(!Number.isInteger(max)||max<1||max>1048576)throw new SourceError('invalid_input','Invalid record limit');
 const decoder=new TextDecoder('utf-8',{fatal:true});let field='',cells:string[]=[],state:'start'|'plain'|'quoted'|'quote'='start',row=0,skipLf=false,size=0,touched=false;
 function* consume(text:string):Generator<{cells:string[];row:number}>{for(const ch of text){
  if(skipLf&&ch==='\n'){skipLf=false;continue;}skipLf=false;size+=Buffer.byteLength(ch);if(size>max)throw new SourceError('too_large','CSV record exceeds byte limit');
  if(state==='quoted'){if(ch==='"')state='quote';else field+=ch;touched=true;continue;}
  if(state==='quote'&&ch==='"'){field+='"';state='quoted';continue;}
  if(ch===separator){cells.push(field);if(cells.length>32)throw new SourceError('too_large','Too many CSV columns');field='';state='start';touched=true;continue;}
  if(ch==='\n'||ch==='\r'){if(touched||field||cells.length){cells.push(field);yield {cells,row:++row};}cells=[];field='';state='start';size=0;touched=false;skipLf=ch==='\r';continue;}
  if(state==='quote')throw new SourceError('invalid_response','Characters after closing CSV quote');
  if(ch==='"'){if(state!=='start')throw new SourceError('invalid_response','Quote inside unquoted field');state='quoted';touched=true;continue;}
  field+=ch;state='plain';touched=true;
 }}
 try{for await(const chunk of checkedChunks(stream,options.maxBytes,options.signal))yield* consume(decoder.decode(chunk,{stream:true}));yield* consume(decoder.decode());}
 catch(error){if(error instanceof SourceError)throw error;throw new SourceError('invalid_response','Invalid UTF-8 or interrupted input');}
 if((state as string)==='quoted')throw new SourceError('invalid_response','Unclosed CSV quote');if(touched||field||cells.length){cells.push(field);yield {cells,row:++row};}
}
