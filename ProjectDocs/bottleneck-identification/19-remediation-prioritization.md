# 19 — Remediation prioritisation

> Stage 2, 26 Nov 2026. Every finding was scored 1-5 by its owning agent on eight criteria with a one-line basis (in `_stage2/*-scores.md`); the orchestrator applied the fixed formula below. The scores are judgement inputs, the arithmetic is reproducible. **Treat the ranking as a ordering aid, not a measurement.**

## 1. Formula

- **Value** = 0.30 Impact + 0.15 Frequency + 0.10 Screens affected + 0.15 Journey criticality + 0.20 Root-cause confidence + 0.10 Dependency impact (range 1-5).
- **Burden** = 0.5 Implementation effort + 0.5 Regression risk (range 1-5).
- **Index** = Value / Burden. Classes: *High-impact, low-effort* = Value ≥ 3.5 and Burden ≤ 2.5; *High-impact, high-effort (architectural)* = Value ≥ 3.5, Burden > 2.5; *Moderate, low-effort* = Value 2.5-3.5, Burden ≤ 2.5; *Moderate, higher-effort*; *Low-value / cosmetic* = Value < 2.5 or action ACCEPT. *Systemic* = Screens score ≥ 4, else *screen-specific*.

## 2. Distribution (canonical findings)

| Class | Findings |
|---|---|
| Moderate, higher-effort | 14 |
| High-impact, low-effort | 3 |
| High-impact, high-effort (architectural) | 2 |
| Moderate, low-effort | 30 |
| Low-value / cosmetic | 64 |

**Reading it honestly:** the audit found few high-value fixes. Value reaches 3.5 or more for only 5 findings (SCC-01, SPA-01, BND-01, SPA-13, BND-06). Most of the rest are moderate, and many are unmeasured. That fits a code base that has been through two optimisation programmes.

## 3. Ranked: findings with an approved-able action

### 3.1 FIX (no decision, probe or measurement needed first)

20 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| BND-09 | P3 | 3.3 | 1 | 3.3 | FIX | T-C08 | Systemic |
| BND-03 | P2 | 3 | 1 | 3 | FIX | T-E01 | Screen-specific |
| BND-06 | P3 | 3.9 | 1.5 | 2.6 | FIX | T-E01 | Systemic |
| SAD-02 | P3 | 2.55 | 1 | 2.55 | FIX | T-E05 | Screen-specific |
| NET-08 | P3 | 2.5 | 1 | 2.5 | FIX | T-C04 | Systemic |
| BND-07 | P3 | 2.45 | 1 | 2.45 | FIX | T-E01 | Screen-specific |
| SPA-09 | P2 | 3.35 | 1.5 | 2.23 | FIX | T-A04 | Systemic |
| BND-18 | P3 | 3.35 | 1.5 | 2.23 | FIX | T-E03 | Systemic |
| BND-17 | P3 | 2.1 | 1 | 2.1 | FIX | T-C03 | Screen-specific |
| SCC-09 | P2 | 2.75 | 1.5 | 1.83 | FIX | T-B05 | Screen-specific |
| SAD-05 | P2 | 1.8 | 1 | 1.8 | FIX | T-B07 | Screen-specific |
| RND-09 | P3 | 1.8 | 1 | 1.8 | FIX | T-D04 | Screen-specific |
| SPA-01 | P1 | 3.55 | 2 | 1.77 | FIX | T-A01 | Screen-specific |
| SCC-06 | P2 | 2.65 | 1.5 | 1.77 | FIX | T-B05 | Screen-specific |
| SCC-16 | P3 | 2.55 | 1.5 | 1.7 | FIX | T-E06 | Screen-specific |
| SCC-01 | P1 | 4.15 | 2.5 | 1.66 | FIX | T-C01 | Systemic |
| BND-04 | P2 | 3.3 | 2 | 1.65 | FIX | T-E02 | Screen-specific |
| SPB-02 | P2 | 3.25 | 2 | 1.63 | FIX | T-C02 | Screen-specific |
| NET-04 | P3 | 2.7 | 2 | 1.35 | FIX | T-C05 | Systemic |
| SPA-14 | P2 | 2.35 | 2.5 | 0.94 | FIX | T-A05 | Screen-specific |

### 3.2 FIX-AFTER-DECISION

