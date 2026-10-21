---
name: pcf-build-production
description: Package the DevexCapexSummaryPCF for production/release. Bumps the control version (ControlManifest.Input.xml) AND the solution version (src/Other/Solution.xml) each by 1, then builds the solution in Release via msbuild (production PCF bundle + packaged solution .zip). Use when the user asks to build/package/release the PCF for deployment.
---

# PCF production build

Runs one deterministic script that does the full release packaging in order.

## What it does
1. **Control version +1** — patch bump in `TableConnectedToDataversePCF/ControlManifest.Input.xml`.
2. **Solution version +1** — patch bump of the first `<Version>` in `DevexCapex_POC/src/Other/Solution.xml`.
3. **Release build** — `msbuild DevexCapex_POC/DevexCapex_POC.cdsproj -t:build -restore -p:configuration=Release`. Because the cdsproj references the pcfproj, this builds the PCF in **production** mode and packages the solution `.zip` into `DevexCapex_POC/bin/Release/`.

Version bumps persist regardless of build outcome.

> The control always renders live Dataverse data only — the old sample-data
> fallback (`TemporaryTestBudgetFallback` / `USE_DUMMY_DATA`) was removed from the
> source, so there is nothing to disable or restore here.

## How to run
Execute the helper script from the repo root and report its output:

```bash
bash .claude/skills/pcf-build-production/build-production.sh
```

Then tell the user:
- the old → new **control** and **solution** versions (printed as `>> Control version:` / `>> Solution version:`),
- whether the **build succeeded**, and the solution `.zip` location (`DevexCapex_POC/bin/Release/`).

## Notes / prerequisites
- **msbuild** must be resolvable — on PATH, or discoverable via `vswhere` (VS installed). If neither, the script exits with guidance to open a *Developer Command Prompt for VS*.
- Deployment (importing the `.zip` or `pac pcf push`) is a separate, explicit step — this skill only builds/packages.
