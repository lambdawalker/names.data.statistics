import { readRows, collect } from './stream.js';
import { openZip } from './zip.js';
import { integer,SourceError } from './errors.js';
import { validateRelease, observation, hash } from './provenance.js';
import type { InseeOptions, SourceRecord } from './types.js';
export async function* readInsee(stream:AsyncIterable<Uint8Array>,options:InseeOptions):AsyncGenerator<SourceRecord>{
 validateRelease(options);const schema=/^(2025|2026)-(national|regional|departmental)$/.exec(options.schema);if(!schema)throw new SourceError('unsupported','Unknown INSEE schema');const [,edition,level]=schema;
 const required=['SEXE','PRENOM','PERIODE','VALEUR',...(edition==='2026'?['RANG']:[]),...(level==='regional'?['REG']:level==='departmental'?['DPT']:[])];let header:string[]|undefined;
 for await(const {cells,row} of readRows(stream,';',options)){
  if(!header){const normalized=cells.map(h=>h.toUpperCase());if(normalized.length!==required.length||new Set(normalized).size!==normalized.length||required.some(h=>!normalized.includes(h)))throw new SourceError('unsupported','INSEE header differs from selected schema');header=normalized;continue;}
  if(cells.length!==header.length)throw new SourceError('invalid_response','Invalid INSEE column count');const r=Object.fromEntries(header.map((h,i)=>[h,cells[i]!]));
  if(!['1','2'].includes(r.SEXE!)||!r.PRENOM?.trim()||r.PRENOM.startsWith('_')||r.PRENOM.length>256)throw new SourceError('invalid_response','Invalid INSEE name or aggregate row');
  const year=integer(r.PERIODE!,1900,edition==='2026'?2025:2024),value=integer(r.VALEUR!,5);if(value%5)throw new SourceError('invalid_response','INSEE counts must be rounded multiples of 5');
  const region=level==='regional'?r.REG:level==='departmental'?r.DPT:undefined;if(region&&!/^(?:\d{2,3}|2A|2B)$/.test(region))throw new SourceError('invalid_response','Invalid INSEE geography code');if(level!=='national'&&!region)throw new SourceError('invalid_response','Missing INSEE geography');
  yield observation('insee',{name:r.PRENOM,sex:r.SEXE==='1'?'M':'F',source_sex:r.SEXE!,geography:{country:'FR',...(region?{region:(level==='regional'?'REG:':'DPT:')+region}:{})},period:{label:String(year),start:`${year}-01-01`,end:`${year}-12-31`},measure:'birth_count',value,precision:'rounded_5',...(r.RANG?{rank:integer(r.RANG,1)}:{}),dataset_version:options.version,population_scope:`French civil-registration births; first given name, not living population. Mayotte included from 2012. INSEE schema ${options.schema}; `+(edition==='2026'?'2026 release geography, ranks based on unrounded values with randomly ordered ties.':'2025 release geography.'),suppression_note:'Counts rounded to nearest multiple of 5; rounded zero cells are not published. Missing cells do not establish zero births; rounded regional sums need not equal national totals.'},options,options.locator+`#record=${row}`);
 }
 if(!header)throw new SourceError('invalid_response','Missing INSEE header');
}
export async function* readInseeZip(stream:AsyncIterable<Uint8Array>,options:InseeOptions):AsyncGenerator<SourceRecord>{
 const archive=await collect(stream,options.maxBytes??33554432,options.signal);const zip=openZip(archive);if(zip.names.length!==1||!zip.names[0]!.toLowerCase().endsWith('.csv'))throw new SourceError('unsupported','INSEE archive must contain exactly one CSV file');const content=zip.read(zip.names[0]!);const artifactHash=hash(archive);async function* bytes(){yield content;}for await(const row of readInsee(bytes(),{...options,maxBytes:268435456}))yield {...row,artifactHash};
}
