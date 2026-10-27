import { it, expect } from 'vitest';
import { IbgeClient,SourceError } from '../src/index.js';
const json=(v:unknown,init?:ResponseInit)=>new Response(JSON.stringify(v),init);
const data=[{nome:'JOAO',sexo:'M',localidade:'BR',res:[{periodo:'1930[',frequencia:42},{periodo:'[1930,1940[',frequencia:100}]}];
it('encodes a single Unicode name, validates filters and preserves open periods and census scope',async()=>{
 let url='';const client=new IbgeClient({fetch:async u=>{url=String(u);return json(data);}});const r=await client.frequency('João',{sex:'M'});expect(url).toContain('Jo%C3%A3o');expect(url).toContain('sexo=M');expect(r.data[0]).toMatchObject({measure:'population_count',period:{start:null,end:'1929-12-31'},geography:{country:'BR'},dataset_version:'IBGE-v2-Census2010'});expect(r.data[1]!.period).toMatchObject({start:'1930-01-01',end:'1939-12-31'});expect(r.data[0]!.population_scope).toContain('2010');expect(r.data[0]!.suppression_note).toContain('20');
});
it('preserves provider ranks and selected decade without ranking arbitrary people',async()=>{
 const c=new IbgeClient({fetch:async()=>json([{localidade:'35',sexo:null,res:[{nome:'MARIA',frequencia:40,ranking:1}]}])});const r=await c.ranking({locality:'35',decade:2000});expect(r.data[0]).toMatchObject({name:'MARIA',measure:'population_count',value:40,rank:1,sex:'all',geography:{region:'IBGE:35'},period:{start:'2000-01-01',end:'2009-12-31'}});
});
it('leaves all-time ranking periods open instead of inventing a first birth year',async()=>{
 const c=new IbgeClient({fetch:async()=>json([{localidade:'BR',sexo:null,res:[{nome:'MARIA',frequencia:40,ranking:1}]}])});expect((await c.ranking()).data[0]!.period).toMatchObject({start:null,end:null});
});
it('keeps empty responses empty, never zero-valued observations',async()=>{expect((await new IbgeClient({fetch:async()=>json([])}).frequency('Missing')).data).toEqual([]);});
it.each([{},[{nome:'JOAO',sexo:'M',localidade:'BR',res:[{periodo:'[1930,1940[',frequencia:-1}]}],[{...data[0],localidade:'35'}],[{...data[0],sexo:'F'}],[{...data[0],res:[{periodo:'[1940,1930[',frequencia:1}]}]])('rejects malformed or mismatched frequency envelopes',async body=>{await expect(new IbgeClient({fetch:async()=>json(body)}).frequency('John',{sex:'M'})).rejects.toBeInstanceOf(SourceError);});
it('rejects unsafe or unsupported arguments without a source call',async()=>{
 let calls=0;const c=new IbgeClient({fetch:async()=>{calls++;return json([]);}});for(const n of ['','../ranking','John;Maria','x'.repeat(300)])await expect(c.frequency(n)).rejects.toBeInstanceOf(SourceError);await expect(c.ranking({decade:2001})).rejects.toBeInstanceOf(SourceError);await expect(c.frequency('John',{locality:'http://a'})).rejects.toBeInstanceOf(SourceError);expect(calls).toBe(0);
});
it('preserves rate limits and bounds network, body, timeout and cancellation failures',async()=>{
 await expect(new IbgeClient({fetch:async()=>json({}, {status:429,headers:{'Retry-After':'10'}})}).frequency('John')).rejects.toMatchObject({code:'rate_limited',retryAfterMs:10000});
 await expect(new IbgeClient({fetch:async()=>{throw Error('raw internal trace');}}).frequency('John')).rejects.toMatchObject({code:'network',message:'Source request failed'});
 await expect(new IbgeClient({fetch:async()=>new Response('oops')}).frequency('John')).rejects.toMatchObject({code:'invalid_response'});
 await expect(new IbgeClient({fetch:async()=>json(data),maxResponseBytes:10}).frequency('John')).rejects.toMatchObject({code:'response_too_large'});
 await expect(new IbgeClient({fetch:async()=>new Promise(()=>{}),timeoutMs:5}).frequency('John')).rejects.toMatchObject({code:'timeout'});
 const ctl=new AbortController();ctl.abort();await expect(new IbgeClient().frequency('John',{signal:ctl.signal})).rejects.toMatchObject({code:'aborted'});
});
it('caches bounded successful queries by full context and preserves retrieval time',async()=>{
 let calls=0,now=0;const c=new IbgeClient({fetch:async()=>{calls++;return json([]);},intervalMs:0,now:()=>new Date(now),cacheTtlMs:100,cacheMaxEntries:1});const a=await c.frequency('John');now=50;const b=await c.frequency('John');expect(b.retrievedAt).toBe(a.retrievedAt);expect(calls).toBe(1);await c.frequency('Other');await c.frequency('John');expect(calls).toBe(3);now=200;await c.frequency('John');expect(calls).toBe(4);
});
it('rejects a different returned name while accepting the documented diacritic normalization',async()=>{const wrong=[{...data[0],nome:'MARIA'}];await expect(new IbgeClient({fetch:async()=>json(wrong)}).frequency('John',{sex:'M'})).rejects.toMatchObject({code:'invalid_response'});expect((await new IbgeClient({fetch:async()=>json(data)}).frequency('João',{sex:'M'})).data[0]!.name).toBe('JOAO');});
