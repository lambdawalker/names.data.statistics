import{IbgeClient,toDocumentInput}from'../dist/index.js';
try{const client=new IbgeClient();const frequency=await client.frequency('Maria');const ranking=await client.ranking({decade:2000});toDocumentInput(frequency);toDocumentInput(ranking);console.log(JSON.stringify({live:true,frequencyObservations:frequency.data.length,rankingObservations:ranking.data.length,census:'2010',credentialsRequired:false}));}
catch(error){console.error('IBGE live smoke failed ('+(error.code??'unknown')+'); source availability is not verified.');process.exitCode=1;}
