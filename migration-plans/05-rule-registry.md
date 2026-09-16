# Rule registry

Inventory date: 2026-09-16. This registry is the cross-screen index for the stable rule IDs used by the 23 screen migration plans. It is intentionally planning-only: rule IDs are implementation contracts, not generated code.

## Coverage model

The Canvas corpus was measured at 4,787 controls, 65,839 formula properties, 2,972 formulas with at least three nonblank lines, and 1,583 substantive logic blocks of at least ten lines across the 23 production screens. Static layout, color, sizing, and style formulas are covered by UI parity sections in the screen plans. Formula blocks that affect data, validation, mutation, security, navigation, PCF events, flow calls, calculations, collection lifecycle, or visibility/enablement are represented by stable rule IDs.

## Status summary

| Status | Count | Screens |
|---|---:|---|
| Complete planning coverage | 19 | All production screens except the four listed below |
| Incomplete pending missing flow resolution | 4 | Admin Milestones, Admin Contract, Admin Cost, Project General Milestones |

## Rule ID pattern

Rule IDs use `<SCREEN_PREFIX>-FX-###`. Each screen plan defines 12 top-level behavior clusters. Implementations may add subordinate ids such as `CAPEX-FX-005A` inside tests, but must not rename the stable parent IDs without updating this registry and the owning screen plan.

## Cross-screen registry
### ADCHK - Admin Project Default Checklists Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADCHK-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |
| `ADCHK-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml. |

### ADCAPEX - Admin CAPEX Accounts

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADCAPEX-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |
| `ADCAPEX-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml. |

### ADMILE - Admin Milestones Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADMILE-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |
| `ADMILE-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml. |

### ADGATE - Admin Project Gates Approvals Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADGATE-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |
| `ADGATE-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml. |

### ADCONTR - Admin Contract Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADCONTR-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |
| `ADCONTR-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml. |

### ADCOST - Admin Cost Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADCOST-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |
| `ADCOST-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml. |

### LOAD - App Loading Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `LOAD-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |
| `LOAD-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml. |

### MAIN - Project Main Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `MAIN-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |
| `MAIN-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. |

### GDATA - Project General Data Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `GDATA-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |
| `GDATA-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Data Screen.pa.yaml. |

### MSTONE - Project General Milestones Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `MSTONE-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |
| `MSTONE-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml. |

### GEN - Project Generators Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `GEN-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |
| `GEN-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml. |

### PROD - Project Production Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `PROD-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |
| `PROD-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml. |

### CHKLST - Project General CheckList Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `CHKLST-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |
| `CHKLST-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General CheckList Screen.pa.yaml. |

### TEAM - Project General Team Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `TEAM-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |
| `TEAM-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml. |

### PLAN - Project Planning Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `PLAN-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |
| `PLAN-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml. |

### GRIDOP - Grid Operator Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `GRIDOP-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |
| `GRIDOP-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml. |

### REV - Project Revenues Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `REV-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |
| `REV-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml. |

### FIN - Project Finance Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `FIN-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |
| `FIN-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml. |

### CAPEX - Capex Costs Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `CAPEX-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |
| `CAPEX-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml. |

### CONTR - Contracts Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `CONTR-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |
| `CONTR-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Contracts Screen.pa.yaml. |

### OPEX - Opex Costs Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `OPEX-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |
| `OPEX-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml. |

### LEASE - Land Lease Costs Screen

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `LEASE-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |
| `LEASE-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml. |

### ADDCOST - Add Costs from Table

| Rule ID | Behavior cluster | Required proof |
|---|---|---|
| `ADDCOST-FX-001` | Screen bootstrap and loading gates | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-002` | Project/context filtering | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-003` | Command enablement | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-004` | Validation and required-field rules | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-005` | Patch/remove mutation behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-006` | Derived numeric/date values | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-007` | Local collection lifecycle | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-008` | Error/info/confirmation panels | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-009` | Security and role visibility | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-010` | Navigation and return behavior | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-011` | PCF/control event mapping | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |
| `ADDCOST-FX-012` | Flow/recalculation side effects | Rule/unit/component test plus source locator in ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Add Costs from Table.pa.yaml. |

## Implementation rule

A screen implementation is not complete until every rule ID for that screen is either implemented and tested, or explicitly marked as an approved divergence with product-owner rationale. Missing flow references cannot be converted into approved divergences by the implementer alone.

