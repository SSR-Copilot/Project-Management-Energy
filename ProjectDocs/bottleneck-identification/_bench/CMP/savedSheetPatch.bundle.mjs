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
* The inverse of `byClusterJson` — `Boolean(locClusters.ClusterN)` for each of the five.
*
* Accepts the canvas' array wrapper and a bare object alike, so a row written by an earlier
* build still reads. Only a literal `true` counts: the column always lists all five keys, so
* "the key is present" says nothing at all about whether the cluster was ticked.
*
* A malformed value yields no clusters rather than throwing — a contract whose JSON cannot be
* parsed must still render with its money intact.
*/
function parseByClusterJson(json) {
	if (!json) return [];
	try {
		const parsed = JSON.parse(json);
		const record = Array.isArray(parsed) ? parsed[0] : parsed;
		if (!record || typeof record !== "object") return [];
		return Object.entries(record).filter(([k, v]) => /^Cluster\d+$/.test(k) && v === true).map(([k]) => Number(k.replace("Cluster", ""))).sort((a, b) => a - b);
	} catch {
		return [];
	}
}
/**
* The inverse of `startEndJson`, as the `YYYY-MM-01` the panel's date inputs want.
*
* Reads the canvas' `MM/YYYY` first and falls back to a full ISO date, so a row written by an
* earlier build (which stored ISO) still opens. The day is always the 1st: the column carries
* no day, and every consumer — `distributionSchedule`, the grid — works in whole months.
*/
function parseStartEndJson(json) {
	const empty = {
		startDate: "",
		endDate: ""
	};
	if (!json) return empty;
	let record;
	try {
		const parsed = JSON.parse(json);
		record = Array.isArray(parsed) ? parsed[0] : parsed;
		if (!record || typeof record !== "object") return empty;
	} catch {
		return empty;
	}
	const toIso = (value) => {
		if (typeof value !== "string") return "";
		const mmYyyy = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(value.trim());
		if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1]}-01`;
		return /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) ? value.trim() : "";
	};
	return {
		startDate: toIso(record.StartDate),
		endDate: toIso(record.EndDate)
	};
}
/**
* Which of the two equal-distribution modes a stored contract opens in.
*
* `rad_AddContract_RightPanel_DistributionBy_1.DefaultSelectedItems`
* (`Capex Costs Screen.pa.yaml:10860`): any cluster ticked -> By Cluster; otherwise a non-blank
* `StartDate & EndDate` (EITHER date: the canvas concatenates them, D90, CAPEX-067) -> By Start and
* End Date; otherwise **By Cluster**. That last fallback is the one worth stating — a contract
* with neither stored opens on By Cluster, not on dates.
*/
function resolveEqualMode(clusters, startDate, endDate) {
	if (clusters.length > 0) return "cluster";
	return startDate || endDate ? "dates" : "cluster";
}
//#endregion
//#region src/features/cost/costing/savedSheetPatch.ts
/** `loadPayments`' order. */
const byYearMonth = (a, b) => a.year - b.year || a.month - b.month;
/** The payments of one line with this save's cells applied (`null` = unchanged). */
function patchPayments(payments, costs, deleted) {
	let changed = false;
	const next = payments.filter((p) => {
		const gone = p.id !== void 0 && deleted.has(p.id.toLowerCase());
		if (gone) changed = true;
		return !gone;
	});
	const at = /* @__PURE__ */ new Map();
	next.forEach((p, i) => {
		if (p.id !== void 0) at.set(p.id.toLowerCase(), i);
	});
	const created = [];
	const createdCells = /* @__PURE__ */ new Set();
	for (const cost of costs) {
		const i = at.get(cost.id.toLowerCase());
		if (i !== void 0) {
			const p = next[i];
			if (p.amount !== cost.amount || p.year !== cost.year || p.month !== cost.month) {
				next[i] = {
					...p,
					year: cost.year,
					month: cost.month,
					amount: cost.amount
				};
				changed = true;
			}
			continue;
		}
		if (!cost.isNew) continue;
		created.push({
			id: cost.id,
			year: cost.year,
			month: cost.month,
			amount: cost.amount,
			paid: false
		});
		createdCells.add(`${cost.year}|${cost.month}`);
	}
	if (created.length === 0) return changed ? next.sort(byYearMonth) : null;
	return [...next.filter((p) => !createdCells.has(`${p.year}|${p.month}`)), ...created].sort(byYearMonth);
}
/** A contract this Save created, mapped as `loadCostLines` maps the stored row. */
function newLine(contract, costs) {
	const c = contract.columns;
	if (!c || c.subaccountId === null) return null;
	const clusters = parseByClusterJson(null);
	const { startDate, endDate } = parseStartEndJson(null);
	return {
		id: contract.id,
		accountId: c.subaccountId,
		description: c.name.trim(),
		payer: c.payer,
		depreciation: c.depreciation,
		vat: c.vat,
		standard: false,
		distribution: c.distribution,
		distributionScheme: c.distributionScheme,
		equalMode: resolveEqualMode(clusters, startDate, endDate),
		startDate,
		endDate,
		frequency: 1,
		clusters,
		payments: costs.filter((k) => k.isNew).map((k) => ({
			id: k.id,
			year: k.year,
			month: k.month,
			amount: k.amount,
			paid: false
		})).sort(byYearMonth),
		comments: [],
		totalCost: contract.totalCost
	};
}
/**
* `book` with `changes` applied: deleted contracts and cost rows removed, written cells updated
* or added, contract totals and written columns updated, created contracts added. Returns `book`
* itself when nothing in it changes. See the module note for what is left to the refetch.
*
* `category` is the DEVEX/CAPEX tab the book was loaded for (its query key's last part): a
* created contract is added only under a sub-account of that category.
*/
function applySavedSheetToBook(book, changes, category) {
	const deletedContracts = new Set(changes.deletedContractIds.map((id) => id.toLowerCase()));
	const deletedCosts = new Set(changes.deletedCostIds.map((id) => id.toLowerCase()));
	const contractById = new Map(changes.contracts.map((c) => [c.id.toLowerCase(), c]));
	const costsByContract = /* @__PURE__ */ new Map();
	for (const cost of changes.costs) {
		const key = cost.contractId.toLowerCase();
		const bucket = costsByContract.get(key);
		if (bucket) bucket.push(cost);
		else costsByContract.set(key, [cost]);
	}
	let changed = false;
	const seen = /* @__PURE__ */ new Set();
	const lines = [];
	for (const line of book.lines) {
		const key = line.id.toLowerCase();
		seen.add(key);
		if (deletedContracts.has(key)) {
			changed = true;
			continue;
		}
		const contract = contractById.get(key);
		const payments = patchPayments(line.payments, costsByContract.get(key) ?? [], deletedCosts);
		let next = line;
		if (payments) next = {
			...next,
			payments
		};
		if (contract && next.totalCost !== contract.totalCost) next = {
			...next,
			totalCost: contract.totalCost
		};
		const c = contract?.columns;
		if (c && (next.payer !== c.payer || next.depreciation !== c.depreciation || next.vat !== c.vat || next.distribution !== c.distribution || next.distributionScheme !== c.distributionScheme)) next = {
			...next,
			payer: c.payer,
			depreciation: c.depreciation,
			vat: c.vat,
			distribution: c.distribution,
			distributionScheme: c.distributionScheme
		};
		if (next !== line) changed = true;
		lines.push(next);
	}
	const inBook = new Set(book.accounts.filter((a) => a.category === category).map((a) => a.id.toLowerCase()));
	for (const contract of changes.contracts) {
		const key = contract.id.toLowerCase();
		if (!contract.isNew || seen.has(key) || deletedContracts.has(key)) continue;
		const subaccount = contract.columns?.subaccountId;
		if (!subaccount || !inBook.has(subaccount.toLowerCase())) continue;
		const line = newLine(contract, costsByContract.get(key) ?? []);
		if (line) {
			lines.push(line);
			changed = true;
		}
	}
	return changed ? {
		...book,
		lines
	} : book;
}
//#endregion
export { applySavedSheetToBook };
