# VSBCloud Azure DevOps deployment pipelines

| | |
|---|---|
| **Organisation / project** | `vsbazure` / `vsbcloud` |
| **Documented on** | 12 Nov 2026 |
| **Source** | The pipeline YAML, templates and scripts as they are on `main` in `vsbcloud-deploy` and `vsbcloud-pcf-spreadsheet`, plus the live definitions, variable groups, environments and run history (read-only) |
| **Pipelines covered** | Export, Import-Nightly, Import, Deploy-Hotfix, Build-Deploy-Both-PCF-Components |
| **Audience** | Developers, release managers and testers who need to know what each pipeline does and how |

---

## 1. The big picture

VSBCloud is one Power Platform solution (`VSBCloud`: Dataverse tables, flows, canvas apps, code app, plug-ins, environment variables). It is built once in **Dev**, then moved to the other environments as the **same packaged artifact**. Nobody builds a separate copy per environment.

```
 Dev environment (VSBCloud_Dev)
        │  Export  (02:00 UTC nightly, or manual)         ← takes the solution OUT of Dev
        ▼
  Git (vsbcloud-deploy)  +  pipeline artifact "VSBCloud"  (versioned 1.21.N)
        │
        ├── Import-Nightly (03:00 UTC)  ──►  Nightly environment
        │
        └── Import (manual, with approvals)
               QA ──►  Prod ──┬──►  Budgeting
                              └──►  Hotfix (unmanaged copy)

 Hotfix environment (VSBCloud_Hotfix)
        │  Deploy-Hotfix (manual): export from Hotfix, then import
        ▼
     Prod ──► Budgeting

 PCF controls (separate repos)
        │  Build-Deploy-Both-PCF-Components (manual)
        ▼
     Dev ► Nightly ► QA ► Hotfix ► Prod        (solution "VSBCustomComponents")
```

### At a glance

| Pipeline | Id | Repository | Trigger | Moves what | From → To |
|---|---|---|---|---|---|
| **Export** | 9 | vsbcloud-deploy | Daily 02:00 UTC, or manual | The `VSBCloud` solution | Dev → Git and an artifact |
| **Import-Nightly** | 14 | vsbcloud-deploy | Daily 03:00 UTC, or manual | The artifact of the latest Export | Artifact → Nightly |
| **Import** | 31 | vsbcloud-deploy | Manual | The artifact of the Export run you pick | Artifact → QA → Prod → Budgeting and Hotfix |
| **Deploy-Hotfix** | 25 | vsbcloud-deploy | Manual | The `VSBCloud` solution from the Hotfix environment | Hotfix → Git → Prod → Budgeting |
| **Build-Deploy-Both-PCF-Components** | 30 | vsbcloud-pcf-spreadsheet | Manual | The two custom PCF controls as one solution | Source → Dev → Nightly → QA → Hotfix → Prod |

### Environments and approvals

| Environment (Azure DevOps) | Dataverse environment | Approval before a deployment |
|---|---|---|
| Nightly | VSBCloud_Nightly | None |
| QA | VSBCloud_QA | 1 approval |
| Prod | VSBCloud_Prod | 2 approvals |
| Hotfix | VSBCloud_Hotfix | None |
| Budgeting | VSBCloud_Budgeting | None |
| Dev | VSBCloud_Dev | None |

---

## 2. Building blocks shared by the pipelines

### 2.1 Where the code lives (`vsbcloud-deploy`)

| Folder | What is in it |
|---|---|
| `pipelines/` | The pipeline YAML files (`export.yml`, `import.yml`, `import-nightly.yml`, `deploy-hotfix.yml`, and others not covered here) |
| `pipelines/templates/` | Reusable steps: `export-solution.yml`, `create-solution-artifact.yml`, `find-releaseworkitems.yml`, `import-solution.yml`, `CanvasApp-Unpack.yml` |
| `pipelines/scripts/` | `Find-NewPBIsSinceLastBuild.ps1` (builds the change log) |
| `configs/VSBCloud/` | One deployment-settings file per environment: `config_nightly.json`, `config_qa.json`, `config_prod.json`, `config_hotfix.json`, `config_budgeting.json` |
| `solutions/VSBCloud/` | The unpacked solution from Dev, as readable files (about 1,700 files) |
| `Application Insights/` | A second unpacked copy of the same solution, including the code app package |
| `hotfix/solutions/VSBCloud/` | The unpacked solution exported from the Hotfix environment (about 1,500 files) |
| `changelogs/` | One text file per release, listing the finished work items |
| `powershell/` | Environment setup scripts, run by hand (section 8) |
| `azure-pipelines.yml` | An unrelated utility: it calculates the latest 30-minute system backup time for a restore. Not part of the five pipelines |

