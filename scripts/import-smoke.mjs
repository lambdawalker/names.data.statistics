import{createReadStream}from'node:fs';import{readSsa,readInseeZip}from'../dist/index.js';
if(!process.env.SSA_ARCHIVE||!process.env.INSEE_ARCHIVE)throw Error('Set SSA_ARCHIVE and INSEE_ARCHIVE to downloaded official ZIP paths');
const common={retrievedAt:new Date().toISOString(),version:'local-import-smoke-2026-10-27'};
for(const [source,rows]of [['ssa',readSsa(createReadStream(process.env.SSA_ARCHIVE),{...common,locator:'https://www.ssa.gov/oact/babynames/names.zip'})],['insee',readInseeZip(createReadStream(process.env.INSEE_ARCHIVE),{...common,schema:'2026-national',locator:'https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip'})]]){let count=0;for await(const record of rows)count++;console.log(JSON.stringify({source,complete:true,observations:count}));}
