# The VSBCloud security model

For whoever configures the Dataverse environment this code app will run against. It explains
what the repository decides, what it deliberately does not decide, and what is still owed
before go-live.

The working rule, and everything below follows from it:

> **A restriction that exists only in the client is not a restriction.**

The canvas apps gated their administration screens by hiding nav items on
`Or(IsApplicationAdministrator, IsControllerOwnData)`, with no server-side check at all. In a
code app the bundle is public, so that condition is readable as well as bypassable. This
rebuild keeps a route guard for the same courtesy reason and says so in its own source: it
exists so a user is not shown a command they cannot use. The only thing that stops a
non-administrator writing master data is Dataverse refusing the request.

---

## The four layers

| | Layer | Where it lives | What it is worth |
|---|---|---|---|
| 1 | **Route and nav gating** | `RequireAdmin` in `src/routes/AppRoutes.tsx`, `canSeeAdminSection` in `src/domain/session.ts` | Nothing, as security. It stops an honest user reaching a screen that would only fail. |
| 2 | **Command gating** | `privileges.forTable` / `forRecord`, consumed by every command bar | Nothing, as security — but it is *correct*, which layer 1 is not: it reports the privileges the platform has actually applied rather than guessing from a role name. |
| 3 | **Role privileges** | `src/security/matrix.json`, written into Dataverse by `solution/security/apply-roles.mjs` | This is the security. 2,031 grants across 5 roles and 85 tables, at explicit depths. |
| 4 | **Column security** | `columnSecurityProfiles` in the same file, applied by `solution/security/apply-columnsecurity.mjs` | Row-level privileges asked one level finer: 13 approval-state columns nobody but the flows may write. |

Layers 1 and 2 are the app. Layers 3 and 4 are `solution/`. They are driven from **one
file**, which is the point of the design: `src/security/matrix.json` has exactly two
consumers and neither copies it —

```
src/security/matrix.json
   │
   ├── src/security/index.ts ─→ src/platform/privileges.ts ─→ what the UI OFFERS
   │
   └── solution/lib/dataverse.mjs ─→ apply-roles.mjs ─────────→ what Dataverse PERMITS
                                  └→ apply-columnsecurity.mjs
                                   └→ scripts/gsec.mjs ────────→ what Dataverse REFUSES
```

— so the client and the server cannot hold two different opinions about who may write what.
No table name, role name, depth or privilege name is spelled anywhere in `solution/`; it is
all read from the matrix at runtime, and `privilegeName()` is transcribed into
`solution/lib/dataverse.mjs` with a comment saying so, so a reviewer can diff two short
functions instead of trusting that two spellings of `prvAppendTovsb_project` happen to
match. **Absent means none**: a grant not written in the matrix is not requested, and there
is no permissive default on either side.

Change the matrix, re-run `apply-roles.mjs`, re-run `gsec.mjs`. Nothing else.

---

## The five roles

| Key | Dataverse role name | For |
|---|---|---|
| `applicationAdministrator` | `VSB - Application Administrator` | Full master-data authority across all countries and technologies. **The only role that may delete master data.** |
| `controllerOwnData` | `VSB - Controller Own Data` | Maintains master data but may not delete it. Reads project data; never writes it. |
| `projectDataAllCountries` | `VSB - Project Data All Countries` | Reads and writes project data in every country. Reads master data; never writes it. |
| `projectDataOwnCountry` | `VSB - Project Data Own Country` | Reads and writes project data inside its own business unit, which is the country. |
| `projectManagerOwnProjects` | `VSB - Project Manager Own Projects` | Reads and writes only the projects the user owns. Reads at `businessUnit` depth so a manager can see the country's portfolio; writes, deletes and shares at `user`. |

Each role has a `_masterData` grant default and a `_projectData` grant default, plus per-table
overrides where it diverges (today there is exactly one override per role, on the
`applyAndApplyAllTrackings` audit trail). The two defaults exist because the interesting
property of the matrix is a sentence rather than a table:

> **No role writes both master data and project data except the administrator.**

Writing that as two defaults makes the exceptions visible. Writing it as 425 explicit rows
would bury it.