### 2.2 Versioning

- **Variable group `Versioning`** holds `Major` and `Minor`.
- The Export run name is `$(Major).$(Minor).$(Rev:r)`, which gives numbers like **1.21.786**. The last part counts up for each run.
- That number becomes the solution version in Dev, the Git tag (`v1.21.786`) and the artifact version. The later pipelines show the same number as their run name.
- **Variable group `Production`** holds `Version`, the version last released to Prod. Import writes it after a Prod deployment, and Deploy-Hotfix uses it to name its runs (for example 1.21.593.6).

### 2.3 Service connections

One Power Platform service principal connection per environment, all named `PA VSB-Cloud [<environment>] Environment Connection`: Dev, Nightly, QA, Prod, Hotfix, Budgeting, ProdImportTest and BackupRestore. The import template builds the name from the environment (`VSBCloud_<environment in lower case>`), so adding an environment needs a matching connection.

### 2.4 Deployment settings files (`configs/VSBCloud/config_*.json`)

Each file tells the import what to set in the target environment, so one solution works everywhere:

| File | Environment variables | Connection references |
|---|---|---|
| `config_nightly.json` | 31 | 13 |
| `config_qa.json` | 32 | 12 |
| `config_prod.json` | 25 | 12 |
| `config_hotfix.json` | 25 | 12 |
| `config_budgeting.json` | 24 | 11 |

- **Environment variables:** values such as `vsb_EnvironmentName`, Fabric SQL server and database, Power BI IDs and report IDs, the service account mail.
- **Connection references:** which connection each flow uses in that environment.
- **Version stamping:** the first variable in the file (`vsb_AppVersion`) is overwritten at deploy time with the build version, so the app can show which version is installed.

### 2.5 The Power Platform tasks used

| Task | What it does |
|---|---|
| `PowerPlatformToolInstaller` | Installs the Power Platform tools on the build agent |
| `PowerPlatformSetSolutionVersion` | Stamps the version number on the solution in the source environment |
| `PowerPlatformPublishCustomizations` | Publishes pending customizations so the export includes them |
| `PowerPlatformExportSolution` | Exports the solution, unmanaged or managed |
| `PowerPlatformChecker` | Runs the Power Apps Checker rules on the solution |
| `PowerPlatformUnpackSolution` / `PackSolution` | Turns the solution zip into readable files and back |
| `PowerPlatformImportSolution` | Imports the solution into the target environment |

---

## 3. Export

**Purpose:** take the current `VSBCloud` solution out of the Dev environment, store it in Git as readable files, build a versioned deployable package, and note which work items it contains.

| | |
|---|---|
| **Definition** | `pipelines/export.yml` (pipeline id 9) |
| **Trigger** | Daily at 02:00 UTC on `main`, or manual. Not triggered by commits |
| **Source environment** | VSBCloud_Dev |
| **Run name** | `<Major>.<Minor>.<run number>`, for example 1.21.786 |
| **Output** | Git commit and tag `v<version>`; pipeline artifact `VSBCloud`; a change log file |
| **Recent runs** | 40 of the last 40 succeeded (32 by schedule, 8 manual). Typical time 26 minutes, longest 32 |

### 3.1 Stage 1: Exporting solutions (`export-solution.yml`, timeout 60 minutes)

1. **Check out the repository** with credentials kept, so the job can push later.
2. **Install the Power Platform tools.**
3. **Set the solution version** in Dev to the build number.
4. **Publish all customizations** in Dev, so unpublished changes are included.
5. **Export the solution twice:** unmanaged (`VSBCloud-solution.zip`) and managed (`VSBCloud-solution_managed.zip`), both into `solutions/exported/`.
6. **Run the Solution Checker** on the unmanaged zip. The run **fails if one or more critical issues are found**.
7. **Unpack the solution** into `solutions/VSBCloud/` (both managed and unmanaged parts), so every change is visible as a Git diff.
8. **Clear and recreate** the folder `Application Insights/VSBCloud/`.
9. **Unpack the solution a second time** into `Application Insights/VSBCloud/`.
10. **Commit and tag** (only on `main`): add all changes, commit with the message `export VSBCloud for build <id>`, pull, tag `v<version>`, and push with tags.

