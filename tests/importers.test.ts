import { it, expect } from 'vitest';
import {bytes,zip} from './fixtures.js';
import { readSsa, readInsee, readInseeZip, openZip } from '../src/index.js';
const release={version:'synthetic-2026',retrievedAt:'2026-10-27T00:00:00Z',locator:'https://www.ssa.gov/oact/babynames/names.zip'};
it('reads SSA national archive and preserves scope, sex, release and count suppression',async()=>{
 const results=await Array.fromAsync(readSsa(bytes(zip({'yob2025.txt':'Abigail,F,50\r\nJohn,M,30\n','NationalReadMe.pdf':'synthetic readme'})),release));expect(results).toHaveLength(2);expect(results[0]!.data).toMatchObject({name:'Abigail',measure:'birth_count',value:50,sex:'F',period:{start:'2025-01-01',end:'2025-12-31'},dataset_version:'synthetic-2026'});expect(results[0]!.data.suppression_note).toContain('5');expect(results[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
});
it.each(['John,M,4\n','John,X,50\n','John,M,1e3\n','John,M,20,extra\n','John,M,20\nJohn,M,30\n'])('rejects invalid or duplicate SSA observations',async text=>{await expect(Array.fromAsync(readSsa(bytes(zip({'yob2025.txt':text})),release))).rejects.toThrow();});
it('rejects unexpected or nested archive members instead of extracting paths',async()=>{
 for(const name of ['../yob2025.txt','sub/yob2025.txt','C:\\x.txt','random.txt'])await expect(Array.fromAsync(readSsa(bytes(zip({[name]:'John,M,20\n'})),release))).rejects.toThrow();
});
it('rejects truncated archives, CRC mismatch, oversized expansion and encrypted entries',()=>{
 const valid=zip({'test.txt':'hello'});expect(()=>openZip(valid.subarray(0,-5))).toThrow();const corrupt=zip({'test.txt':'hello'},0);corrupt[38]=corrupt[38]!^1;expect(()=>openZip(corrupt).read('test.txt')).toThrow();expect(()=>openZip(valid,{maxExpandedBytes:4})).toThrow();const encrypted=Buffer.from(valid);encrypted.writeUInt16LE(1,6);expect(()=>openZip(encrypted).read('test.txt')).toThrow();
});
it('reads split UTF-8, quoted semicolons and BOM with explicit INSEE 2026 national schema',async()=>{
 const rows=await Array.fromAsync(readInsee(bytes('\ufeffSEXE;PRENOM;PERIODE;VALEUR;RANG\r\n2;"ÉLÉONORE";2025;25;10\r\n'),{...release,locator:'https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip',schema:'2026-national'}));expect(rows[0]!.data).toMatchObject({name:'ÉLÉONORE',value:25,rank:10,precision:'rounded_5',geography:{country:'FR'}});expect(rows[0]!.data.suppression_note).toContain('5');
});
it('supports explicit INSEE 2025 regional and 2026 departmental schemas without geography collisions',async()=>{
 const r=await Array.fromAsync(readInsee(bytes('SEXE;PRENOM;PERIODE;VALEUR;REG\n1;JEAN;2024;10;01\n'),{...release,schema:'2025-regional'}));const d=await Array.fromAsync(readInsee(bytes('SEXE;PRENOM;PERIODE;VALEUR;RANG;DPT\n1;JEAN;2025;15;5;2A\n'),{...release,schema:'2026-departmental'}));expect(r[0]!.data.geography.region).toBe('REG:01');expect(d[0]!.data.geography.region).toBe('DPT:2A');
});
it.each(['SEXE;PREUSUEL;ANNAIS;NOMBRE\n1;JEAN;2025;10\n','SEXE;PRENOM;PERIODE;VALEUR;RANG\n1;JEAN;2025;12;1\n','SEXE;PRENOM;PERIODE;VALEUR;RANG\n1;JEAN;2025;0;1\n','SEXE;PRENOM;PERIODE;VALEUR;RANG\n1;_PRENOMS_RARES_;2025;10;1\n','SEXE;PRENOM;PERIODE;VALEUR;RANG\n1;JEAN;XXXX;10;1\n','SEXE;PRENOM;PERIODE;VALEUR;RANG\n1;"JEAN;2025;10;1\n'])('rejects INSEE schema drift, aggregates, malformed CSV or non-rounded counts',async text=>{await expect(Array.fromAsync(readInsee(bytes(text),{...release,schema:'2026-national'}))).rejects.toThrow();});
it('reads a validated INSEE ZIP without disk extraction',async()=>{
 const rows=await Array.fromAsync(readInseeZip(bytes(zip({'prenoms.csv':'SEXE;PRENOM;PERIODE;VALEUR\n2;ANNA;2024;25\n'})),{...release,schema:'2025-national'}));expect(rows[0]!.data.name).toBe('ANNA');
});
it('rejects invalid UTF-8, byte/line limits and cancelled streams',async()=>{
 const options={...release,schema:'2026-national' as const};await expect(Array.fromAsync(readInsee(bytes(new Uint8Array([255])),options))).rejects.toThrow();await expect(Array.fromAsync(readInsee(bytes('X'.repeat(100)),{...options,maxLineBytes:10}))).rejects.toThrow();const ctl=new AbortController();ctl.abort();await expect(Array.fromAsync(readSsa(bytes(zip({'yob2025.txt':'John,M,20\n'})),{...release,signal:ctl.signal}))).rejects.toThrow();
});
it('accepts the lowercase headers used in the official INSEE ZIP',async()=>{const rows=await Array.fromAsync(readInsee(bytes('sexe;prenom;periode;valeur;rang\n1;GABRIEL;2025;4625;1\n'),{...release,schema:'2026-national'}));expect(rows[0]!.data.name).toBe('GABRIEL');});
it('rejects stored-entry size lies before allocating the compressed body',()=>{const b=zip({'test.txt':'x'.repeat(100)},0),end=b.length-22,central=b.readUInt32LE(end+16);b.writeUInt32LE(1,22);b.writeUInt32LE(1,central+24);expect(()=>openZip(b,{maxExpandedBytes:1,maxEntryBytes:1})).toThrow();});
it('rejects mismatched local header checksums without data descriptors',()=>{const b=zip({'test.txt':'hello'});b.writeUInt32LE(123,14);expect(()=>openZip(b)).toThrow();});
