# names.data.statistics

TypeScript adapters for official personal-name statistics: SSA national name files, INSEE birth-name CSV/ZIP files and the IBGE Names API v2. Node.js 24+, ESM, no provider credentials required. Includes CLI, read-only MCP and evidence adapters for `names.research.store`.

## Setup

```sh
git clone https://github.com/lambdawalker/names.data.statistics.git
cd names.data.statistics
npm ci
npm test
npm run typecheck
```

[Linux and Windows setup](docs/setup.md) includes downloads, import examples, MCP and storage checks. Git installation is supported before an npm release: `npm install github:lambdawalker/names.data.statistics`. Documentation ships with the package.

## Source semantics

| Provider | Supported input | Meaning of observations | Important limits |
|---|---|---|---|
| SSA | National `names.zip`, `yobYYYY.txt` | US birth-year counts from Social Security card applications | Fewer-than-five disclosure exclusions; incomplete early coverage; national data excludes territories; spaces/hyphens removed by provider |
| INSEE | Explicit 2025/2026 national, regional or departmental CSV schemas, directly or inside one-file ZIP | Civil-registration births by first given name, year and source sex classification | Counts rounded to nearest five; rounded zeros omitted; 2026 ranks use unrounded values and random tie order; release geography varies |
| IBGE | v2 frequency and ranking JSON | Residents enumerated in Census 2010, grouped by birth cohort | Not complete historical births or current population; disclosure thresholds; provider normalizes names; some periods have no lower bound |

Missing results are never converted to zeros. Provider sex classifications are retained as source data, not an inference about individual gender. Geographic occurrence does not establish language-specific usage or etymology. Rank is separate from count. INSEE counts must not be used to recalculate its authoritative unrounded rank.

Legacy INSEE `PREUSUEL/ANNAIS/NOMBRE`, aggregate `_PRENOMS_RARES_` rows, unknown headers, annual placeholders and Parquet are not accepted by these CSV adapters. Select the actual release schema rather than relabeling an older file. Header case and order are normalized, while required column sets remain exact. Supported schemas:

- `2025-national`: SEXE, PRENOM, PERIODE, VALEUR; years 1900–2024.
- `2025-regional` / `2025-departmental`: add REG / DPT.
- `2026-national`: SEXE, PRENOM, PERIODE, VALEUR, RANG; years 1900–2025.
- `2026-regional` / `2026-departmental`: add REG / DPT.

## Library

```ts
import { createReadStream } from 'node:fs';
import { readSsa, readInseeZip, IbgeClient, writeImport } from '@lambdawalker/names-data-statistics';

const release = {
  version: 'SSA-download-2026-10-27',
  retrievedAt: '2026-10-27T00:00:00Z',
  locator: 'https://www.ssa.gov/oact/babynames/names.zip',
};
for await (const observation of readSsa(createReadStream('names.zip'), release)) {
  // Consume source-native observations. A full import is complete only at iterator exhaustion.
}

const client = new IbgeClient();
const frequency = await client.frequency('Maria', { sex: 'F', locality: 'BR' });
const ranking = await client.ranking({ decade: 2000, locality: 'BR' });
```

Records preserve the provider, locator, acquisition time, release, normalized observation and SHA-256 of its canonical data. ZIP-derived observations also preserve an SHA-256 of the entire compressed source artifact. Direct CSV records hash individual observations; retain your original CSV and its checksum separately when auditing a complete release. A caller-supplied version is provenance, not a claim of an upstream immutable version. SSA's download URL changes over time.

IBGE validates returned name identity (allowing case/diacritic normalization), sex and locality against the request before caching. This normalization is solely a response-coherence check; it does not merge graph forms. Names are limited to one query name; batch name syntax and `groupBy` are intentionally unsupported. Locality accepts `BR`, a two-digit state code or seven-digit municipal code. Ranking accepts decade filters from 1930 through 2010 in ten-year increments; provider absence remains absence.

