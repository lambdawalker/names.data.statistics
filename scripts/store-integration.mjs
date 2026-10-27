import assert from'node:assert/strict';import{mkdtemp,rm,readdir}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';import{randomBytes}from'node:crypto';
import{readInsee,toDocumentInput,toStatisticFinding}from'../dist/index.js';
assert(process.env.STORE_CHECKOUT,'Set STORE_CHECKOUT to a built names.research.store checkout');
const{Store,createApi}=await import(pathToFileURL(resolve(process.env.STORE_CHECKOUT,'dist/index.js')).href);
async function* csv(){yield Buffer.from('sexe;prenom;periode;valeur;rang\n1;JEAN;2025;25;2\n');}
const record=(await Array.fromAsync(readInsee(csv(),{schema:'2026-national',version:'synthetic-INSEE-2026',locator:'https://www.insee.fr/fr/statistiques/8595130',retrievedAt:'2026-10-27T00:00:00Z'})))[0];
const dir=await mkdtemp(join(tmpdir(),'statistics-store-'));let store=new Store(dir);const token=randomBytes(32).toString('hex');const api=createApi(store,token);
try{
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 const call=async(name,input)=>{const response=await fetch(`http://127.0.0.1:${api.address().port}/v1/operations/${name}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
 await call('record_finding',{idempotency_key:'stats-seed',forms:[{id:'jean-fr',spelling:'Jean',language:{code:'fr',name:'French'},script:'Latn',kind:'given_name',reconstructed:false,transliterations:[]}]});
 const document=await call('store_document',toDocumentInput(record));await call('store_document',toDocumentInput({...record,retrievedAt:'2026-10-28T00:00:00Z'}));assert.equal((await readdir(join(dir,'documents'))).length,1);
 const finding=toStatisticFinding(record,{formId:'jean-fr',expectedName:'JEAN',documentId:document.document_id});const first=await call('record_finding',finding),retry=await call('record_finding',finding);assert.equal(first.finding_id,retry.finding_id);
 await new Promise(r=>api.close(r));store.close();store=new Store(dir);const saved=store.readEntity('statistics',finding.statistics[0].id).entity;assert.equal(saved.status,'candidate');assert.equal(saved.value,25);assert(saved.population_scope.includes('rounded_5'));assert(store.readDocument({document_id:document.document_id}).text.includes('source_sex'));
 console.log(JSON.stringify({compatible:true,idempotentReplay:true,sourcePrecisionPreserved:true,markdownBodies:1,survivedRestart:true}));
}finally{if(api.listening)await new Promise(r=>api.close(r));store.close();await rm(dir,{recursive:true,force:true});}