13 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| BND-13 | P3 | 3.3 | 1.5 | 2.2 | FIX-AFTER-DECISION | T-A04 | Systemic |
| SCC-14 | P3 | 2.85 | 1.5 | 1.9 | FIX-AFTER-DECISION | T-C04 | Screen-specific |
| BND-05 | P2 | 2.65 | 1.5 | 1.77 | FIX-AFTER-DECISION | T-E07 | Screen-specific |
| SAD-07 | P2 | 3.45 | 2.5 | 1.38 | FIX-AFTER-DECISION | T-B06 | Systemic |
| SPB-08 | P2 | 2.55 | 2 | 1.27 | FIX-AFTER-DECISION | T-B11 | Screen-specific |
| RND-02 | P2 | 2.85 | 2.5 | 1.14 | FIX-AFTER-DECISION | T-D01 | Screen-specific |
| SPB-09 | P2 | 2.85 | 2.5 | 1.14 | FIX-AFTER-DECISION | T-B08 | Screen-specific |
| SPA-02 | P2 | 2.7 | 2.5 | 1.08 | FIX-AFTER-DECISION | T-A02 | Screen-specific |
| SAD-06 | P3 | 2.1 | 2 | 1.05 | FIX-AFTER-DECISION | T-C04 | Screen-specific |
| SAD-08 | P2 | 2.05 | 2 | 1.02 | FIX-AFTER-DECISION | T-B06 | Screen-specific |
| SCC-07 | P2 | 2.95 | 3 | 0.98 | FIX-AFTER-DECISION | T-B09 | Screen-specific |
| NET-17 | P1 | 2.85 | 3.5 | 0.81 | FIX-AFTER-DECISION | T-A09 | Screen-specific |
| SPB-07 | P2 | 2.5 | 3.5 | 0.71 | FIX-AFTER-DECISION | T-B10 | Screen-specific |

### 3.3 FIX-AFTER-PROBE

8 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| SPB-05 | P2 | 2.55 | 2 | 1.27 | FIX-AFTER-PROBE | - | Screen-specific |
| SCC-02 | P2 | 2.5 | 2 | 1.25 | FIX-AFTER-PROBE | T-B04 | Screen-specific |
| SPB-14 | P3 | 2.35 | 2 | 1.18 | FIX-AFTER-PROBE | T-E08 | Screen-specific |
| SPB-01 | P1 | 3.2 | 3 | 1.07 | FIX-AFTER-PROBE | T-B01,T-B02 | Screen-specific |
| SPA-05 | P2 | 2.95 | 3 | 0.98 | FIX-AFTER-PROBE | T-A07 | Screen-specific |
| NET-16 | P2 | 2.95 | 3.5 | 0.84 | FIX-AFTER-PROBE | T-C06 | Systemic |
| NET-02 | P3 | 2.4 | 3 | 0.8 | FIX-AFTER-PROBE | T-C06 | Systemic |
| NET-13 | P2 | 2.75 | 3.5 | 0.79 | FIX-AFTER-PROBE | T-B03 | Screen-specific |


## 4. Measure first (a fix would be speculative)

### 4.1 MEASURE-FIRST