### 3.2 Stage 2: Creating artifacts (`create-solution-artifact.yml`, timeout 10 minutes, `main` only)

1. Check out the repository and **switch to the tag** just created (`v<version>`).
2. **Pack** `solutions/VSBCloud` into two zips (managed and unmanaged), under `packed/solutions/`.
3. **Publish `packed/` as the pipeline artifact `VSBCloud`.** This is what the Import pipelines deploy.

The artifact is built from the tagged Git files, not from the export zips, so what is deployed is exactly what is in Git.

### 3.3 Stage 3: Find closed work items since the last successful build (`find-releaseworkitems.yml`)

Runs on Linux and calls `Find-NewPBIsSinceLastBuild.ps1`:

1. Finds the **last successful run** of the Export pipeline on `main`. If none, it looks 30 days back.
2. Queries Azure Boards for **Product Backlog Items and Bugs in state Done** whose state changed after that date (minus one day as a safety margin).
3. Writes a **change log file** `changelogs/<date>_<build>.txt`, one line per item (id, title, assigned to).
4. **Commits and pushes** that file with all the item numbers in the message, so each work item gets linked to the commit.
5. Retries each API call up to 3 times with growing waits. It runs with `errorActionPreference: continue`, so a problem here does not fail the pipeline.

The release name used in the log (`Dione`) is a pipeline-level variable (`release`).

---

## 4. Import-Nightly

**Purpose:** automatically deploy the newest Export to the Nightly environment every night, so the team has a fresh, current environment each morning.

| | |
|---|---|
| **Definition** | `pipelines/import-nightly.yml` (pipeline id 14) |
| **Trigger** | Daily at 03:00 UTC on `main` (one hour after Export), or manual |
| **Reads from** | The latest run of the **Export** pipeline (the pipeline resource `export`) |
| **Target** | Nightly (VSBCloud_Nightly), no approval |
| **Parameter** | `stageAndUpgrade` (default true) |
| **Recent runs** | 31 of the last 32 succeeded, 1 failed (31 by schedule, 1 manual). Typical time 26 minutes, longest 55 |

### Steps

1. **Init stage:** renames this run to the Export run name (for example 1.21.786), so it is clear which build is deployed.
2. **Deploy stage:** a deployment job on the Nightly environment. It sets the pipeline variable `EnvironmentVariables.0.Value` to the Export version and calls the shared **import template** (section 7) with:
   - solution `VSBCloud`, type **Managed**;
   - environment **Nightly**;
   - the Export artifact and version above.

The 03:00 start assumes the 02:00 Export has finished (it takes about 26 minutes). If an Export is still running or has failed, Nightly deploys the latest completed Export run.

---

## 5. Import

**Purpose:** the controlled release path. The same Export artifact is deployed in order to QA, then Prod, then Budgeting and Hotfix, with approvals on the way.

| | |
|---|---|
| **Definition** | `pipelines/import.yml` (pipeline id 31) |
| **Trigger** | Manual only. You choose which Export run to deploy through the pipeline resource |
| **Parameter** | `stageAndUpgrade` (default true) |
| **Recent runs** | 11 manual runs: 6 succeeded, 2 failed, the rest not finished at the time of writing. Runs include the waiting time for approvals |

### 5.1 Stage flow

| Stage | Job | Environment | Package | Notes |
|---|---|---|---|---|
| Init | Init build name | none | none | Renames the run to the Export version |
| **QA** | Deploy to QA | QA (1 approval) | Managed | Runs after Init |
| **Prod** | Deploy to Prod | Prod (2 approvals) | Managed | Runs only if QA succeeded |
| Prod | Deploy to Budgeting | Budgeting | Managed | Starts after the Prod job succeeds |
| Prod | Deploy to Hotfix | Hotfix | **Unmanaged**, no stage-and-upgrade | Starts after the Prod job succeeds |

### 5.2 What the Prod job also does

After a successful Prod import, a step runs `az pipelines variable-group variable update` on the variable group **Production** (group id 3), and sets `Version` to the version just deployed. It authenticates with the pipeline's own build token.

This is what tells the **Deploy-Hotfix** pipeline which version is in production.

