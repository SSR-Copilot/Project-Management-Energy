[
	{
		id: 1,
		value: 1,
		label: "1 month"
	},
	{
		id: 2,
		value: 2,
		label: "2 months"
	},
	{
		id: 3,
		value: 3,
		label: "3 months"
	},
	{
		id: 4,
		value: 6,
		label: "6 months"
	},
	{
		id: 5,
		value: 12,
		label: "12 months"
	}
].map((f) => f.value);
/**
* The payer the grid shows (`CostPaidBy` and the `[…]` sub-label): the contract's own Cost Type, blank when it is
* blank (D90, `Capex Costs Screen.pa.yaml:1220-1235`). A line with no `costTypePayer` (not read from Dataverse)
* shows its `payer`.
*/
function gridPayer(line) {
	return line.costTypePayer === void 0 ? line.payer : line.costTypePayer ?? "";
}
/** `YYYY-MM-DD` (what the panel's date inputs hold) -> `MM/YYYY` (what the column stores). */
function isoToMonthYear(iso) {
	const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
	return m ? `${m[2]}/${m[1]}` : "";
}
/**
* The grid contract row's second line — `SubLabel` (`Capex Costs Screen.pa.yaml:1222-1330`).
*
* The canvas builds it as three concatenated segments:
*
*     "[" & CostPaidBy & "]"
*   & If(Not(IsBlank('Linked Cluster')), " Link to Cluster " & 'Linked Cluster'.Order, "")
*   & <the distribution half>
*
* THE MIDDLE SEGMENT reads the contract's `Project States` lookup — `linkedClusterOrder` on
* `CostLine`, from `_vsb_linkedcluster_value` resolved through `loadProjectStates`. It is
* `" Link to Cluster " & Order` with a LEADING space and no trailing one, so an unlinked
* contract's label is byte-for-byte what it was before this segment existed.
*
* The distribution half is EQUAL-DISTRIBUTION ONLY — both branches of the canvas' `If` test
* `CPC.Distribution = 'Distribution Type'.'Equal Distribution'` first, so an individually
* distributed contract never gets one. Ticked clusters win over the date pair, and the cluster
* list is joined with `", "` when there are MORE THAN TWO and with `" & "` otherwise:
*
*     Concat(locSelectedClusters, label, If(CountRows(locSelectedClusters) > 2, ", ", " & "))
*
* THE SEPARATOR BEFORE THE DISTRIBUTION HALF IS CONDITIONAL — transcribed, not chosen. The canvas
* emits the `", "` from inside each distribution branch and guards it with
* `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "")` (`:1299-1302` and `:1313-1317`), so the
* comma exists only to separate the distribution text from a "Link to Cluster N" that precedes
* it. With no linked cluster the canvas really does render `[SPV]Distribution to Cluster 1 & 2`,
* with the bracket butted straight against the D. (The `" " & Text(CPC.Distribution)` that would
* have separated them is commented out in the source, `:1237-1241`.) Reproduced exactly: this
* string is also the PCF's fallback source for the payer tag and the distribution type
* (`DatasetParser.ts:243`/`:293`), so inventing a space here is a divergence, not a tidy-up.
*
* The separator is emitted per BRANCH, not once before the half — a linked contract with an
* equal distribution that has neither clusters nor dates falls out of both branches and gets no
* trailing comma, because the canvas' `If` returns blank rather than reaching either `", "`.
* Same for a linked contract distributed individually.
*
* The date branch fires when EITHER date is set — the canvas tests
* `Not(IsBlank(StartDate & EndDate))`, a concatenation, so one date alone still produces the
* segment with the other half empty.
*/
function contractSubLabel(contract) {
	const linked = contract.linkedClusterOrder;
	const base = `[${gridPayer(contract)}]` + (linked === void 0 ? "" : ` Link to Cluster ${linked}`);
	const lead = linked === void 0 ? "" : ", ";
	if (contract.distribution !== "equal") return base;
	const clusters = [...contract.clusters].sort((a, b) => a - b);
	if (clusters.length > 0) {
		const separator = clusters.length > 2 ? ", " : " & ";
		return `${base}${lead}Distribution to Cluster ${clusters.join(separator)}`;
	}
	const from = isoToMonthYear(contract.startDate);
	const to = isoToMonthYear(contract.endDate);
	if (!from && !to) return base;
	return `${base}${lead}Distribution from ${from} to ${to}`;
}
//#endregion
//#region src/features/cost/capex-costs/gridRows.ts
const emptyAggregate = () => ({
	total: 0,
	actual: 0,
	months: new Array(12).fill(0),
	paidMonths: new Array(12).fill(false)
});
/**
* One contract's money.
*
* `total` is **not** the sum of the monthly rows. The canvas is explicit
* (`Capex Costs Screen.pa.yaml:1536-1546`):
*
*     varTotalCost: Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C), Cost), 0)
*
* — the contract's STORED `vsb_totalcost` wins, and the sum of the cost rows is only the
* fallback for a contract that has none. The account/sub-account roll-ups at `:2250-2289` then
* sum that same figure, so the choice propagates all the way to the Grand Total. Both
* `ControlManifest.Input.xml:26-28` and `GridModels.ts:12-16` say the PCF must render these
* totals as given and never re-derive them.
*
* The two genuinely differ in live data — on Wirmighausen the contract "Desc" stores 52,000
* while its rows sum to 55,000, and `Gesamt (59013_0_47110102)` stores 3,162,000 against rows
* of 3,161,999.96 — so re-deriving showed the wrong number on the grid's most-read column.
*
* A stored ZERO still wins: `Coalesce` skips blanks, and 0 is not blank.
*
* Everything else here stays sourced from the cost rows — `actual` is the paid ones
* (`varPaidCost`), the twelve months are the selected year's, and `PlannedCost` is
* `varTotalCost - varPaidCost` (`:1563`), which is why fixing the total fixes Planned too.
*/
function aggregateLine(line, year) {
	const out = emptyAggregate();
	let rowSum = 0;
	for (const p of line.payments) {
		rowSum += p.amount;
		if (p.paid) out.actual += p.amount;
		if (p.year === year) {
			const i = p.month - 1;
			if (i >= 0 && i < 12) {
				out.months[i] = out.months[i] + p.amount;
				if (p.paid) out.paidMonths[i] = true;
			}
		}
	}
	out.total = line.totalCost ?? rowSum;
	return out;
}
function addInto(target, source) {
	target.total += source.total;
	target.actual += source.actual;
	for (let i = 0; i < 12; i += 1) target.months[i] = target.months[i] + source.months[i];
}
/**
* Contracts, by description ascending — the canvas' merge step
* (`Capex Costs Screen.pa.yaml:1404-1414`):
*
*     SortByColumns(Filter(colCapexContractCostGrouped_V1, vsb_parentaccountid = Item.…),
*                   "vsb_costdescription", SortOrder.Ascending)
*
* `vsb_costdescription` in that collection is the contract's `Coalesce(Description, Name)`,
* which is exactly `CostLine.description`. We rendered in fetch order, which is Dataverse's
* (effectively arbitrary) order, so the same sub-account listed its contracts differently from
* the canvas app. The sort is stable, so two contracts sharing a description keep fetch order.
*/
function sortedByDescription(lines) {
	return [...lines].sort((a, b) => a.description.localeCompare(b.description));
}
/** The `TotalCost` / `PlannedCost` / `ActualCost` / `M1..M12` fields the PCF reads. */
function money(a) {
	const row = {
		TotalCost: a.total,
		ActualCost: a.actual,
		PlannedCost: a.total - a.actual
	};
	for (let i = 0; i < 12; i += 1) row[`M${i + 1}`] = a.months[i];
	return row;
}
function gridRows(accounts, lines, year, commentFlags = /* @__PURE__ */ new Map()) {
	const linesByAccount = /* @__PURE__ */ new Map();
	for (const line of lines) {
		const bucket = linesByAccount.get(line.accountId);
		if (bucket) bucket.push(line);
		else linesByAccount.set(line.accountId, [line]);
	}
	const childrenByParent = /* @__PURE__ */ new Map();
	for (const account of accounts) {
		if (!account.parentId) continue;
		const bucket = childrenByParent.get(account.parentId);
		if (bucket) bucket.push(account);
		else childrenByParent.set(account.parentId, [account]);
	}
	const lineAggregates = /* @__PURE__ */ new Map();
	for (const line of lines) lineAggregates.set(line.id, aggregateLine(line, year));
	const ownAggregate = (accountId) => {
		const out = emptyAggregate();
		for (const line of linesByAccount.get(accountId) ?? []) addInto(out, lineAggregates.get(line.id));
		return out;
	};
	const rows = [];
	for (const account of accounts) {
		const isSubaccount = Boolean(account.parentId);
		const own = ownAggregate(account.id);
		if (!isSubaccount) for (const child of childrenByParent.get(account.id) ?? []) addInto(own, ownAggregate(child.id));
		rows.push({
			RowId: account.id,
			ParentId: account.parentId ?? "",
			Type: isSubaccount ? "subaccount" : "account",
			Number: account.number,
			Name: account.name,
			...money(own)
		});
		if (!isSubaccount) continue;
		for (const line of sortedByDescription(linesByAccount.get(account.id) ?? [])) {
			const a = lineAggregates.get(line.id);
			const flags = commentFlags.get(line.id);
			const row = {
				RowId: line.id,
				ParentId: account.id,
				Type: "contract",
				Number: "",
				Name: line.description,
				SubLabel: contractSubLabel(line),
				CostPaidBy: gridPayer(line),
				IsStandardContract: line.standard,
				DistributionType: line.distribution === "individual" ? "Individual Distribution" : "Equal Distribution",
				HasComments: flags?.general ?? false,
				CommentTooltip: flags?.generalTooltip ?? "",
				...money(a)
			};
			for (let i = 0; i < 12; i += 1) {
				row[`M${i + 1}Paid`] = a.paidMonths[i];
				row[`M${i + 1}HasComments`] = flags?.months[i] ?? false;
				row[`M${i + 1}CommentTooltip`] = flags?.monthTooltips?.[i] ?? "";
			}
			rows.push(row);
		}
	}
	return rows;
}
//#endregion
export { gridRows };