28 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| SPA-16 | P3 | 2.25 | 1 | 2.25 | MEASURE-FIRST | - | Screen-specific |
| NET-07 | P3 | 1.9 | 1 | 1.9 | MEASURE-FIRST | - | Screen-specific |
| SPA-11 | P2 | 3.4 | 2 | 1.7 | MEASURE-FIRST | - | Screen-specific |
| RND-07 | P3 | 2.35 | 1.5 | 1.57 | MEASURE-FIRST | T-D06 | Systemic |
| CMP-01 | P2 | 2.75 | 2 | 1.38 | MEASURE-FIRST | T-D02 | Screen-specific |
| RND-01 | P3 | 2.7 | 2 | 1.35 | MEASURE-FIRST | T-D00 | Screen-specific |
| CMP-06 | P3 | 2.5 | 2 | 1.25 | MEASURE-FIRST | T-D03 | Screen-specific |
| SPB-06 | P3 | 2.25 | 2 | 1.13 | MEASURE-FIRST | T-E08 | Screen-specific |
| BND-02 | P3 | 3 | 3 | 1 | MEASURE-FIRST | T-C04 | Systemic |
| SPA-06 | P2 | 2.45 | 2.5 | 0.98 | MEASURE-FIRST | - | Screen-specific |
| MEM-03 | P2 | 2.3 | 2.5 | 0.92 | MEASURE-FIRST | T-D00 | Screen-specific |
| SCC-20 | P3 | 2.25 | 2.5 | 0.9 | MEASURE-FIRST | T-D00 | Screen-specific |
| BND-01 | P2 | 3.5 | 4 | 0.88 | MEASURE-FIRST | - | Systemic |
| SPB-17 | P3 | 2.2 | 2.5 | 0.88 | MEASURE-FIRST | T-D00 | Screen-specific |
| SPA-03 | P1 | 3.05 | 3.5 | 0.87 | MEASURE-FIRST | T-A03 | Screen-specific |
| SPB-12 | P3 | 2.45 | 3 | 0.82 | MEASURE-FIRST | T-E08 | Screen-specific |
| BND-11 | P3 | 2.7 | 3.5 | 0.77 | MEASURE-FIRST | T-E08 | Systemic |
| CMP-02 | P3 | 2.25 | 3 | 0.75 | MEASURE-FIRST | T-D02 | Screen-specific |
| SAD-01 | P2 | 2.2 | 3 | 0.73 | MEASURE-FIRST | T-E08 | Screen-specific |
| SCC-11 | P2 | 3.3 | 4.5 | 0.73 | MEASURE-FIRST | - | Screen-specific |
| RND-04 | P3 | 2.2 | 3 | 0.73 | MEASURE-FIRST | T-D05 | Screen-specific |
| BND-08 | P3 | 2.9 | 4 | 0.72 | MEASURE-FIRST | T-E04 | Screen-specific |
| SAD-17 | P3 | 1.35 | 2 | 0.68 | MEASURE-FIRST | T-D00 | Screen-specific |
| SPB-04 | P3 | 1.9 | 3 | 0.63 | MEASURE-FIRST | - | Screen-specific |
| NET-14 | P3 | 1.7 | 3 | 0.57 | MEASURE-FIRST | T-B06 | Screen-specific |
| SCC-19 | P3 | 2.3 | 4 | 0.57 | MEASURE-FIRST | T-E04 | Screen-specific |
| RND-14 | P2 | 2.25 | 4 | 0.56 | MEASURE-FIRST | T-D01 | Screen-specific |
| SCC-13 | P2 | 1.65 | 3.5 | 0.47 | MEASURE-FIRST | - | Screen-specific |

## 5. Deferred or accepted

### 5.1 DEFER

26 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| CMP-05 | P3 | 2.25 | 1 | 2.25 | DEFER | - | Screen-specific |
| SPA-08 | P3 | 1.9 | 1 | 1.9 | DEFER | T-A07 | Screen-specific |
| BND-14 | P3 | 2.35 | 1.5 | 1.57 | DEFER | - | Systemic |
| SPA-04 | P3 | 2.35 | 1.5 | 1.57 | DEFER | T-A09 | Screen-specific |
| BND-10 | P3 | 3.1 | 2 | 1.55 | DEFER | - | Systemic |
| CMP-04 | Closed | 2.3 | 1.5 | 1.53 | DEFER | T-C07 | Systemic |
| RND-08 | P3 | 2.65 | 2 | 1.32 | DEFER | - | Systemic |
| SAD-03 | P3 | 1.9 | 1.5 | 1.27 | DEFER | - | Screen-specific |
| SCC-15 | P3 | 2.5 | 2 | 1.25 | DEFER | - | Screen-specific |
| SPB-15 | P3 | 3 | 2.5 | 1.2 | DEFER | - | Screen-specific |
| SPA-13 | P2 | 4.05 | 3.5 | 1.16 | DEFER | - | Systemic |
| SPB-13 | P3 | 1.7 | 1.5 | 1.13 | DEFER | - | Screen-specific |
| NET-05 | P2 | 2.35 | 2.5 | 0.94 | DEFER | - | Systemic |
| SCC-04 | P3 | 2.35 | 2.5 | 0.94 | DEFER | - | Screen-specific |
| SPA-07 | Closed | 1.85 | 2 | 0.93 | DEFER | - | Screen-specific |
| SAD-09 | P3 | 1.75 | 2 | 0.88 | DEFER | - | Screen-specific |
| SCC-12 | P3 | 2.1 | 2.5 | 0.84 | DEFER | - | Screen-specific |
| NET-10 | P3 | 2.5 | 3 | 0.83 | DEFER | - | Systemic |
| SCC-18 | P3 | 2.05 | 2.5 | 0.82 | DEFER | - | Screen-specific |
| RND-10 | P3 | 1.55 | 2 | 0.78 | DEFER | - | Screen-specific |
| NET-06 | P2 | 2.2 | 3 | 0.73 | DEFER | - | Screen-specific |
| SAD-11 | P3 | 1.75 | 2.5 | 0.7 | DEFER | - | Screen-specific |
| SCC-08 | P3 | 1.7 | 2.5 | 0.68 | DEFER | - | Screen-specific |
| SAD-13 | P3 | 2 | 3 | 0.67 | DEFER | - | Screen-specific |
| RND-05 | P3 | 2.55 | 4 | 0.64 | DEFER | - | Screen-specific |
| RND-13 | P3 | 1.85 | 3.5 | 0.53 | DEFER | - | Screen-specific |

