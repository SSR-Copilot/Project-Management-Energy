# `solution/` — the Dataverse side of the migration

This folder is the **server half** of the code-app migration package. The app in `src/`
decides what to *offer*; everything here decides what Dataverse *permits*, and one file —
`src/security/matrix.json` — is the only place either question is answered.

It exists because of a single fact about the app as it stands:

> **The admin screens have no server-side permission check.** Entry to them is gated by
> hiding nav items on `Or(IsApplicationAdministrator, IsControllerOwnData)`. In a code app
> the bundle is public, so that condition is readable as well as bypassable. **A route
> guard is not security.** `src/platform/privileges.ts` says the same thing about itself:
> it reports security the platform has already applied, and it exists "so the UI can hide
> a command the user cannot use, which is a courtesy, not a control."

So the only thing that stops a non-admin writing master data is Dataverse refusing the
request. Making it refuse is what `security/` does; **proving** it refuses is what
`../scripts/gsec.mjs` does. That proof is the gate that closes Phase 1.

---

## What this folder is NOT

**It is not a packable `.zip` solution, and there is no `solution.xml` here.**

A Dataverse solution zip needs a real solution shell: a publisher with its own id and
customization prefix, a `[Content_Types].xml`, a `solution.xml` whose `<UniqueName>` and
version match a solution that exists, and — for every component it claims — the
component's own metadata keyed by **GUIDs that only the target environment can mint**.
Role ids, privilege ids, field-security-profile ids, plugin-type ids, custom-api ids: none
of them can be known here, and a hand-authored file full of invented GUIDs does not import.
It produces one of two outcomes, and the second is worse than the first: a hard failure at
import, or a partial import that creates duplicate components alongside the real ones.

So this folder ships **scripts and data**, not a package. The order of operations is:

1. Create (or choose) an unmanaged solution **in the target environment**, with the `vsb`
   publisher prefix.
2. Run the scripts here to write the roles, the field security and the custom APIs into
   that environment, resolving every id at runtime.
3. **Export that solution from that environment.** The export is the artefact you promote
   to the next one. It is the first point at which a `.zip` is a truthful description of
   anything.

Set `VSB_SOLUTION_UNIQUENAME` before running `apply-customapis.mjs` so its rows land in
that solution rather than in Default — a Web API create has no other way to be
solution-aware, and components stranded in Default do not travel.

Nothing here needs a live environment to be **reviewed** or to be **linted**: every script
takes `--help` and a `--offline` (or `--list`) mode that prints exactly what it intends to
do, reads only `matrix.json`, and touches no network. `node --check` passes on all of them.

---

## How the matrix keeps the client and the server in agreement

`src/security/matrix.json` has exactly two consumers and neither one copies it:

```
src/security/matrix.json
   │
   ├── src/security/index.ts ─→ src/platform/privileges.ts ─→ what the UI OFFERS
   │
   └── solution/lib/dataverse.mjs ─→ apply-roles.mjs ─────────→ what Dataverse PERMITS
                                  └→ apply-columnsecurity.mjs
                                   └→ scripts/gsec.mjs ────────→ what Dataverse REFUSES
```

They agree by construction rather than by discipline. Three properties make that real:

- **No table name, role name, depth or privilege name is spelled anywhere in this folder.**
  Everything is read from the matrix at runtime. `--role` and `--table` are validated
  against its keys, and an unknown key is an error with the valid list attached.
- **`privilegeName()` is transcribed, not reinvented.** `solution/lib/dataverse.mjs`
  carries a copy of the function from `src/security/index.ts` with a comment saying so, so
  a reviewer can diff two short functions instead of trusting that two spellings of
  `prvAppendTovsb_project` happen to match. They must, because the app matches these exact
  strings when it reads the caller's effective privileges back out of Dataverse — this
  folder is what put them there.
- **Absent means none.** A grant not written in the matrix is not requested. There is no
  permissive default anywhere in this folder.