## Bounded import and recovery

`readSsa`, `readInsee` and `readInseeZip` return async iterators; full input must be consumed successfully before marking a release complete. Early yielded records are provisional with respect to whole-file validity. They may be saved as individual observations by an application, but do not prove that the complete release was imported.

`writeImport(records, output, { signal, maxOutputBytes })` writes JSONL to a random private temporary file in the destination directory, appends a terminal `{type:'complete', records, sha256}` receipt, syncs it, and exclusively links the finished file to its final name. The receipt hashes the exact preceding JSONL bytes, including newlines. Failures and cancellation remove the temporary file; an existing final path is never replaced. A process crash can leave a `.partial` file, which is not a completed import. Resume by rerunning to a fresh final path; remote automatic checkpoint ingestion is outside this package.

Default output cap is 4 GiB (configurable to 8 GiB). Full detailed imports can be large because each observation carries provenance; use the CLI name filter for research pilots. Filters still validate the entire source, including all ZIP data members, before publishing completion. Importing the entire release efficiently into a database is a consumer responsibility.

The ZIP32 reader never extracts files. It rejects unsafe paths, duplicates, symlinks, encryption, multiple disks, ZIP64, unsupported methods, mismatched headers, overlapping data, size lies, corruption and truncated metadata. Supported methods are stored and deflate, with CRC verification and bounded inflation. Default archive limits: SSA 16 MiB compressed, INSEE 32 MiB compressed, 256 MiB total expansion, 64 MiB per entry, 1,000 members. UTF-8 CSV parsing is incremental and fatal on malformed encoding; CSV records are limited to 64 KiB. Raw INSEE CSV input defaults to 256 MiB. Cancellation covers queued reads and stalled source iterators.

## IBGE networking and cache

Fixed HTTPS origin; redirects are rejected. Requests serialize per client with one-second spacing, a 15-second timeout including body reads, a 1 MiB default response cap, and no automatic retries by default. Configure `retries` (0–5) explicitly if desired. HTTP 429 preserves Retry-After. Errors do not include raw response bodies. A 100-entry, five-minute LRU caches validated successes, including empty results; errors are not cached. Provider no-store/no-cache and shorter max-age directives win. Cache hits retain original retrieval provenance and return copies. Cache and request spacing are process-local, not account-wide or durable provider quotas.

## Evidence and research storage

`toDocumentInput(record)` generates deterministic Markdown; source metadata is separate, so repeated retrievals of identical observations deduplicate text while retaining provenance. Source data licensing is separate from the MIT code license. INSEE attribution and release details are preserved; IBGE public reuse remains `unknown` in metadata pending project export-policy review.

`toStatisticFinding(record, { formId, expectedName, index?, measure?: 'count'|'rank', documentId? })` creates a cited **candidate** statistic for an explicitly chosen stored form. Exact observed spelling must match `expectedName`; mapping it to a graph identity remains the caller's responsibility. Source sex and count precision remain in evidence and population scope. No forms, origins or historical edges are created automatically.

The existing storage schema requires closed date periods. IBGE's pre-1930 period and all-cohort ranking remain open in source data and can be saved as documents; the statistic adapter rejects them rather than inventing a start year. No storage schema change is required.

## MCP

`npm run mcp` exposes four read-only tools: `ibge_frequency`, `ibge_ranking`, `list_datasets` and `query_dataset`. The first two query IBGE; the last two make completed SSA/INSEE imports available to agents. Both accept `offset`, `limit` (1–50, default 10) and `snapshot`. Continuation requires the first page's snapshot; refresh changes require restarting at zero. Results are bounded to 64 KiB including the envelope. Lower `limit` on oversized output. The returned data is a page; `contentHash` identifies the full client snapshot, not that page. Assemble/fetch a complete source record through the library for evidence adapters.