### 5.2 ACCEPT (no action)

18 findings.

| ID | Validated P | Value | Burden | Index | Action | Task | Scope |
|---|---|---|---|---|---|---|---|
| CMP-09 | Closed | 2.95 | 1 | 2.95 | ACCEPT | - | Systemic |
| NET-03 | Closed | 2.4 | 1 | 2.4 | ACCEPT | - | Systemic |
| RND-11 | P3 | 2.05 | 1 | 2.05 | ACCEPT | - | Screen-specific |
| BND-12 | P3 | 2.9 | 1.5 | 1.93 | ACCEPT | - | Systemic |
| SAD-14 | Closed | 1.9 | 1 | 1.9 | ACCEPT | - | Screen-specific |
| MEM-04 | Closed | 1.9 | 1.5 | 1.27 | ACCEPT | - | Screen-specific |
| SAD-10 | Closed | 1.75 | 1.5 | 1.17 | ACCEPT | - | Screen-specific |
| RND-06 | P3 | 2.3 | 2 | 1.15 | ACCEPT | - | Systemic |
| RND-12 | Closed | 2.15 | 2 | 1.07 | ACCEPT | - | Systemic |
| BND-16 | Closed | 2.55 | 2.5 | 1.02 | ACCEPT | - | Systemic |
| CMP-03 | Closed | 2.55 | 2.5 | 1.02 | ACCEPT | - | Systemic |
| NET-21 | Closed | 2.9 | 3 | 0.97 | ACCEPT | - | Systemic |
| SAD-15 | Closed | 1.9 | 2.5 | 0.76 | ACCEPT | - | Screen-specific |
| SPB-10 | Closed | 2.35 | 3.5 | 0.67 | ACCEPT | - | Screen-specific |
| CMP-07 | Closed | 2.4 | 4 | 0.6 | ACCEPT | - | Screen-specific |
| MEM-02 | P3 | 2.05 | 3.5 | 0.59 | ACCEPT | - | Screen-specific |
| SCC-21 | P3 | 1.85 | 3.5 | 0.53 | ACCEPT | - | Screen-specific |
| SPA-17 | Closed | 1.5 | 3 | 0.5 | ACCEPT | - | Screen-specific |


## 6. By category requested in the brief

| Category | Findings |
|---|---|
| High-impact, low-effort | SCC-01, SPA-01, BND-06 |
| High-impact, high-effort (architectural) | BND-01, SPA-13 |
| Systemic optimisations (Screens ≥ 4, actionable) | SCC-01, NET-16, SAD-07, SPA-09, BND-06, BND-09, BND-13, BND-18, NET-02, NET-04, NET-08 |
| Screen-specific optimisations (actionable) | NET-17, SPA-01, SPB-01, BND-03, BND-04, BND-05, NET-13, RND-02, SAD-05, SAD-08, SCC-02, SCC-06, SCC-07, SCC-09, SPA-02, SPA-05, SPA-14, SPB-02, SPB-05, SPB-07, SPB-08, SPB-09, BND-07, BND-17, RND-09, SAD-02, SAD-06, SCC-14, SCC-16, SPB-14 |
| Low-value / cosmetic | 64 findings (listed in 5.1-5.2 and 4.1 with Value < 2.5) |

Note: 6 extra score rows exist for merged duplicates scored separately by a second agent; they are ignored here in favour of the canonical row. RND-10 was scored by agents C and D; C's row is used because D yielded.