Change the matrix, re-run `apply-roles.mjs`, re-run `gsec.mjs`. Nothing else.

---

## Run order

Each step assumes the one before it. Every `apply-*` script is **dry-run by default** and
prints the exact set of changes; `--apply` writes. Re-running an applied script changes
nothing.

```bash
# 0. environment + token (see solution/lib/dataverse.mjs for the how and the why)
export VSB_DATAVERSE_URL=https://<org>.crm4.dynamics.com
export VSB_DATAVERSE_TOKEN=$(az account get-access-token \
    --resource "$VSB_DATAVERSE_URL" --query accessToken -o tsv)
export VSB_SOLUTION_UNIQUENAME=<your unmanaged solution's unique name>

# 1. read the plans with nothing connected — this is the review artefact
node solution/security/apply-roles.mjs --offline
node solution/security/apply-columnsecurity.mjs --offline
node solution/customapi/apply-customapis.mjs --offline
node scripts/gsec.mjs --list

# 2. roles and privileges. Dry run first, always.
node solution/security/apply-roles.mjs
node solution/security/apply-roles.mjs --apply

# 3. column security on the approval-state columns
node solution/security/apply-columnsecurity.mjs
node solution/security/apply-columnsecurity.mjs --apply --secure-columns
#    then: Publish all customizations, in the maker portal (step M2 below)

# 4. the custom API messages
node solution/customapi/apply-customapis.mjs
node solution/customapi/apply-customapis.mjs --apply

# 5. build + register the plugin assembly — see solution/plugins/README.md.
#    Steps M3 and M4 below are inside this one and are not scriptable.

# 6. THE GATE. As the UNPRIVILEGED user, with that user's own token.
export VSB_GSEC_URL="$VSB_DATAVERSE_URL"
export VSB_GSEC_TOKEN=<a token for a user holding no VSB master-data role>
node scripts/gsec.mjs --identity <that user's upn>

# 7. export the solution from this environment. THAT is your package.
pac solution export --name "$VSB_SOLUTION_UNIQUENAME" --path ./out --managed false
```

Step 2 before step 3: column security narrows an access the role privileges have to have
granted first, and applying it to a role set that does not exist yet produces a profile
nobody is restricted by.

Step 6 last: it is a test of the whole configuration, and running it earlier only tells you
that an unconfigured environment refuses things.

---

## What must be done in the maker portal, because it cannot be scripted

Five things. Each is listed with why the script stops short rather than guessing.

| | Step | Why it is not scripted |
|---|---|---|
| **M1** | **Assign the roles to users and teams.** `apply-roles.mjs` writes what each role *may do*; it never decides *who is in it*. | The membership is an organisational fact that is not in this repository and cannot be derived from it. A script that assigned `VSB - Application Administrator` to anybody would be making a decision it has no basis for. Prefer team-based assignment: `src/platform/privileges.ts` requires the **union** of direct and team-derived roles, and taking only direct roles is the classic way to hide a control from someone who is allowed to use it. |
| **M2** | **Publish all customizations**, after `apply-columnsecurity.mjs --secure-columns`. | Setting `IsSecured` on an attribute is a metadata change to a managed table. It needs a publish before it takes effect, and publishing is an environment-wide operation with its own timing — not something a security script should trigger as a side effect. |
| **M3** | **Add the flow identity to `VSB - Approval State Writers`** — one principal, no others. | The profile's whole purpose is to *remove* Write from everyone, leaving the 17 flows as the only path to an approval-state transition. `matrix.json` declares `members: []` and `apply-columnsecurity.mjs` writes no members at all, ever. The one member that must exist is the flow connection's user or application user; it is not derivable from this repository, so the script will not invent it. It *does* report every member it finds, as a finding, on every run. **Adding an app user to this profile defeats it** — read the header of that script before touching the membership. |
| **M4** | **Bind each plugin type to its custom API message**, and set every step SYNCHRONOUS on the MAIN OPERATION stage. | The plugin-type id does not exist until the assembly is registered, which happens after these messages are created. `apply-customapis.mjs` deliberately leaves `customapi.plugintypeid` alone and reports `! no plugintypeid bound` instead of guessing. See `solution/plugins/README.md` for the registration sequence and for the two steps that need an execution-context decision recorded in writing. |
| **M5** | **Create or choose the unmanaged solution**, and set its publisher prefix to `vsb`. | This is the solution shell discussed above. It has to exist in the environment before anything can be added to it, and its id cannot be known here. |

