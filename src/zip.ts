import { inflateRawSync, crc32 } from 'node:zlib';
import { SourceError } from './errors.js';
interface Entry{name:string;flags:number;method:number;crc:number;size:number;compressed:number;offset:number}
/** Bounded ZIP32 reader. No files are extracted. ZIP64, encryption and multi-disk are rejected. */
export function openZip(input:Uint8Array,options:{maxExpandedBytes?:number;maxEntryBytes?:number;maxEntries?:number}={}){
 const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength);const maxTotal=options.maxExpandedBytes??268435456,maxEntry=options.maxEntryBytes??67108864,maxEntries=options.maxEntries??1000;
 if(!Number.isSafeInteger(maxTotal)||maxTotal<1||maxTotal>536870912||!Number.isSafeInteger(maxEntry)||maxEntry<1||maxEntry>67108864||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>10000)throw new SourceError('invalid_input','Invalid ZIP limits');
 const fail=():never=>{throw new SourceError('invalid_response','Unsupported, damaged or unsafe ZIP archive');};
 const fits=(p:number,n:number)=>{if(p<0||n<0||p+n>b.length)fail();};
 try{
  let end=-1;for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--){if(b.readUInt32LE(p)===0x06054b50&&p+22+b.readUInt16LE(p+20)===b.length){end=p;break;}}
  if(end<0)return fail();
  if(b.readUInt16LE(end+4)||b.readUInt16LE(end+6)||b.readUInt16LE(end+8)!==b.readUInt16LE(end+10))return fail();
  const count=b.readUInt16LE(end+10),cdSize=b.readUInt32LE(end+12),cdStart=b.readUInt32LE(end+16);if(!count||count===65535||count>maxEntries||cdStart+cdSize!==end)return fail();fits(cdStart,cdSize);
  const entries=new Map<string,Entry>();let p=cdStart,total=0;const ranges:[number,number][]=[];
  for(let i=0;i<count;i++){
   fits(p,46);if(b.readUInt32LE(p)!==0x02014b50)return fail();const nameLen=b.readUInt16LE(p+28),extraLen=b.readUInt16LE(p+30),commentLen=b.readUInt16LE(p+32);fits(p,46+nameLen+extraLen+commentLen);
   const name=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p+46,p+46+nameLen));const e:Entry={name,flags:b.readUInt16LE(p+8),method:b.readUInt16LE(p+10),crc:b.readUInt32LE(p+16),compressed:b.readUInt32LE(p+20),size:b.readUInt32LE(p+24),offset:b.readUInt32LE(p+42)};
   const mode=b.readUInt32LE(p+38)>>>16;
   if(!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').some(s=>!s||s==='.'||s==='..')||/[\u0000-\u001f]/.test(name)||entries.has(name)||(mode&0xf000)===0xa000||b.readUInt16LE(p+34)||(e.flags&~0x080e)||![0,8].includes(e.method)||e.size>maxEntry||e.compressed===0xffffffff||e.offset===0xffffffff||e.size===0xffffffff)return fail();
   if(e.method===0&&e.compressed!==e.size)return fail();
   total+=e.size;if(total>maxTotal)return fail();fits(e.offset,30);if(b.readUInt32LE(e.offset)!==0x04034b50||b.readUInt16LE(e.offset+6)!==e.flags||b.readUInt16LE(e.offset+8)!==e.method)return fail();
   if(!(e.flags&8)&&(b.readUInt32LE(e.offset+14)!==e.crc||b.readUInt32LE(e.offset+18)!==e.compressed||b.readUInt32LE(e.offset+22)!==e.size))return fail();
   const ln=b.readUInt16LE(e.offset+26),le=b.readUInt16LE(e.offset+28),start=e.offset+30+ln+le;fits(e.offset+30,ln+le);if(new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(e.offset+30,e.offset+30+ln))!==name||start+e.compressed>cdStart)return fail();
   ranges.push([e.offset,start+e.compressed]);entries.set(name,e);p+=46+nameLen+extraLen+commentLen;
  }
  if(p!==end)return fail();ranges.sort((a,c)=>a[0]-c[0]);for(let i=1;i<ranges.length;i++)if(ranges[i]![0]<ranges[i-1]![1])return fail();
  return {names:[...entries.keys()],read(name:string):Buffer{const e=entries.get(name);if(!e)return fail();const start=e.offset+30+b.readUInt16LE(e.offset+26)+b.readUInt16LE(e.offset+28);let out:Buffer;
   try{const compressed=b.subarray(start,start+e.compressed);out=e.method===0?Buffer.from(compressed):inflateRawSync(compressed,{maxOutputLength:Math.max(1,e.size)});}catch{return fail();}
   if(out.length!==e.size||crc32(out)!==e.crc)return fail();return out;
  }};
 }catch(error){if(error instanceof SourceError)throw error;return fail();}
}
