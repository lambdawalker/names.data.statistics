import { z } from 'zod';
const Text = z.string().min(1).max(4096);
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const StatisticSchema = z.strictObject({
  name: Text.max(256), sex: z.enum(['M','F','all']), source_sex: z.string().max(16),
  geography: z.strictObject({country:z.enum(['US','FR','BR']),region:Text.optional()}),
  period: z.strictObject({label:Text,start:z.iso.date().nullable(),end:z.iso.date().nullable()}),
  measure:z.enum(['birth_count','population_count','rank']),value:Count,
  rank:Count.refine(v=>v>0).optional(),precision:z.enum(['exact','rounded_5']),
  dataset_version:Text,population_scope:Text,suppression_note:Text,
}).refine(s=>!s.period.start||!s.period.end||s.period.start<=s.period.end,'Invalid period order');
export type StatisticRecord = z.infer<typeof StatisticSchema>;
export interface SourceRecord<T=StatisticRecord> {
 source:'ssa'|'insee'|'ibge'; locator:string; retrievedAt:string; revision:string; contentHash:string; artifactHash?:string; data:T;
}
export interface Release {version:string;retrievedAt:string;locator:string;signal?:AbortSignal;maxBytes?:number;maxLineBytes?:number}
export type InseeSchema = '2025-national'|'2025-regional'|'2025-departmental'|'2026-national'|'2026-regional'|'2026-departmental';
export interface InseeOptions extends Release {schema:InseeSchema}
