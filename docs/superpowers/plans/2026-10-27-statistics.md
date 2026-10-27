# Official name statistics implementation plan

Goal: implement the approved names.data.statistics source boundary, with SSA national ZIP ingestion, versioned INSEE CSV/ZIP ingestion, IBGE frequency/ranking, CLI/MCP and source/evidence adapters.
Architecture: Node 24 TypeScript, native fetch/zlib, strict schemas and bounded in-memory ZIP reader; CSV decoding streams. Dataset import output is staged atomically and carries a terminal completion receipt; partial imports never become completed files. MCP only exposes bounded IBGE reads and does not expose filesystem paths or archive ingestion to models.

1. Tests first for chunked UTF-8 CSV, malformed records, changed INSEE headers, suppression, rounded counts, archive traversal/duplicates/encryption/bombs/CRC/truncation; implement importers and bounded ZIP reader.
2. Tests first for IBGE fixed-origin requests, native response envelopes, period bounds, census scope, empty results, errors, timeouts, aborts, quotas and size caps; implement reusable client.
3. Tests first for evidence/retrieval identity, storage mapping, refusal to invent periods, atomic imports, CLI and actual MCP; implement adapters and interfaces.
4. Linux/Windows docs, CI, synthetic storage compatibility, live official downloads/API checks, clean package verification and independent review; open PR without merging.

Decisions: national SSA only; INSEE explicit 2025/2026 CSV schemas (national/regional/departmental), reject legacy formats instead of guessing. Missing/suppressed observations are not zeros. IBGE v2 is labeled Census 2010 and its values are census-resident counts by birth cohort, not complete births. Open-ended periods remain open in source records and cannot be forced into closed database periods. Release/version and acquisition timestamp are explicit for file imports, with file content hashes in provenance.

## Execution record

49 offline tests and TypeScript typecheck pass. Clean offline npm ci and package dry run pass. Real authenticated storage HTTP/SQLite compatibility confirms candidate statistics, rounded precision metadata, deduplicated documents, idempotent replay and restart persistence. Entire official archives parsed successfully: SSA 2,181,032 observations and INSEE 724,645 observations, including after archive-header checks were tightened.

Independent review found mismatched IBGE response identity, cancellation while waiting for an import producer, and stored ZIP expansion-size lies. Each was reproduced in a failing test and fixed; the entire suite passes. Local header checksum/size mismatches also have a regression. IBGE live requests failed (HTTP 503 via proxy; native smoke returns HTTP failure); live API compatibility is explicitly pending. No provider credentials are required.

Scope decisions preserved: INSEE legacy formats/Parquet and SSA state/territory archives are rejected, not guessed; full-release database ingestion and orchestration integration remain separate. MCP exposes only remote IBGE reads, with no filesystem or import tools. Open-ended periods can be retained in evidence but cannot be coerced into the store's closed-date statistic schema.
