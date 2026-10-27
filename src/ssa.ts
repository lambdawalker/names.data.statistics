import { openZip } from './zip.js';
import { readRows, collect } from './stream.js';
import { integer, SourceError, checkAbort } from './errors.js';
import { validateRelease, observation, hash } from './provenance.js';
import type { Release, SourceRecord } from './types.js';
export async function* readSsa(stream:AsyncIterable<Uint8Array>,release:Release):AsyncGenerator<SourceRecord>{
 validateRelease(release);const archive=await collect(stream,release.maxBytes??16777216,release.signal);const artifactHash=hash(archive);const zip=openZip(archive);let files=0;
 for(const name of zip.names){checkAbort(release.signal);if(/^NationalReadMe\.(?:pdf|txt)$/i.test(name)){zip.read(name);continue;}const match=/^yob(\d{4})\.txt$/.exec(name);if(!match)throw new SourceError('unsupported','Only SSA national yobYYYY.txt files are supported');const year=integer(match[1]!,1880,2100);files++;
  const seen=new Set<string>();async function* bytes(){yield zip.read(name);}
  for await(const {cells,row} of readRows(bytes(),',',release)){
   if(cells.length!==3||!cells[0]?.trim()||cells[0].length>256||!['M','F'].includes(cells[1]!))throw new SourceError('invalid_response','Invalid SSA row');
   const [spelling,sex,count]=cells as [string,'M'|'F',string];const key=spelling+'\0'+sex;if(seen.has(key))throw new SourceError('invalid_response','Duplicate SSA observation');seen.add(key);
   yield observation('ssa',{name:spelling,sex,source_sex:sex,geography:{country:'US'},period:{label:String(year),start:`${year}-01-01`,end:`${year}-12-31`},measure:'birth_count',value:integer(count,5),precision:'exact',dataset_version:release.version,population_scope:'US Social Security card applications; births in 50 states and DC, not territories; not a count of living people. Spaces and hyphens are removed by SSA; early coverage is incomplete.',suppression_note:'SSA excludes observations that reveal fewer than 5 occurrences; absent names are unknown or suppressed, never zero.'},release,release.locator+`#${name}:record=${row}`,artifactHash);
  }
 }
 if(!files)throw new SourceError('invalid_response','SSA archive has no annual data files');
}