Configure imported files through the server-only `STATISTICS_DATASETS` environment variable: a JSON object of up to 32 identifiers to local completed JSONL paths. Example: `{"ssa-john":"/data/john-ssa.jsonl","insee-jean":"/data/jean-insee.jsonl"}`. Use the existing import CLI first. `list_datasets` returns identifiers only; `query_dataset` accepts `dataset_id`, `name`, `offset`, `limit` and `snapshot`. It validates the full file's completion receipt, every observation and the output hash before returning a page of matching source records. Names ignore case while preserving accents. Continuation snapshots bind the complete import file; safe-integer offsets can consume all matching observations.

Each dataset query scans at most 64 MiB by default and has a 15-second MCP deadline; use name-filtered imports for agent research. The library's `queryImportedDataset(path, query, {signal,maxBytes})` allows callers to configure a different bounded input size. A large full-release JSONL must be filtered into smaller configured files or queried by the storage service. No filesystem paths, arbitrary URLs, archive imports, database commands or secrets are accepted from the model. Source evidence retains original public source locators; configured local paths are not returned. An import receipt proves completeness/integrity relative to its contents, not publisher authenticity; only configure trusted operator-produced imports.

## Validation

```sh
npm test
npm run typecheck
npm pack --dry-run
npm run smoke                     # opt-in live IBGE requests
STORE_CHECKOUT=../names.research.store npm run store:integration
SSA_ARCHIVE=tmp/names.zip INSEE_ARCHIVE=tmp/prenoms-2025-nat_csv.zip npm run import:smoke
```

CI runs offline tests and package checks on Linux/Windows, plus the real HTTP/SQLite storage compatibility script on Linux. Live checks are opt-in and are not mislabeled as offline coverage. Initial full official downloads parsed 2,181,032 SSA and 724,645 INSEE observations. IBGE live requests returned HTTP 503 in the implementation environment; authenticated access is not required, but live compatibility remains pending until a successful smoke run.

## Official references

- [SSA download formats and exclusions](https://www.ssa.gov/oact/babynames/limits.html)
- [SSA population scope and normalization](https://www.ssa.gov/oact/babynames/background.html)
- [INSEE 2026 release, variables, geography and rounding](https://www.insee.fr/fr/statistiques/8595130)
- [INSEE 2025 schema](https://www.insee.fr/fr/statistiques/8894961)
- [INSEE reuse and attribution](https://www.insee.fr/fr/information/2008466)
- [IBGE v2 documentation](https://servicodados.ibge.gov.br/api/docs/nomes?versao=2)
- [IBGE Census 2010 technical note](https://censo2010.ibge.gov.br/apps/nomes/nota.tecnica.pdf)

## Managed local API and in-memory credentials

This project ships `config.default.yaml` (loopback port **4322**) and `npm run serve`. In managed mode, the orchestrator launches the service with a per-boot control credential, checks its boot identity and sends the provider credential to authenticated `POST /v1/credentials`. Keys are held in memory; none belong in YAML. `{"token":null}` clears the credential. Public providers do not need a provider token.

`GET /v1/tools` lists tool definitions; `POST /v1/tools/TOOL_NAME` invokes the existing validated MCP tool. Both require the per-boot control credential. `GET /health` returns non-secret identity/readiness information. `npm run mcp:remote` is a stdio bridge to the local API, using `NAMES_SERVICE_URL` and `NAMES_CONTROL_TOKEN` in the supervising host's memory. The original standalone `npm run mcp` remains available for compatibility.

Use the orchestrator vault/fleet setup to avoid managing plaintext provider-key files. The managed port registry overrides the standalone default port at launch. Credentials/caches are discarded on rotation or process exit; slow requests crossing credential rotation are refused. Browser origins are rejected and listeners bind only to IPv4 loopback. See [the orchestrator setup](https://github.com/lambdawalker/ds.names.orchestrator/blob/main/docs/local-services.md).
