# Linux and Windows setup

Requires Git and Node.js 24+. No provider API keys or credential vault setup are needed. Node's built-in fetch, zlib, filesystem APIs and the installed TypeScript/MCP dependencies are used.

## Install

```sh
git clone https://github.com/lambdawalker/names.data.statistics.git
cd names.data.statistics
npm ci
npm test
npm run typecheck
```

On Linux, install Node 24+ through your normal version manager. On Windows, `winget install OpenJS.NodeJS.LTS` installs the current LTS; reopen the terminal, run `node --version`, and verify it is 24 or newer. `npm ci` runs the build through the prepare script.

## IBGE lookups

Same commands in Linux shells and PowerShell:

```sh
node dist/cli.js frequency Maria --sex F
node dist/cli.js ranking --decade 2000 --locality BR
node dist/cli.js frequency Maria --document --output maria-document.json
npm run smoke
```

These are Census 2010 resident counts, not the latest population or complete historical birth counts. HTTP 503 means the provider could not serve the request; retry later. HTTP 429 should respect the reported retry delay. No API key will fix ordinary source unavailability.

## Download official files

Linux:

```sh
mkdir -p tmp output
curl --fail --location https://www.ssa.gov/oact/babynames/names.zip --output tmp/names.zip
curl --fail --location https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip --output tmp/prenoms-2025-nat_csv.zip
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force tmp, output | Out-Null
Invoke-WebRequest "https://www.ssa.gov/oact/babynames/names.zip" -OutFile "tmp/names.zip"
Invoke-WebRequest "https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip" -OutFile "tmp/prenoms-2025-nat_csv.zip"
```

The INSEE filename refers to the latest birth year (2025); its publication/schema year is **2026**. Keep the original files with their acquisition timestamp/checksum if you need a reproducible release audit. SSA's ZIP URL changes as releases are published.

## Import one name

Commands work on Linux and PowerShell. Use one line per command:

```sh
node dist/cli.js import-ssa tmp/names.zip --version SSA-downloaded-2026-10-27 --name John --output output/john-ssa.jsonl
node dist/cli.js import-insee tmp/prenoms-2025-nat_csv.zip --schema 2026-national --version INSEE-2026-births-through-2025 --source-url https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-nat_csv.zip --name Jean --output output/jean-insee.jsonl
```

Optional `--retrieved-at 2026-10-27T00:00:00Z` records your actual acquisition timestamp; without it, the import timestamp is used. `--name` matches NFC spelling with case ignored and accents preserved. Removing the filter emits every observation and may produce a very large detailed JSONL file. All rows are validated even when a name filter is used.

Output is created only after the complete source passes validation. The last line contains a completion receipt and SHA-256 of all preceding output bytes. An existing output path is refused. Failure/cancellation does not publish a completed file; rerun to a new output name after resolving the error. A `.partial` left by a process crash is incomplete and should not be ingested as a full release.

For a raw INSEE CSV, supply its `.csv` path to the same command. Choose `2025-*` schemas for the older four-column count release, not `2026-*`. Regional/departamental schemas add the documented geography column. Legacy CSV and Parquet are intentionally unsupported.

## MCP configuration

```json
{
  "mcpServers": {
    "name-statistics": {
      "command": "node",
      "args": ["/absolute/path/names.data.statistics/dist/mcp-stdio.js"]
    }
  }
}
```

Windows paths may use forward slashes, for example `C:/dev/names.data.statistics/dist/mcp-stdio.js`. No environment secrets are needed. Tools are `ibge_frequency` and `ibge_ranking`; local archives are not accessible through MCP. This server is reusable; enabling an orchestrator enrichment phase is a separate change.

## Storage compatibility

Build a checkout of `names.research.store`, then run on Linux:

```sh
STORE_CHECKOUT=../names.research.store npm run store:integration
```

PowerShell:

```powershell
$env:STORE_CHECKOUT = "../names.research.store"
npm run store:integration
```

This uses synthetic INSEE data with the actual authenticated storage HTTP/SQLite API in a temporary directory. It checks document deduplication, source precision, candidate findings, replay and restart persistence; Neo4j is not required for this client check.

For full source-file validation, Linux:

```sh
SSA_ARCHIVE=tmp/names.zip INSEE_ARCHIVE=tmp/prenoms-2025-nat_csv.zip npm run import:smoke
```

PowerShell:

```powershell
$env:SSA_ARCHIVE = "tmp/names.zip"
$env:INSEE_ARCHIVE = "tmp/prenoms-2025-nat_csv.zip"
npm run import:smoke
```

The full scan can take a minute and prints only completion counts. It reads but does not extract or publish source files.
