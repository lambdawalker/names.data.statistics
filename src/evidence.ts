import {z} from 'zod';
import {StatisticSchema,type SourceRecord,type StatisticRecord}from'./types.js';
import{hash,canonicalJson}from'./provenance.js';
import{SourceError}from'./errors.js';
export function validateRecord(record:SourceRecord<StatisticRecord|StatisticRecord[]>){
 if(!['ssa','insee','ibge'].includes(record.source))throw new TypeError('Unknown statistics source');
 z.iso.datetime({offset:true}).parse(record.retrievedAt);z.string().min(1).max(256).parse(record.revision);
 const data=Array.isArray(record.data)?z.array(StatisticSchema).max(1000).parse(record.data):StatisticSchema.parse(record.data);
 if(record.contentHash!==hash(canonicalJson(data)))throw new TypeError('Statistics content hash mismatch');
 const url=new URL(record.locator);if(url.protocol!=='https:'||url.username||url.password)throw new TypeError('Invalid statistics locator');return data;
}
export function toDocumentInput(record:SourceRecord<StatisticRecord|StatisticRecord[]>){
 const data=validateRecord(record),json=canonicalJson(data);const fence='`'.repeat(Math.max(3,...Array.from(json.matchAll(/`+/g),m=>m[0].length+1)));
 const content=`# Official name statistics\n\nSource: ${record.source.toUpperCase()}; release ${record.revision}.\n\n${record.locator}\n\nObservation SHA-256: ${record.contentHash}\n\nCounts retain source-specific sex, scope, periods and suppression/rounding. Missing records are not zeros. Counts do not establish etymology or language-specific identity.\n\n${fence}json\n${json}\n${fence}\n`;
 if(Buffer.byteLength(content)>1048576)throw new SourceError('too_large','Statistics document exceeds 1 MiB');
 const source={id:'stats:'+hash(canonicalJson([record.source,record.locator,record.revision,record.contentHash,record.artifactHash??null,record.retrievedAt])),provider:record.source,upstream_source:record.source==='ssa'?'US Social Security Administration':record.source==='insee'?'Insee':'IBGE Census 2010 Names API v2',url:record.locator,retrieved_at:record.retrievedAt,revision:record.revision,...(record.source==='insee'?{license:{name:'Licence Ouverte / Open Licence 2.0',url:'https://www.insee.fr/fr/information/2008466'}}:{}),public_reuse:record.source==='ibge'?'unknown' as const:'allowed' as const};
 return {source,locator:record.locator,content,format:'markdown' as const,retention:'allowed' as const};
}
const FindingOptions=z.strictObject({formId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),expectedName:z.string().min(1).max(256),index:z.number().int().min(0).max(999).default(0),measure:z.enum(['count','rank']).default('count'),documentId:z.string().regex(/^[a-f0-9]{64}$/).optional()});
/** Caller explicitly maps an observed spelling to a stored form; classification is preserved as evidence. */
export function toStatisticFinding(record:SourceRecord<StatisticRecord|StatisticRecord[]>,options:z.input<typeof FindingOptions>){
 const args=FindingOptions.parse(options),parsed=validateRecord(record),rows=Array.isArray(parsed)?parsed:[parsed],row=rows[args.index];
 if(!row||row.name!==args.expectedName)throw new TypeError('Explicit observation/name selection required');
 if(!row.period.start||!row.period.end)throw new SourceError('unsupported','Storage statistics require a closed period; preserve this open-period observation as document evidence');
 if(args.measure==='rank'&&!row.rank)throw new SourceError('unsupported','Source did not supply a rank');
 const doc=toDocumentInput(record),identity=hash(canonicalJson([doc.source.id,args])),evidence={id:'stats-evidence-'+identity,source_id:doc.source.id,locator:record.locator,...(args.documentId?{document_id:args.documentId}:{}),supporting_text:canonicalJson(row),note:'Candidate source-statistic association. Form mapping supplied by caller; source name spelling and sex classification are preserved. No origin or language usage inferred.'};
 return {idempotency_key:'stats-finding-'+identity,sources:[doc.source],evidence:[evidence],statistics:[{id:'stats-'+identity,form_id:args.formId,status:'candidate' as const,evidence_ids:[evidence.id],measure:args.measure==='rank'?'rank' as const:row.measure,value:args.measure==='rank'?row.rank!:row.value,period:{start:row.period.start,end:row.period.end},geography:row.geography,dataset_version:row.dataset_version,population_scope:row.population_scope+`; source sex=${row.source_sex||'all'}; precision=${row.precision}`,suppression_note:row.suppression_note}]};
}