---

## The files

```
solution/
  README.md                          this file
  lib/
    dataverse.mjs                    the shared Web API client, argument parser, matrix
                                     reader, and the transcribed privilegeName()
  security/
    apply-roles.mjs                  matrix.json → roleprivileges, at the right depth
    apply-columnsecurity.mjs         matrix.json columnSecurityProfiles → fieldpermissions
  customapi/
    apply-customapis.mjs             *.json → customapi + parameters + response properties
    vsb_CreateCapexStandardContract.json
    vsb_CancelGateApproval.json
    vsb_CancelCheckListApproval.json
    vsb_CancelModulePermission.json
    vsb_AllocateProjectId.json
  plugins/
    README.md                        assembly name, registration steps, and which tests
                                     in the code app pin each handler's behaviour
    PluginArguments.cs               argument unpacking + the transaction guard
    CreateCapexStandardContract.cs   } five IPlugin skeletons: parameter unpacking,
    CancelGateApproval.cs            } a transaction note, and // PORT FROM: comments
    CancelCheckListApproval.cs       } naming the exact TypeScript function and test IDs
    CancelModulePermission.cs        } that already specify the behaviour. They implement
    AllocateProjectId.cs             } no business arithmetic and say so.

scripts/
  gsec.mjs                           the G-SEC gate (lives with the other gates)
```

Field security is under `security/` with the roles, not in a folder of its own: it is the
same question — who may write what — asked one level finer, and the two scripts have to be
read together.

None of these scripts is registered in `package.json`. That file is owned elsewhere, and
these are operator tools run by path, not part of the app's build.

---

## Exit codes

Uniform across all four scripts, so they compose in a pipeline.

| Code | Meaning |
|---:|---|
| `0` | the environment agrees with the matrix / the definitions. For `gsec.mjs`, **also** the deliberate skip when no environment is configured — see below. |
| `1` | **drift**, and for `gsec.mjs` **failure**: a write succeeded that should have been refused. |
| `2` | the script itself broke, including a bad command line or an invalid definition file. |
| `3` | no environment configured (`apply-*`); **inconclusive** (`gsec.mjs`). |
| `4` | a write failed during `--apply`; for `gsec.mjs`, a row it created could not be deleted. |

### `gsec.mjs` exits 0 when it did not run, and that is on purpose

This package ships **deliberately not connected**. Nothing in it has ever run against
Dataverse. A gate that fails on every developer's machine is ignored within a week, and an
ignored gate is worse than no gate — so an unconfigured run exits 0.

It is also incapable of being mistaken for a pass. The output is a banner reading
`G-SEC == S K I P P E D == NOT RUN, AND NOT A PASS`, the `--json` form sets
`"passed": false` and `"proven": false` alongside `"result": "SKIPPED"`, and the word
*pass* appears nowhere in the skip path. This matters because it has been got wrong before:
1,720 green unit tests have already been read as "security is demonstrated", and not one of
them shows Dataverse refusing anything, because Dataverse was not there.

The other thing `gsec.mjs` refuses to call a pass is anything that is not a `403`. A `404`
means the table is not deployed, so nothing was tested. A transport failure looks exactly
like security from a distance and is the easiest false pass in the business. Both are
`INCONCLUSIVE`, exit 3. And before it probes anything it checks — against the matrix —
that the identity under test holds none of the roles that grant create, write or delete on
master data, because a refusal proves nothing about a user who was never meant to be
refused.