`apply-roles.mjs` writes what each role *may do*. It never decides *who is in it* — that is
an organisational fact this repository does not contain and cannot derive, and a script that
assigned `VSB - Application Administrator` to anybody would be making a decision it has no
basis for. **Prefer team-based assignment.** `src/platform/privileges.ts` requires the union
of direct and team-derived roles; taking only direct roles is the classic way to under-report
a privilege and hide a control from someone who is in fact allowed to use it, and
`src/platform/bootstrap.ts` issues two separate reads — `systemuserroles` and
`teamroles`/`teammembership` — precisely to compose that union.

---

## The 85 tables, and how a grant becomes a Dataverse privilege

Every table carries a `kind`, and the kind decides how the defaults apply and whether a write
is possible at all:

| `kind` | Count | Meaning |
|---|---:|---|
| `masterData` | 13 | Maintained through one of the six administration screens. Read by everyone, written by the administrator and the controller, deleted by the administrator alone. All 13 are `organization`-owned and all 13 have a verified logical name. |
| `projectData` | 38 | One project's own rows. All `user`-owned, all `requiresOwningBusinessUnit`. |
| `reference` | 22 | A lookup list this app only reads. `readOnly`. |
| `platform` | 5 | Dataverse system tables — users, teams, roles, environment variables. `readOnly`; read is what bootstrap needs. |
| `connected` | 7 | Mirrors of a Fabric/SQL source. `readOnly`; the write path is the pipeline, not this app. |

**Depths** are the platform's own `PrivilegeDepthMask` values, and they are a bit mask, not
an ordinal: `none` 0, `user` 1, `businessUnit` 2, `parentChildBusinessUnit` **4**,
`organization` **8**. `apply-roles.mjs` sends the number straight to the Web API, so the
gap between 2 and 4 is deliberate and must not be "tidied". Where a user holds a privilege
through more than one role, the effective depth is the **widest** one — which is how
Dataverse resolves a union, and what `effectiveDepth` in `src/security/index.ts` reproduces.

**The privilege name** is `prv<Verb><logicalName>` — `prvCreatevsb_capexaccountlist`,
`prvAppendTovsb_project`. `privilegeName()` builds it, `apply-roles.mjs` resolves it against
the `privileges` table, and `platform/privileges.ts` matches these exact strings when it
reads the caller's effective privileges back out in `power` mode. This folder is what put
them there.

**`readOnly` is a hard mask.** `grantFor` resolves create, write and delete to `none` for
every role on all 34 read-only tables, whatever the grant defaults say, and
`apply-roles.mjs` writes no write privilege for one either. It is applied in `grantFor`
rather than at each call site because there are three call sites today and there will be
more; and `check-matrix.mjs` **fails** if the file even tries to express a write on a
read-only table, so the file cannot come to disagree with the runtime.

**`requiresOwningBusinessUnit` is not cosmetic.** Omitting the column on a create does not
fail: Dataverse derives the owning BU from the caller's own, so on a developer's tenant
everything looks right, and the row only disappears later, for a BU-scoped colleague in
another country. `G-OWN` (`npm run gate:own`) is the check, and
`reference/ownership-baseline.json` records the 16 call sites that still owe it — 15 to the
`security-owner`, one correctly attributed to the platform default.

---

## The column-security profile, and the standing decision on flows

One profile: `VSB - Approval State Writers`. Thirteen columns across two tables —

- `vsb_projectstatetracking` — `vsb_approvalclusterstate`, `vsb_approvalcomment`,
  `vsb_approvalduedate`, `vsb_flowrunid`, `vsb_flowapprovalid`,
  `vsb_lasttriggeredapprovalmode`, `vsb_lasttriggeredapprovalpersonas`
- `vsb_projectchecklist` — `vsb_approvalcheckliststate`, `vsb_approvalstepstatecode`,
  `vsb_approvalcomment`, `vsb_approvalduedate`, `vsb_flowrunid`, `vsb_flowapprovalid`

— secured with `canread = 4` (Allowed) and `cancreate = canupdate = 0` (Not allowed).

**It has no members, and the empty membership is the whole mechanism.** `matrix.json`
declares `members: []`, and `apply-columnsecurity.mjs` writes no members at all, ever.