### 5.3 Why Hotfix is unmanaged and different

The Hotfix environment is where emergency fixes are built. It gets an **unmanaged** copy of the Prod release, so developers can edit it, and it is imported without stage-and-upgrade (a plain overwrite).

---

## 6. Deploy-Hotfix

**Purpose:** ship an urgent fix. The fix is built in the **Hotfix environment**, exported from there, and imported directly into Prod and Budgeting, bypassing the normal Dev → QA route.

| | |
|---|---|
| **Definition** | `pipelines/deploy-hotfix.yml` (pipeline id 25) |
| **Trigger** | Manual only |
| **Run name** | `$(Version).$(Rev:r)` where `Version` comes from the variable group `Production`, so a hotfix run looks like **1.21.593.6** (the last Prod version plus a counter) |
| **Source environment** | VSBCloud_Hotfix |
| **Targets** | Prod (2 approvals), then Budgeting |
| **Recent runs** | 3 manual runs, all succeeded. Typical time 48 minutes, longest 54 |

### 6.1 Stage 1: Export (two jobs)

**Job: Export Hotfix Solution** (timeout 60 minutes)
1. Set the solution version in the Hotfix environment to the build number, publish customizations.
2. Export unmanaged and managed zips.
3. Run the Solution Checker (fails on one or more critical issues).
4. Unpack the solution into **`hotfix/solutions/VSBCloud/`**, a separate folder from the regular `solutions/` so hotfix and Dev exports do not collide.
5. Commit, tag `v<build number>` and push to `main`.

**Job: Create Artifact Hotfix Solution** (timeout 10 minutes)
1. Check out the tag just pushed.
2. Pack the unpacked solution into managed and unmanaged zips.
3. Copy the config files to `packed/configs/` and apply the version variable to them.
4. Publish the artifact `VSBCloud`.

### 6.2 Stage 2: Import

| Job | Environment | Settings file |
|---|---|---|
| Deploy to Prod | Prod (2 approvals) | `config_prod.json` |
| Deploy to Budgeting (after Prod succeeds) | Budgeting | `config_budgeting.json` |

Both import the **managed** zip with stage-and-upgrade, convert to managed and publish customizations.

### 6.3 What it does not do

It does not deploy to QA or Nightly, and it does not copy the fix back into Dev. See section 9.

---

## 7. The shared import template (`templates/import-solution.yml`)

Used by Import-Nightly and Import. The inputs are the solution name, environment (Nightly, QA, Prod, Hotfix or Budgeting), solution type (Managed or Unmanaged), the Export version and `stageAndUpgrade`.

1. Check out the repository and install the Power Platform tools.
2. **Transform the config files:** the `FileTransform` task replaces the pipeline variable `EnvironmentVariables.0.Value` inside `config_*.json`, which stamps the version into the first environment variable.
3. **Import the solution** using the service connection for that environment:
   - Managed: `VSBCloud_managed.zip` from the Export artifact; Unmanaged: `VSBCloud.zip`.
   - Uses the environment's `config_<environment>.json` as deployment settings (environment variables and connection references).
   - Runs asynchronously, waiting up to 60 minutes.
   - **Stage and upgrade:** the new version is loaded alongside the old one and then applied as an upgrade. Components deleted in Dev are also removed from the target.
   - Converts to managed and publishes customizations.

---

## 8. Build-Deploy-Both-PCF-Components

**Purpose:** build the two custom PCF controls used in the apps (the spreadsheet grid and the CAPEX summary table) into one solution, **VSBCustomComponents**, and release it through all the environments.

| | |
|---|---|
| **Definition** | `pipelines/azure-pipelines-build-deploy.yml` in the repository **vsbcloud-pcf-spreadsheet** (pipeline id 30). This one is not in `vsbcloud-deploy` |
| **Trigger** | Manual only |
| **Second repository** | `vsbcloud/DevexCapexSummaryPCF`, checked out next to the first |
| **Run name** | `1.0.<patch>.<counter>`, for example 1.0.0.114. The counter restarts if the version setting changes |
| **Recent runs** | 3 manual runs, all succeeded (latest 1.0.0.114) |

### 8.1 Stage: Build

