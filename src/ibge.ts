import { z } from 'zod';
import { JsonTransport } from './transport.js';
import { SourceError } from './errors.js';
import { hash,canonicalJson } from './provenance.js';
import { StatisticSchema, type StatisticRecord, type SourceRecord } from './types.js';
export interface ClientOptions {userAgent?:string;fetch?:typeof fetch;timeoutMs?:number;intervalMs?:number;retries?:number;maxResponseBytes?:number;now?:()=>Date;cacheTtlMs?:number;cacheMaxEntries?:number}
export const FrequencyOptionsSchema=z.strictObject({sex:z.enum(['M','F']).optional(),locality:z.string().regex(/^(?:BR|\d{2}|\d{7})$/).default('BR')});
export const RankingOptionsSchema=FrequencyOptionsSchema.safeExtend({decade:z.number().int().min(1930).max(2010).refine(v=>v%10===0).optional()});
export const NameSchema=z.string().trim().min(2).max(128).regex(/^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u);
const Count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),Text=z.string().min(1).max(256);
const common={localidade:z.string(),sexo:z.enum(['M','F']).nullable().optional()};
const frequencySchema=z.array(z.object({...common,nome:Text,res:z.array(z.object({periodo:Text,frequencia:Count})).max(30)})).max(1);
const rankingSchema=z.array(z.object({...common,res:z.array(z.object({nome:Text,frequencia:Count,ranking:Count.refine(n=>n>0)})).max(1000)})).max(1);
export type FrequencyOptions=z.input<typeof FrequencyOptionsSchema>&{signal?:AbortSignal};
export type RankingOptions=z.input<typeof RankingOptionsSchema>&{signal?:AbortSignal};
export interface IbgeRecord extends SourceRecord<StatisticRecord[]>{operation:'frequency'|'ranking';query:{name?:string;sex?:string;locality:string;decade?:number}}
function period(label:string){
 let m=/^(\d{4})\[$/.exec(label);if(m){const end=Number(m[1])-1;if(end<1800||end>2010)throw new SourceError('invalid_response','Unsupported census period');return {label,start:null,end:`${end}-12-31`};}
 m=/^\[(\d{4}),(\d{4})\[$/.exec(label);if(!m||Number(m[1])<1800||Number(m[2])>2011||Number(m[1])>=Number(m[2]))throw new SourceError('invalid_response','Unsupported census period');return {label,start:`${m[1]}-01-01`,end:`${Number(m[2])-1}-12-31`};
}
export class IbgeClient{
 #transport:JsonTransport;#now:()=>Date;#ttl:number;#max:number;#cache=new Map<string,{record:IbgeRecord;expires:number}>();
 constructor(options:ClientOptions={}){this.#transport=new JsonTransport({...options,userAgent:options.userAgent??'NamesStatistics/0.1 (https://github.com/lambdawalker/names.data.statistics)'});this.#now=options.now??(()=>new Date());this.#ttl=options.cacheTtlMs??300000;this.#max=options.cacheMaxEntries??100;if(!Number.isSafeInteger(this.#ttl)||this.#ttl<0||this.#ttl>604800000||!Number.isInteger(this.#max)||this.#max<0||this.#max>1000)throw new SourceError('invalid_input','Invalid cache settings');}
 async frequency(name:string,options:FrequencyOptions={}):Promise<IbgeRecord>{const {signal,...rest}=options;const a=FrequencyOptionsSchema.safeParse(rest),n=NameSchema.safeParse(name);if(!a.success||!n.success)throw new SourceError('invalid_input','Invalid IBGE frequency query');return this.request('frequency',{name:n.data,...a.data},signal);}
 async ranking(options:RankingOptions={}):Promise<IbgeRecord>{const {signal,...rest}=options;const a=RankingOptionsSchema.safeParse(rest);if(!a.success)throw new SourceError('invalid_input','Invalid IBGE ranking query');return this.request('ranking',a.data,signal);}
 private async request(operation:IbgeRecord['operation'],query:IbgeRecord['query'],signal?:AbortSignal):Promise<IbgeRecord>{
  if(signal?.aborted)throw new SourceError('aborted','Source request cancelled');const url=new URL('https://servicodados.ibge.gov.br/api/v2/censos/nomes/'+(operation==='frequency'?encodeURIComponent(query.name!):'ranking'));url.searchParams.set('localidade',query.locality);if(query.sex)url.searchParams.set('sexo',query.sex);if(query.decade!==undefined)url.searchParams.set('decada',String(query.decade));const key=url.href;
  const hit=this.#cache.get(key);if(hit&&hit.expires>this.#now().getTime()){this.#cache.delete(key);this.#cache.set(key,hit);return structuredClone(hit.record);}this.#cache.delete(key);
  const response=await this.#transport.get(url,signal);const parsed=(operation==='frequency'?frequencySchema:rankingSchema).safeParse(response.data);if(!parsed.success)throw new SourceError('invalid_response','Unexpected IBGE response envelope');
  const records:StatisticRecord[]=[];
  const matchName=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();
  for(const item of parsed.data){if(operation==='frequency'&&matchName((item as {nome:string}).nome)!==matchName(query.name!))throw new SourceError('invalid_response','IBGE response name disagrees with query');if(item.localidade!==query.locality||(item.sexo??undefined)!==query.sex)throw new SourceError('invalid_response','IBGE response disagrees with query selection');const seen=new Set<string>();for(const entry of item.res){const row=entry as {periodo?:string;nome?:string;frequencia:number;ranking?:number};const name=operation==='frequency'?(item as {nome:string}).nome:row.nome!;const time=operation==='frequency'?period(row.periodo!):query.decade?{label:String(query.decade),start:`${query.decade}-01-01`,end:`${query.decade+9}-12-31`}:{label:'all birth cohorts in Census 2010',start:null,end:null};const identity=name+'\0'+time.label;if(seen.has(identity))throw new SourceError('invalid_response','Duplicate IBGE observation');seen.add(identity);
   records.push(StatisticSchema.parse({name,sex:query.sex??'all',source_sex:item.sexo??'',geography:{country:'BR',...(query.locality==='BR'?{}:{region:'IBGE:'+query.locality})},period:time,measure:'population_count',value:row.frequencia,...(row.ranking?{rank:row.ranking}:{}),precision:'exact',dataset_version:'IBGE-v2-Census2010',population_scope:'Residents enumerated in the 2010 Brazilian census (reference 31 July 2010), grouped by birth cohort. These are surviving census residents, not all historical births or current population.',suppression_note:'Census 2010 disclosure thresholds: 20 nationally, 15 per state and 10 per municipality. Provider name normalization may combine diacritic variants; absent names are unknown or suppressed, not zero.'}));
  }}
  const record:IbgeRecord={source:'ibge',operation,query,locator:url.href,retrievedAt:response.fetchedAt,revision:'IBGE-v2-Census2010',contentHash:hash(canonicalJson(records)),data:records};
  const control=response.cacheControl??'',age=control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i)?.[1];const ttl=/\b(?:no-store|no-cache)\b/i.test(control)?0:Math.min(this.#ttl,age===undefined?this.#ttl:Number(age)*1000);if(this.#max&&ttl){this.#cache.set(key,{record:structuredClone(record),expires:this.#now().getTime()+ttl});while(this.#cache.size>this.#max)this.#cache.delete(this.#cache.keys().next().value!);}return record;
 }
}
