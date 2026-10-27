import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StatisticSchema, type Release, type SourceRecord, type StatisticRecord } from './types.js';
export function canonicalJson(v:unknown):string{const sort=(x:unknown):unknown=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort((x as Record<string,unknown>)[k])])):x;return JSON.stringify(sort(v),null,2);}
export const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export function validateRelease(release:Release){z.string().min(1).max(256).parse(release.version);z.iso.datetime({offset:true}).parse(release.retrievedAt);const url=new URL(release.locator);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new TypeError('Release locator must be HTTPS without credentials or fragment');}
export function observation(source:SourceRecord['source'],data:StatisticRecord,release:Release,locator:string,artifactHash?:string):SourceRecord{
 StatisticSchema.parse(data);return {source,locator,retrievedAt:release.retrievedAt,revision:release.version,contentHash:hash(canonicalJson(data)),...(artifactHash?{artifactHash}:{}),data};
}