1. Check out both repositories into separate folders.
2. Install the Power Platform tools and run `npm install` in both PCF projects.
3. Find the `pac` tool path and add it to the PATH.
4. Create a new solution project `VSBCustomComponents` (publisher **VSBCloud**, prefix **vsb**).
5. **Raise the solution project's .NET Framework to 4.8.** The CAPEX summary control needs 4.8, and the generated project defaults to 4.6.2.
6. **Add both PCF projects as references** to the solution project.
7. **Set versions:** control versions use the build numbers (all manifests), and the solution gets the revision number.
8. **Build twice** with MSBuild: once for the unmanaged zip (Debug) and once for the managed zip (Release).
9. Rename the outputs to `VSBCustomComponents_<major>_<patch>_<counter>.zip` (unmanaged) and `…_managed.zip`.
10. **Publish** them as the pipeline artifact `VSBCustomComponents`.

### 8.2 Stages: Dev → Nightly → QA → Hotfix → Prod

Each stage depends on the one before it and deploys the **managed** zip through the PCF import template:

1. Copies the zip from the build artifact.
2. Imports it into that environment with its service connection, asynchronously (up to 60 minutes), converting to managed and publishing customizations.

QA and Prod use the same Azure DevOps environments, so the same **approvals** apply (1 for QA, 2 for Prod). The PCF import does not use a deployment settings file, because the solution holds no environment variables or connection references.

A sibling file, `azure-pipelines-build-deploy-both-pcfs.yml`, is the same pipeline with an extra **Budgeting** stage after Prod. The pipeline documented here (id 30) points at the version without Budgeting. A separate pipeline, **Build-PCF-Components** (id 32), only builds.

---

## 9. Observations and risks

These come from reading the files. None has been changed.

| # | Observation | Why it matters |
|---|---|---|
| 1 | **The Export commit uses a hard-coded author** of a former consultant (and a garbled email value) in `export-solution.yml` and `deploy-hotfix.yml`. The change-log script uses a neutral "AzD Pipeline" identity | Commits in Git show a person who is no longer part of the process. Replace with the pipeline identity |
| 2 | **The solution is unpacked twice** in Export (`solutions/VSBCloud` and `Application Insights/VSBCloud`), and both are committed | The repository holds two copies, which makes it large (about 5,000 files) and slow to clone. Confirm that both are needed |
| 3 | **Hotfix changes are not brought back to Dev.** Deploy-Hotfix exports from the Hotfix environment and deploys to Prod, but nothing merges that fix into Dev | The next regular release can overwrite the hotfix. This needs a manual step or a documented rule |
| 4 | **Deploy-Hotfix pushes its export straight to `main`** (no pull request) and then deploys to Prod, where the 2 Prod approvals are the only gate | Keep the approvers' list up to date |
| 5 | **The PCF import template ignores `stageAndUpgrade`** (it is a parameter but never passed to the task), and the parameter `pipelineResourceName` is unused | PCF imports are not upgrades. Removed components stay in the target |
| 6 | **Nightly starts one hour after Export with no dependency.** If Export runs long or fails, Nightly deploys the previous Export | Nightly can silently be one day behind. A trigger on Export completion would remove the gap |
| 7 | **The Import prod step writes to the `Production` variable group using the pipeline's build token** | The build service account needs permission on that group. If that permission is removed, Prod deploys but Deploy-Hotfix then gets the old version |
| 8 | **Solution Checker fails the Export on one or more critical issues** | A single critical issue blocks the daily Export. It is intentional, but it can surprise the team |
| 9 | **Cron times are UTC** | 02:00 and 03:00 UTC are 03:00/04:00 or 04:00/05:00 in Germany, depending on daylight saving time |
| 10 | **`config_*.json` hold environment-specific IDs and URLs**, so they must be updated in Git whenever a new environment variable is added to the solution | A variable missing from the file gets its default value (or none) in that environment. The Azure Maps variables are an example |

---

## 10. Quick reference: how to run each pipeline

| I want to… | Run | Note |
|---|---|---|
| Refresh Git and the artifact from Dev now | **Export** | Takes about 26 minutes |
| Deploy the latest Dev build to Nightly now | **Import-Nightly** | Needs a finished Export |
| Release to QA, then Prod | **Import** | Pick the Export run to deploy. Approve QA, then Prod |
| Release an urgent fix | **Deploy-Hotfix** | Build the fix in the Hotfix environment first |
| Release the custom controls | **Build-Deploy-Both-PCF-Components** | Goes Dev → Nightly → QA → Hotfix → Prod |