This is how the standing decision on the flows is enforced. The seventeen Power Automate
flows are **untouched** by this migration: none can be absorbed into app code, because every
one of them either waits on an approval webhook or is triggered by a Dataverse row change.
The decision was not to move the approval logic server-side but to make the flow the *only*
path to an approval-state transition — and the way to do that is not to add a check, it is to
**remove Write from everyone else**. Secure the columns, grant the profile to nobody, and any
client write to `vsb_approvalclusterstate` fails at the platform regardless of which role the
caller holds or which screen they came from. The transition becomes flow-only by
construction.

Exactly one principal must then be added: the flow connection's user or application user.
That is not derivable from this repository, so the script will not invent it — but it *does*
report every member it finds, as a finding, on every run. **Adding an app user to this
profile defeats it.**

Order matters: apply the roles first, then the column security. The profile narrows an access
the role privileges have to have granted in the first place, and applying it to a role set
that does not exist yet produces a profile nobody is restricted by. Setting `IsSecured` on an
attribute is a metadata change and needs **Publish all customizations** afterwards.

---

## What G-SEC proves, and what it cannot

`scripts/gsec.mjs` takes a real token for a real unprivileged identity and attempts a real
`POST <entityset> {}` against every table the matrix marks `isMasterData`, asserting that
Dataverse answers 403. That sentence — *an authenticated user holding no VSB master-data role
is refused by Dataverse, not by the UI, on a direct Web API write* — is the exit condition
for Phase 1 of the migration.

**What it proves.** That the configuration is real. A 403 with a privilege-denied fault
against an identity the script has itself verified holds none of the granting roles is the
only evidence in this whole package that layer 3 exists.

**What it cannot.**

- **It has never run.** This package ships deliberately not connected; nothing in it has
  ever contacted Dataverse. An unconfigured run exits 0 on purpose — a red build on every
  developer's machine for a gate that cannot run there would be ignored within a week, and
  an ignored gate is worse than no gate. It is also incapable of being mistaken for a pass:
  the banner reads `G-SEC == S K I P P E D == NOT RUN, AND NOT A PASS`, `--json` sets both
  `"passed": false` and `"proven": false`, and the word *pass* appears nowhere in the skip
  path. This matters because it has been got wrong before: **1,720 green unit tests have
  been read as "security is demonstrated", and not one of them shows Dataverse refusing
  anything, because Dataverse was not there.**
- **It only tests create.** An empty-body POST is the minimal possible write, chosen so a
  400 can never be an artefact of the script guessing a column name. It says nothing about
  update or delete on the same table, and nothing at all about read.
- **It only tests the identity you hand it.** A refusal for one unprivileged user is not a
  statement about the four roles that *are* meant to write. Nothing in this package tests
  the positive case — that a controller can in fact save master data — and nothing can,
  from here.
- **It is silent on rows.** Every probe is a table-privilege probe. Business-unit depth,
  ownership and sharing — the whole of layer 3's row behaviour and the reason
  `requiresOwningBusinessUnit` exists — are untested by it.
- **It refuses to call anything else a pass, which is a feature.** 404 means the table is
  not deployed, so nothing was tested (`MISSING`, exit 3). 400 means the request was
  rejected before authorization. 401 means the whole run is meaningless. A transport
  failure looks exactly like security from a distance and is the easiest false pass in the
  business. 429/503 after retries is throttling, not refusal. All are `INCONCLUSIVE`. A 2xx
  is a **failure**, and if a create succeeds the script deletes the row, re-reads to confirm,
  and if it cannot delete prints the entity set and the id in a block designed to be
  impossible to skim past.
- **A pre-flight is not a proof either, but it stops the commonest false one.** `WhoAmI`
  names the identity, `--identity <upn>` is compared against its `domainname`, and the
  identity's roles are checked against the matrix to confirm it holds none that grant
  create, write or delete on master data. A refusal proves nothing about a user who was
  never meant to be refused.

```bash
node scripts/gsec.mjs --list      # exactly what would be probed. Contacts nothing.
npm run gate:sec                  # skips loudly with no environment configured
```

One thing to know before you read a G-SEC report. `--list` names **47** tables, not 13. The
script selects on `isMasterData`, which is true for reference lists, Dataverse system tables
and Fabric mirrors as well — because that flag selects the *grant default*, not the
administration surface. `src/security/index.ts` recognises the difference and exports
`MASTER_DATA_TABLES` (the 13 tables with `kind: "masterData"`) as the intended G-SEC surface,
noting in as many words that the `isMasterData` set "would have tried a write probe against
`systemusers`". The script has not been moved onto that list. The consequence is not a false
pass — an unprivileged POST to `systemusers` is refused too — but 34 of the 47 probes are
read-only tables where the refusal proves nothing about the administration screens, and the
report is 47 lines long where 13 would be the answer. Reconcile the two before quoting a
G-SEC run as the Phase 1 exit.

---

## What is still owed before go-live

Roughly in the order it has to happen.

1. **Verify the 40 unverified logical names.** 20 `reference`, 13 `projectData`, all 7
   `connected`. Each was derived by de-pluralising the entity set and never checked. A wrong
   logical name makes every privilege name wrong in both directions at once: `apply-roles.mjs`
   writes a privilege that does not exist, and `forTable` denies a table the user can in fact
   write. It fails loudly on both sides rather than quietly, which is the only good thing
   about it. `npm run gate:matrix -- --unverified` is the list; `pac code add-data-source` is
   the fix.
2. **Settle the seven double-plural spellings.** Only the metadata endpoint can say which of
   `vsb_projectdefaultchecklistses` and `vsb_projectdefaultchecklists` is real. Six are open;
   the seventh is already known and its alias exists only so a stale reference resolves. Each
   is modelled once with the other spelling as an `entitySetAlias`, so nothing is denied
   today — but two entity sets resolving to one table is a state to leave, not to keep.
3. **Assign the roles**, to teams by preference. Nothing in this repository does it and
   nothing in it should.
4. **Add the one flow principal** to `VSB - Approval State Writers`, and no other.
5. **Register the plugin assembly and bind each plugin type to its custom-API message**,
   synchronous on the main operation stage. `apply-customapis.mjs` leaves
   `customapi.plugintypeid` alone and reports `! no plugintypeid bound` rather than guessing,
   because the plugin-type id does not exist until the assembly is registered. Five messages
   are defined; `solution/plugins/README.md` has the sequence.
6. **Run G-SEC, as the unprivileged user**, and record the run.
7. **Fix the 16 owning-business-unit call sites.** Until then a BU-scoped role will
   intermittently not see rows another country's user created, with nothing logged. Where
   four call sites create the same table, fix all four together — half-fixed splits one
   project's rows across business units by which screen made each one, which is the hardest
   variant to diagnose from the UI.
8. **Fix `readPrivileges` in `src/features/shared/useProjectContext.ts`.** It builds its
   `RetrievePrincipalAccess` target as
   `` `Microsoft.Dynamics.CRM.${ES.projects}` `` — the entity **set**, `vsb_projects`, where
   the `@odata.type` needs the logical name, `vsb_project`. The call will fault against a
   real environment, and because the `catch` correctly returns `{create: false, edit: false}`
   the symptom is not an error but **every project silently read-only**. `privileges.forRecord`
   in `src/platform/privileges.ts` does the same thing correctly, from
   `TABLES[key].logicalName`; that is the implementation to converge on, which also closes
   the approximation where child-table record probes inherit the project's right.
9. **Decide what happens to a multi-write operation that half-applies.** `dataClient.batch`
   is a bounded fan-out, not an OData changeset. The checklist screen's two-write approval
   cancellation is the case that matters; the custom-API definitions exist for it.
10. **Nothing here has been penetration-tested, and nothing here has been reviewed by
    whoever owns the roles in the production tenant.** The matrix is this migration's
    *proposal* for what the privileges should be. It is derived from the canvas apps'
    behaviour and from the role names that already exist, not from a policy document, and
    the one place it visibly leans on an assumption is `VSB - Controller Own Data`: the role
    name says "Own Data" but all 13 master-data tables are `organization`-owned, so depth
    cannot narrow it and the grant is `organization`. If the intent was ever narrower than
    that, it needs a mechanism the matrix does not currently express.
