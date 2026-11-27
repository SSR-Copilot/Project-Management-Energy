//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/data/dataverseNames.ts
/**
* Entity sets whose real names differ from, or are missing from, `ES` above.
*
* The three `…es`-suffixed sets are the ones the canvas data sources hide behind their
* display names: Dataverse pluralised entities that already end in `s` a second time.
* `ES.projectDefaultChecklists` / `.projectDefaultApprovals` / `.checkListDefaultApprovals`
* above are missing that suffix and would 404; use these instead.
*/
const ES_PROCESS = {
	/** `Project Default Checklists` — entity `vsb_ProjectDefaultChecklists`. */
	projectDefaultChecklists: "vsb_projectdefaultchecklistses",
	/** `Project Default Approvals` — entity `vsb_ProjectDefaultApprovals` (the gate rows). */
	projectDefaultApprovals: "vsb_projectdefaultapprovalses",
	/** `Check List Default Approvals` — entity `vsb_CheckListDefaultApprovals`. */
	checkListDefaultApprovals: "vsb_checklistdefaultapprovalses",
	/** `Project Checklist Tracking Note` — the per-checklist audit note. */
	projectChecklistTrackingNotes: "vsb_projectchecklisttrackingnotes"
};
const CHOICE_PROCESS = {
	/** `Approval Cluster States` (`vsb_approvalclusterstates`) — all eight values. */
	approvalClusterState: {
		notStarted: 95285e4,
		inProgress: 952850001,
		completed: 952850002,
		rejected: 952850003,
		requestCanceled: 952850004,
		abandoned: 952850005,
		/** Label is `Inactive/ On-hold`. */
		inactive: 952850006,
		canceling: 952850007
	},
	/**
	* `Task State` (`vsb_taskstate`). NOTE the gap: In Progress is 952850002, not
	* 952850001 — the option set has no 952850001 at all.
	*/
	taskState: {
		none: 95285e4,
		inProgress: 952850002,
		completed: 952850003
	},
	/** `Approval Cluster Step State` (`vsb_approvalclusterstepstate`). */
	clusterStepState: {
		portfolioManager: 95285e4,
		controllingManager: 952850001,
		approvals: 952850002,
		none: 952850003
	},
	/** `Approval Mode` (`vsb_approvalmode`) — drives the row icon and the panel shape. */
	approvalMode: {
		formalApproval: 95285e4,
		localApproval: 952850001,
		onlyNotifications: 952850002
	},
	/** `Note Type` (`vsb_notetype`) on both tracking-note tables. */
	noteType: {
		none: 95285e4,
		checklistItem: 952850001,
		shortTable: 952850002
	},
	/**
	* The Yes/No/Unknown shape shared verbatim by `Cooperation`, `Repowering`,
	* `Grid Expansion Required` and `Substation construction required`.
	*/
	yesNoUnknown: {
		yes: 95285e4,
		no: 952850001,
		unknown: 952850002
	},
	/** `Aquisition Status Types` (`vsb_aquisitionstatustypes`). */
	aquisitionType: {
		/** `LLAs in personam` — `gblAppConstants.AquisitionStatus.UnderLawOfObligationId`. */
		inPersonam: 95285e4,
		/** `LLAs in rem` — `gblAppConstants.AquisitionStatus.InRemId`. */
		inRem: 952850001
	},
	/** `Permit Date Type` (`vsb_permitdatetype`). */
	permitDateType: {
		plan: 95285e4,
		actual: 952850001
	},
	/** `Planning Basis Category` (`vsb_planningbasiscategory`). */
	planningBasisCategory: {
		exists: 95285e4,
		partial: 952850001,
		none: 952850002
	},
	/** `Technology` (`vsb_technology`) — the checklist template filter. */
	technology: {
		wind: 95285e4,
		pv: 952850001,
		hybrid: 952850002,
		bess: 952850003,
		hydrogen: 952850004,
		hydro: 952850005,
		substation: 952850006
	}
};
const ES_ADMIN = {
	/** `Devex/Capex Standard Assumptions` — Admin Cost Screen, DEVEX/CAPEX family. */
	devexCapexStandardAssumptions: "vsb_devexcapexstandardassumptionses",
	/** `OPEX & Land Lease Standard Assumptions` — the three OPEX families. */
	opexLandLeaseStandardAssumptions: "vsb_opexlandleasestandardassumptionses",
	/** `BoP Contracts Standard Assumptions` — Admin Contract Screen parent rows. */
	bopContractsStandardAssumptions: "vsb_bopcontractsstandardassumptionses",
	/** `BoP Contracts Standard Assumption DevCo Costs` — the owned CAPEX subaccounts. */
	bopDevCoCosts: "vsb_bopcontractsstandardassumptiondevcocostses",
	/** `Milestones Standard Assumptions` — Admin Milestones Screen. */
	milestonesStandardAssumptions: "vsb_milestonesstandardassumptionses",
	/** `CAPEX Account Lists` — the self-referencing chart of accounts. */
	capexAccountLists: "vsb_capexaccountlists",
	/** `CAPEX Costs` — the deactivation cascade's victim. */
	capexCosts: "vsb_capexcosts",
	/** `Opex Accounts` — Admin Cost reads `Account.Order` for the O&M split. */
	opexAccounts: "vsb_opexaccounts",
	/** `SPVDevCo Mapping Capex Devexes` — Admin Cost's Cost Paid By default. */
	spvDevCoMapping: "vsb_spvdevcomappingcapexdevexes"
};
/**
* Magic CAPEX account numbers that appear as literals in the admin formulas.
*  · `"00001"` — the root whose children are the cost CATEGORIES.
*  · `"10005"` — a second root, used only by the CAPEX Accounts command bar's
*    reorder-enablement count.
*  · `"10006"` — excluded by the Admin Contract screen's tree builder.
*/
const CAPEX_ROOT_NUMBER = "00001";
/** `Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging"))` — hidden everywhere. */
const OVERLEVERAGING = "Overleveraging";
/**
* The checklist tables shared by Check List Settings and Project Gates (entity sets), plus the
* business-unit set the owning-BU bind points at. Pure names: the rules of both screens use them
* to build `@odata.bind` payloads, so they live here and not in the SDK-touching data module.
*/
const CHECKLIST_ENTITY_SETS = {
	tasks: "vsb_projectdefaultchecklistses",
	headers: "vsb_checklistcountryandtechnologies",
	approvals: "vsb_checklistdefaultapprovalses",
	clusters: "vsb_projectstates",
	businessUnits: "businessunits"
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/features/admin/admin-capex-accounts/rules.ts
/**
* CAPEX Accounts (Application Settings) — every business rule of the screen, pure.
*
* Canvas: `Admin CAPEX Accounts` (PM app),
* `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml`
* (`CA:<n>` / `CAX:<n>` = a line in that file).
* Nothing here touches Dataverse or React; `@/data/adminCapexAccounts.ts` does the I/O and
* `./Screen.tsx` the composition.
*
* Visible strings are the canvas's, verbatim (CONVENTIONS rule 7); each cites its
* `Control.Property`. Strings with no canvas counterpart say `NEW`. Behaviour that differs from the
* canvas is marked `SOURCE DEFECT:` (a canvas bug, fixed) or `DIVERGENCE:` (a deliberate new
* behaviour) — rule 8; see `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D19 and
* `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §1.
*
* SOURCE DEFECT: the screen itself is unprotected in the canvas. The `DataSourceInfo` /
* `RecordInfo` tests only decide what the command bar offers; entry is client-side hiding only
* (`ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav items). Here every
* write is refused without the admin rule (`useAdminAccess`), and the table privileges are
* server-enforced (`platform/privileges.ts`: Dataverse decides, a 403 becomes a message). Not
* security: Dataverse must refuse these writes too (D1). A deactivation deletes forecast costs
* across every project, and activating back does not restore them.
*
* No flow and no plugin step fires on the three tables this screen writes
* (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified section). The screen has no hidden
* controls apart from `lbl_Account_AccountItemHeightValue_Hidden` (a gallery-height helper, not
* ported).
*/
/** The root of the chart of accounts (App:1567-1580 `'Parent Account'.Number = "00001"`). */
const ROOT_NUMBER = CAPEX_ROOT_NUMBER;
/**
* Siblings: `vsb_order` asc (`gal_Account_Accounts.Items` / `pcf_Account_AccountCardBody_SubAccounts
* .Items: Sort(…, Order, SortOrder.Ascending)`, CA:392-399, CA:529-537), tie-break `vsb_number`
* (NEW: the canvas left ties to the collection's order).
*/
function compareSiblings(a, b) {
	if (a.order !== b.order) return a.order - b.order;
	return a.number.localeCompare(b.number, void 0, { numeric: true });
}
/**
* The whole table, read once, as a tree — replaces the canvas collections `colCapexAccounts` /
* `colCapexAccountCategories` built in `App.OnStart` and never refreshed. The categories (the tabs)
* are the children of the root `00001`. Rows that are not reachable from the root (a deleted
* parent leaves its children orphaned — the lookup is RemoveLink) are ignored rather than crashed
* on. Cycles cannot hang this: a node is attached at most once.
*/
function buildCapexTree(rows) {
	const nodes = /* @__PURE__ */ new Map();
	for (const r of rows) nodes.set(r.id, {
		id: r.id,
		number: r.number,
		name: r.name,
		order: r.order ?? 0,
		active: r.active,
		parentId: r.parentId,
		children: []
	});
	const childrenOf = /* @__PURE__ */ new Map();
	for (const node of nodes.values()) {
		if (!node.parentId) continue;
		const list = childrenOf.get(node.parentId) ?? [];
		list.push(node);
		childrenOf.set(node.parentId, list);
	}
	const root = [...nodes.values()].find((n) => n.number === ROOT_NUMBER);
	const byId = /* @__PURE__ */ new Map();
	if (!root) return {
		root: void 0,
		categories: [],
		byId
	};
	const attach = (node) => {
		byId.set(node.id, node);
		const kids = (childrenOf.get(node.id) ?? []).filter((k) => !byId.has(k.id));
		kids.sort(compareSiblings);
		node.children = kids;
		for (const k of kids) attach(k);
	};
	attach(root);
	return {
		root,
		categories: root.children,
		byId
	};
}
ES_ADMIN.capexAccountLists;
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/domain/locale.ts
/**
* Locale handling, which the canvas app did by hand and got subtly wrong.
*
* `fn_Numeric` branches on `Lower(First(Split(Language(), "-")).Value)`: `"en"` means the
* decimal separator is `.`, and *every other language* means it is `,`. The Save handler then
* parses with `Value(txt.Value, gblCurrentUser.Lang)`. Both are locale-dependent, so the same
* keystrokes mean different numbers to a German and an English user — which is correct
* behaviour, but it has to be preserved deliberately rather than by accident.
*
* `Intl` also throws on a malformed language tag, and `navigator.language` is not guaranteed
* well-formed (a host with no `LANG` can report `en-US@posix`). Every number and date in this
* app goes through `Intl`, so one bad tag would blank the whole screen. `resolveLocale`
* repairs the tag where it can and only falls back when nothing is salvageable.
*/
/** What the canvas app's fallback branch assumed: comma decimals. */
const DEFAULT_LOCALE = "de-DE";
function isUsable(tag) {
	try {
		new Intl.NumberFormat(tag);
		return true;
	} catch {
		return false;
	}
}
/**
* Both functions below are pure — the same tag always resolves the same way — but each one
* constructs an `Intl.NumberFormat`, which costs ~80 µs. They sit under `parseNumber` /
* `isDecimal`, i.e. under every keystroke in every numeric field and every cell of a pasted
* sheet, so the answers are memoised. The key set is tiny in practice: the host language plus
* the handful of literal tags the rules files pass.
*
* The cap exists only so a caller feeding unbounded distinct tags cannot grow the map without
* limit; it is never reached by this app's call sites.
*/
const MAX_CACHED_LOCALES = 64;
/** Cache key for "no tag at all" — `|` is not legal in a BCP-47 tag, so it cannot collide. */
const NO_TAG = "|none|";
const repairedTags = /* @__PURE__ */ new Map();
const localeInfos = /* @__PURE__ */ new Map();
/**
* Salvage a language tag. `en-US@posix` → `en-US`; `de_DE` → `de-DE`; `EN` → `en`.
* A German user keeps German formatting rather than silently getting American.
*/
function repairLanguageTag(raw) {
	if (!raw) return DEFAULT_LOCALE;
	const cached = repairedTags.get(raw);
	if (cached !== void 0) return cached;
	const cleaned = raw.trim().replace(/_/g, "-").split("@")[0] ?? "";
	let resolved;
	if (cleaned && isUsable(cleaned)) resolved = cleaned;
	else {
		const primary = cleaned.split("-")[0];
		resolved = primary && isUsable(primary) ? primary : DEFAULT_LOCALE;
	}
	if (repairedTags.size >= MAX_CACHED_LOCALES) repairedTags.clear();
	repairedTags.set(raw, resolved);
	return resolved;
}
function localeInfo(raw) {
	const key = raw ?? runtimeLanguage() ?? NO_TAG;
	const cached = localeInfos.get(key);
	if (cached !== void 0) return cached;
	const tag = repairLanguageTag(raw ?? runtimeLanguage());
	const parts = new Intl.NumberFormat(tag).formatToParts(12345.6);
	const decimal = parts.find((p) => p.type === "decimal")?.value;
	const group = parts.find((p) => p.type === "group")?.value ?? "";
	const info = Object.freeze({
		tag,
		decimalSeparator: decimal === "." ? "." : ",",
		groupSeparator: group
	});
	if (localeInfos.size >= MAX_CACHED_LOCALES) localeInfos.clear();
	localeInfos.set(key, info);
	return info;
}
function runtimeLanguage() {
	if (typeof navigator === "undefined") return void 0;
	return navigator.language;
}
const numberFormats = /* @__PURE__ */ new Map();
/**
* A shared `Intl.NumberFormat` for a (locale, options) pair.
*
* Constructing one costs ~80 µs; calling `.format()` on an existing one costs ~1.5 µs. The
* rules files format every money cell of every row through these, so the formatters are
* pooled rather than rebuilt. An `Intl.NumberFormat` holds no per-call state, so sharing one
* between callers is safe and the output is byte-identical.
*
* The key is the options object as written at the call site. Two call sites spelling the same
* options in a different order simply get an entry each — a miss is never a wrong answer.
*/
function numberFormat(locale, options) {
	const key = `${locale}|${options === void 0 ? "" : JSON.stringify(options)}`;
	const cached = numberFormats.get(key);
	if (cached !== void 0) return cached;
	const format = new Intl.NumberFormat(locale, options);
	if (numberFormats.size >= MAX_CACHED_LOCALES) numberFormats.clear();
	numberFormats.set(key, format);
	return format;
}
/**
* Power Fx `Text(n, "#,###.0#")` in a language (D117): the PATTERN decides where the separators go — groups of three
* digits, whatever the language — and the language only decides which characters they are ("1.234.567,5" in German,
* "1 234 567,5" in French, "1,234,567.5" in English). `Intl` with the full locale is not the same: en-IN groups in lakhs
* ("12,34,567"). No locale means the browser's, as the Cost screens read their boxes.
*/
function canvasNumberText(value, locale, options) {
	const { decimalSeparator, groupSeparator } = localeInfo(locale);
	return numberFormat("en-US", options).format(value).replace(/[.,]/g, (c) => c === "." ? decimalSeparator : groupSeparator);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/platform/errors.ts
/** A failed Dataverse operation, with the HTTP detail preserved where the SDK gives it. */
var DataError = class DataError extends Error {
	status;
	operation;
	/** `Error.cause` exists on the base type, hence the modifier. */
	cause;
	/**
	* Set (to `true`) only on a failure that can never succeed on a second try, e.g. the `fetchAll` page cap (dvopt WE-01).
	* `isRetryable` and `classifyError` honour it, whatever the status. Left undefined on every other error.
	*/
	deterministic;
	constructor(operation, cause, status, options) {
		super(`${operation} failed: ${describe(cause)}`);
		this.name = "DataError";
		this.operation = operation;
		this.status = status;
		this.cause = cause;
		if (options?.deterministic) this.deterministic = true;
	}
	/** A failure that a second try cannot change (dvopt WE-01): not retried by react-query, `classifyError` says `unknown`. */
	static deterministic(operation, cause, status) {
		return new DataError(operation, cause, status, { deterministic: true });
	}
	/** 403 from Dataverse means the row-level security said no, not that the app is broken. */
	get isForbidden() {
		return this.status === 403 || this.status === 401;
	}
};
function describe(cause) {
	if (!cause) return "no error detail was returned";
	if (cause instanceof Error) return cause.message;
	if (typeof cause === "string") return cause;
	const message = cause["message"];
	if (typeof message === "string") return message;
	try {
		return JSON.stringify(cause);
	} catch {
		return String(cause);
	}
}
/**
* `status` is not on `IOperationResult.error`'s public type — `PowerDataRuntimeHttpError`
* carries it, but the union is widened to `Error`. Read it defensively.
*/
function statusOf(error) {
	if (!error || typeof error !== "object") return void 0;
	const candidate = error["status"] ?? error["statusCode"];
	return typeof candidate === "number" ? candidate : void 0;
}
/** `success === false` becomes a throw. Use for every call whose result you rely on. */
function unwrap(result, operation) {
	if (!result.success) throw new DataError(operation, result.error, statusOf(result.error));
	return result.data;
}
/**
* The innermost Dataverse reason in an error's `cause` chain, as one support line:
* `HTTP 400: <Dataverse message> (request <id>)`. Wrapping errors (bulk save phases, chunks) name
* WHERE a write failed; this names WHY, which is otherwise only visible in the network trace.
*/
function rootCauseDetail(error) {
	let innermost;
	let current = error;
	for (let depth = 0; depth < 8 && current; depth += 1) {
		if (current instanceof DataError) innermost = current;
		current = current.cause;
	}
	if (!innermost) return void 0;
	const sdk = innermost.cause;
	const requestId = typeof sdk?.["requestId"] === "string" ? ` (request ${sdk["requestId"]})` : "";
	return `${innermost.status === void 0 ? "" : `HTTP ${innermost.status}: `}${describe(innermost.cause)}${requestId}`;
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result;
			ctor = ctor();
			ctor.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject;
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error;
			});
			-1 === payload._status && (payload._status = 0, payload._result = ctor);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = function(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	};
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.2.8";
}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/react/cjs/react.development.js
/**
* @license React
* react.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_development = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	"production" !== process.env.NODE_ENV && (function() {
		function defineDeprecationWarning(methodName, info) {
			Object.defineProperty(Component.prototype, methodName, { get: function() {
				console.warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
			} });
		}
		function getIteratorFn(maybeIterable) {
			if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
			maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
			return "function" === typeof maybeIterable ? maybeIterable : null;
		}
		function warnNoop(publicInstance, callerName) {
			publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
			var warningKey = publicInstance + "." + callerName;
			didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, publicInstance), didWarnStateUpdateForUnmountedComponent[warningKey] = !0);
		}
		function Component(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function ComponentDummy() {}
		function PureComponent(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function noop() {}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function cloneAndReplaceKey(oldElement, newKey) {
			newKey = ReactElement(oldElement.type, newKey, oldElement.props, oldElement._owner, oldElement._debugStack, oldElement._debugTask);
			oldElement._store && (newKey._store.validated = oldElement._store.validated);
			return newKey;
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		function escape(key) {
			var escaperLookup = {
				"=": "=0",
				":": "=2"
			};
			return "$" + key.replace(/[=:]/g, function(match) {
				return escaperLookup[match];
			});
		}
		function getElementKey(element, index) {
			return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
		}
		function resolveThenable(thenable) {
			switch (thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
				default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
					"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
				}, function(error) {
					"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
				})), thenable.status) {
					case "fulfilled": return thenable.value;
					case "rejected": throw thenable.reason;
				}
			}
			throw thenable;
		}
		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
			var type = typeof children;
			if ("undefined" === type || "boolean" === type) children = null;
			var invokeCallback = !1;
			if (null === children) invokeCallback = !0;
			else switch (type) {
				case "bigint":
				case "string":
				case "number":
					invokeCallback = !0;
					break;
				case "object": switch (children.$$typeof) {
					case REACT_ELEMENT_TYPE:
					case REACT_PORTAL_TYPE:
						invokeCallback = !0;
						break;
					case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
				}
			}
			if (invokeCallback) {
				invokeCallback = children;
				callback = callback(invokeCallback);
				var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
				isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
					return c;
				})) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + childKey), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
				return 1;
			}
			invokeCallback = 0;
			childKey = "" === nameSoFar ? "." : nameSoFar + ":";
			if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if (i = getIteratorFn(children), "function" === typeof i) for (i === children.entries && (didWarnAboutMaps || console.warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = !0), children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if ("object" === type) {
				if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
				array = String(children);
				throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
			}
			return invokeCallback;
		}
		function mapChildren(children, func, context) {
			if (null == children) return children;
			var result = [], count = 0;
			mapIntoArray(children, result, "", "", function(child) {
				return func.call(context, child, count++);
			});
			return result;
		}
		function lazyInitializer(payload) {
			if (-1 === payload._status) {
				var ioInfo = payload._ioInfo;
				null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
				ioInfo = payload._result;
				var thenable = ioInfo();
				thenable.then(function(moduleObject) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 1;
						payload._result = moduleObject;
						var _ioInfo = payload._ioInfo;
						null != _ioInfo && (_ioInfo.end = performance.now());
						void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
					}
				}, function(error) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 2;
						payload._result = error;
						var _ioInfo2 = payload._ioInfo;
						null != _ioInfo2 && (_ioInfo2.end = performance.now());
						void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
					}
				});
				ioInfo = payload._ioInfo;
				if (null != ioInfo) {
					ioInfo.value = thenable;
					var displayName = thenable.displayName;
					"string" === typeof displayName && (ioInfo.name = displayName);
				}
				-1 === payload._status && (payload._status = 0, payload._result = thenable);
			}
			if (1 === payload._status) return ioInfo = payload._result, void 0 === ioInfo && console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", ioInfo), "default" in ioInfo || console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", ioInfo), ioInfo.default;
			throw payload._result;
		}
		function resolveDispatcher() {
			var dispatcher = ReactSharedInternals.H;
			null === dispatcher && console.error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
			return dispatcher;
		}
		function releaseAsyncTransition() {
			ReactSharedInternals.asyncTransitions--;
		}
		function enqueueTask(task) {
			if (null === enqueueTaskImpl) try {
				var requireString = ("require" + Math.random()).slice(0, 7);
				enqueueTaskImpl = (module && module[requireString]).call(module, "timers").setImmediate;
			} catch (_err) {
				enqueueTaskImpl = function(callback) {
					!1 === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = !0, "undefined" === typeof MessageChannel && console.error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."));
					var channel = new MessageChannel();
					channel.port1.onmessage = callback;
					channel.port2.postMessage(void 0);
				};
			}
			return enqueueTaskImpl(task);
		}
		function aggregateErrors(errors) {
			return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
		}
		function popActScope(prevActQueue, prevActScopeDepth) {
			prevActScopeDepth !== actScopeDepth - 1 && console.error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
			actScopeDepth = prevActScopeDepth;
		}
		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
			var queue = ReactSharedInternals.actQueue;
			if (null !== queue) if (0 !== queue.length) try {
				flushActQueue(queue);
				enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
				});
				return;
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			else ReactSharedInternals.actQueue = null;
			0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
		}
		function flushActQueue(queue) {
			if (!isFlushing) {
				isFlushing = !0;
				var i = 0;
				try {
					for (; i < queue.length; i++) {
						var callback = queue[i];
						do {
							ReactSharedInternals.didUsePromise = !1;
							var continuation = callback(!1);
							if (null !== continuation) {
								if (ReactSharedInternals.didUsePromise) {
									queue[i] = callback;
									queue.splice(0, i);
									return;
								}
								callback = continuation;
							} else break;
						} while (1);
					}
					queue.length = 0;
				} catch (error) {
					queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
				} finally {
					isFlushing = !1;
				}
			}
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
			isMounted: function() {
				return !1;
			},
			enqueueForceUpdate: function(publicInstance) {
				warnNoop(publicInstance, "forceUpdate");
			},
			enqueueReplaceState: function(publicInstance) {
				warnNoop(publicInstance, "replaceState");
			},
			enqueueSetState: function(publicInstance) {
				warnNoop(publicInstance, "setState");
			}
		}, assign = Object.assign, emptyObject = {};
		Object.freeze(emptyObject);
		Component.prototype.isReactComponent = {};
		Component.prototype.setState = function(partialState, callback) {
			if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
			this.updater.enqueueSetState(this, partialState, callback, "setState");
		};
		Component.prototype.forceUpdate = function(callback) {
			this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
		};
		var deprecatedAPIs = {
			isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
			replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
		};
		for (fnName in deprecatedAPIs) deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
		ComponentDummy.prototype = Component.prototype;
		deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
		deprecatedAPIs.constructor = PureComponent;
		assign(deprecatedAPIs, Component.prototype);
		deprecatedAPIs.isPureReactComponent = !0;
		var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
			H: null,
			A: null,
			T: null,
			S: null,
			actQueue: null,
			asyncTransitions: 0,
			isBatchingLegacy: !1,
			didScheduleLegacyUpdate: !1,
			didUsePromise: !1,
			thrownErrors: [],
			getCurrentStack: null,
			recentlyCreatedOwnerStacks: 0
		}, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		deprecatedAPIs = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(deprecatedAPIs, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutMaps = !1, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
			if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
				var event = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
					error
				});
				if (!window.dispatchEvent(event)) return;
			} else if ("object" === typeof process && "function" === typeof process.emit) {
				process.emit("uncaughtException", error);
				return;
			}
			console.error(error);
		}, didWarnAboutMessageChannel = !1, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = !1, isFlushing = !1, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
			queueMicrotask(function() {
				return queueMicrotask(callback);
			});
		} : enqueueTask;
		deprecatedAPIs = Object.freeze({
			__proto__: null,
			c: function(size) {
				return resolveDispatcher().useMemoCache(size);
			}
		});
		var fnName = {
			map: mapChildren,
			forEach: function(children, forEachFunc, forEachContext) {
				mapChildren(children, function() {
					forEachFunc.apply(this, arguments);
				}, forEachContext);
			},
			count: function(children) {
				var n = 0;
				mapChildren(children, function() {
					n++;
				});
				return n;
			},
			toArray: function(children) {
				return mapChildren(children, function(child) {
					return child;
				}) || [];
			},
			only: function(children) {
				if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
				return children;
			}
		};
		exports.Activity = REACT_ACTIVITY_TYPE;
		exports.Children = fnName;
		exports.Component = Component;
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.Profiler = REACT_PROFILER_TYPE;
		exports.PureComponent = PureComponent;
		exports.StrictMode = REACT_STRICT_MODE_TYPE;
		exports.Suspense = REACT_SUSPENSE_TYPE;
		exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
		exports.__COMPILER_RUNTIME = deprecatedAPIs;
		exports.act = function(callback) {
			var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
			actScopeDepth++;
			var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = !1;
			try {
				var result = callback();
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			if (0 < ReactSharedInternals.thrownErrors.length) throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			if (null !== result && "object" === typeof result && "function" === typeof result.then) {
				var thenable = result;
				queueSeveralMicrotasks(function() {
					didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"));
				});
				return { then: function(resolve, reject) {
					didAwaitActCall = !0;
					thenable.then(function(returnValue) {
						popActScope(prevActQueue, prevActScopeDepth);
						if (0 === prevActScopeDepth) {
							try {
								flushActQueue(queue), enqueueTask(function() {
									return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
								});
							} catch (error$0) {
								ReactSharedInternals.thrownErrors.push(error$0);
							}
							if (0 < ReactSharedInternals.thrownErrors.length) {
								var _thrownError = aggregateErrors(ReactSharedInternals.thrownErrors);
								ReactSharedInternals.thrownErrors.length = 0;
								reject(_thrownError);
							}
						} else resolve(returnValue);
					}, function(error) {
						popActScope(prevActQueue, prevActScopeDepth);
						0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
					});
				} };
			}
			var returnValue$jscomp$0 = result;
			popActScope(prevActQueue, prevActScopeDepth);
			0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
				didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"));
			}), ReactSharedInternals.actQueue = null);
			if (0 < ReactSharedInternals.thrownErrors.length) throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			return { then: function(resolve, reject) {
				didAwaitActCall = !0;
				0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue$jscomp$0, resolve, reject);
				})) : resolve(returnValue$jscomp$0);
			} };
		};
		exports.cache = function(fn) {
			return function() {
				return fn.apply(null, arguments);
			};
		};
		exports.cacheSignal = function() {
			return null;
		};
		exports.captureOwnerStack = function() {
			var getCurrentStack = ReactSharedInternals.getCurrentStack;
			return null === getCurrentStack ? null : getCurrentStack();
		};
		exports.cloneElement = function(element, config, children) {
			if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
			var props = assign({}, element.props), key = element.key, owner = element._owner;
			if (null != config) {
				var JSCompiler_inline_result;
				a: {
					if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(config, "ref").get) && JSCompiler_inline_result.isReactWarning) {
						JSCompiler_inline_result = !1;
						break a;
					}
					JSCompiler_inline_result = void 0 !== config.ref;
				}
				JSCompiler_inline_result && (owner = getOwner());
				hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
				for (propName in config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
			}
			var propName = arguments.length - 2;
			if (1 === propName) props.children = children;
			else if (1 < propName) {
				JSCompiler_inline_result = Array(propName);
				for (var i = 0; i < propName; i++) JSCompiler_inline_result[i] = arguments[i + 2];
				props.children = JSCompiler_inline_result;
			}
			props = ReactElement(element.type, key, props, owner, element._debugStack, element._debugTask);
			for (key = 2; key < arguments.length; key++) validateChildKeys(arguments[key]);
			return props;
		};
		exports.createContext = function(defaultValue) {
			defaultValue = {
				$$typeof: REACT_CONTEXT_TYPE,
				_currentValue: defaultValue,
				_currentValue2: defaultValue,
				_threadCount: 0,
				Provider: null,
				Consumer: null
			};
			defaultValue.Provider = defaultValue;
			defaultValue.Consumer = {
				$$typeof: REACT_CONSUMER_TYPE,
				_context: defaultValue
			};
			defaultValue._currentRenderer = null;
			defaultValue._currentRenderer2 = null;
			return defaultValue;
		};
		exports.createElement = function(type, config, children) {
			for (var i = 2; i < arguments.length; i++) validateChildKeys(arguments[i]);
			i = {};
			var key = null;
			if (null != config) for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = !0, console.warn("Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform")), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
			var childrenLength = arguments.length - 2;
			if (1 === childrenLength) i.children = children;
			else if (1 < childrenLength) {
				for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++) childArray[_i] = arguments[_i + 2];
				Object.freeze && Object.freeze(childArray);
				i.children = childArray;
			}
			if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === i[propName] && (i[propName] = childrenLength[propName]);
			key && defineKeyPropWarningGetter(i, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
			return ReactElement(type, key, i, getOwner(), propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack, propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.createRef = function() {
			var refObject = { current: null };
			Object.seal(refObject);
			return refObject;
		};
		exports.forwardRef = function(render) {
			null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).") : "function" !== typeof render ? console.error("forwardRef requires a render function but was given %s.", null === render ? "null" : typeof render) : 0 !== render.length && 2 !== render.length && console.error("forwardRef render functions accept exactly two parameters: props and ref. %s", 1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
			null != render && null != render.defaultProps && console.error("forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?");
			var elementType = {
				$$typeof: REACT_FORWARD_REF_TYPE,
				render
			}, ownName;
			Object.defineProperty(elementType, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
				}
			});
			return elementType;
		};
		exports.isValidElement = isValidElement;
		exports.lazy = function(ctor) {
			ctor = {
				_status: -1,
				_result: ctor
			};
			var lazyType = {
				$$typeof: REACT_LAZY_TYPE,
				_payload: ctor,
				_init: lazyInitializer
			}, ioInfo = {
				name: "lazy",
				start: -1,
				end: -1,
				value: null,
				owner: null,
				debugStack: Error("react-stack-top-frame"),
				debugTask: console.createTask ? console.createTask("lazy()") : null
			};
			ctor._ioInfo = ioInfo;
			lazyType._debugInfo = [{ awaited: ioInfo }];
			return lazyType;
		};
		exports.memo = function(type, compare) {
			type ?? console.error("memo: The first argument must be a component. Instead received: %s", null === type ? "null" : typeof type);
			compare = {
				$$typeof: REACT_MEMO_TYPE,
				type,
				compare: void 0 === compare ? null : compare
			};
			var ownName;
			Object.defineProperty(compare, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
				}
			});
			return compare;
		};
		exports.startTransition = function(scope) {
			var prevTransition = ReactSharedInternals.T, currentTransition = {};
			currentTransition._updatedFibers = /* @__PURE__ */ new Set();
			ReactSharedInternals.T = currentTransition;
			try {
				var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
				null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
				"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
			} catch (error) {
				reportGlobalError(error);
			} finally {
				null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.")), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
			}
		};
		exports.unstable_useCacheRefresh = function() {
			return resolveDispatcher().useCacheRefresh();
		};
		exports.use = function(usable) {
			return resolveDispatcher().use(usable);
		};
		exports.useActionState = function(action, initialState, permalink) {
			return resolveDispatcher().useActionState(action, initialState, permalink);
		};
		exports.useCallback = function(callback, deps) {
			return resolveDispatcher().useCallback(callback, deps);
		};
		exports.useContext = function(Context) {
			var dispatcher = resolveDispatcher();
			Context.$$typeof === REACT_CONSUMER_TYPE && console.error("Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?");
			return dispatcher.useContext(Context);
		};
		exports.useDebugValue = function(value, formatterFn) {
			return resolveDispatcher().useDebugValue(value, formatterFn);
		};
		exports.useDeferredValue = function(value, initialValue) {
			return resolveDispatcher().useDeferredValue(value, initialValue);
		};
		exports.useEffect = function(create, deps) {
			create ?? console.warn("React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useEffect(create, deps);
		};
		exports.useEffectEvent = function(callback) {
			return resolveDispatcher().useEffectEvent(callback);
		};
		exports.useId = function() {
			return resolveDispatcher().useId();
		};
		exports.useImperativeHandle = function(ref, create, deps) {
			return resolveDispatcher().useImperativeHandle(ref, create, deps);
		};
		exports.useInsertionEffect = function(create, deps) {
			create ?? console.warn("React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useInsertionEffect(create, deps);
		};
		exports.useLayoutEffect = function(create, deps) {
			create ?? console.warn("React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useLayoutEffect(create, deps);
		};
		exports.useMemo = function(create, deps) {
			return resolveDispatcher().useMemo(create, deps);
		};
		exports.useOptimistic = function(passthrough, reducer) {
			return resolveDispatcher().useOptimistic(passthrough, reducer);
		};
		exports.useReducer = function(reducer, initialArg, init) {
			return resolveDispatcher().useReducer(reducer, initialArg, init);
		};
		exports.useRef = function(initialValue) {
			return resolveDispatcher().useRef(initialValue);
		};
		exports.useState = function(initialState) {
			return resolveDispatcher().useState(initialState);
		};
		exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
			return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
		};
		exports.useTransition = function() {
			return resolveDispatcher().useTransition();
		};
		exports.version = "19.2.8";
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_production();
	else module.exports = require_react_development();
})))();
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/platform/consoleGate.ts
/** Lines held while the environment is unknown; the oldest are dropped beyond this. */
const HELD_MAX = 1e3;
let held = [];
/** The only way the app prints to the console: printed now, held, or dropped, as the state says. */
function consoleOutput(method, ...args) {
	held.push({
		method,
		args
	});
	if (held.length > 1e3) held.splice(0, held.length - HELD_MAX);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/platform/requestLog.ts
const LOG_PREFIX = "[VSB]";
const scopes = /* @__PURE__ */ new Set();
/** A request slower than this, or an action slower than this, is flagged `SLOW`. */
const SLOW_REQUEST_MS = 3e3;
const recent = [];
/** ` [a7]` for the open action, ` [a7,a8]` for overlapping ones, nothing outside any action. */
const idTag = () => scopes.size ? ` [${[...scopes].map((s) => s.id).join(",")}]` : "";
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const round = (n) => Math.round(n);
const emit = (level, line) => {
	try {
		consoleOutput(level, line);
	} catch {}
};
const batches = /* @__PURE__ */ new Map();
let flushTimer;
const num = (n) => round(n).toLocaleString("en-US");
function batchLine(b) {
	const rows = `${num(b.rows)} row${b.rows === 1 ? "" : "s"}`;
	const pages = b.pages > b.calls ? `, ${b.pages} pages` : "";
	const wall = b.lastEnd - b.firstStart;
	const time = b.calls === 1 ? `${num(b.sumMs)} ms` : `${num(b.calls)} calls, ${num(wall)} ms in total (average ${num(b.sumMs / b.calls)} ms, slowest ${num(b.maxMs)} ms)`;
	const failed = b.failed ? `, ${b.failed} FAILED${b.lastError ? ` (${b.lastError})` : ""}` : "";
	const slow = b.maxMs >= SLOW_REQUEST_MS;
	const tag = b.ids.size ? ` [${[...b.ids].join(",")}]` : "";
	return {
		level: b.failed || slow ? "warn" : "info",
		line: `${LOG_PREFIX} DATA ${b.kind} ${b.target}: ${rows}${pages}, ${time}${failed}${slow ? " · SLOW" : ""}${tag}`
	};
}
/** Prints every pending DATA batch now (an action closing does this, so its lines come first). */
function flushDataLog() {
	if (flushTimer !== void 0) clearTimeout(flushTimer);
	flushTimer = void 0;
	const pending = [...batches.values()];
	batches.clear();
	for (const b of pending) {
		const { level, line } = batchLine(b);
		emit(level, line);
	}
}
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/**
* A failure text with every record id replaced by `<id>` (D78). Dataverse fault text often names
* the row ("… With Id = <guid> Does Not Exist"), and a DATA line carries counts and names only.
*/
const redactIds = (text) => text.replace(GUID, "<id>");
/**
* One DATA line per kind and table, however many calls it took: 40 single-row deletes of one table
* print as "40 rows, 40 calls, … ms in total (average, slowest)". The line appears once the table
* has been quiet for a moment, or when the surrounding action ends.
*/
function logData(call) {
	const rows = call.rows ?? 0;
	for (const s of scopes) {
		s.rows += rows;
		const key = `${call.kind} ${call.target}`;
		s.ops.set(key, (s.ops.get(key) ?? 0) + 1);
	}
	const end = now();
	const key = `${call.kind} ${call.target}`;
	const b = batches.get(key) ?? {
		kind: call.kind,
		target: call.target,
		calls: 0,
		failed: 0,
		rows: 0,
		pages: 0,
		sumMs: 0,
		maxMs: 0,
		firstStart: end - call.ms,
		lastEnd: end,
		ids: /* @__PURE__ */ new Set()
	};
	for (const s of scopes) b.ids.add(s.id);
	b.calls += 1;
	b.rows += rows;
	b.pages += call.pages ?? 1;
	b.sumMs += call.ms;
	b.maxMs = Math.max(b.maxMs, call.ms);
	b.firstStart = Math.min(b.firstStart, end - call.ms);
	b.lastEnd = end;
	if (!call.ok) {
		b.failed += 1;
		if (call.error) b.lastError = redactIds(call.error);
	}
	batches.set(key, b);
	if (flushTimer !== void 0) clearTimeout(flushTimer);
	const oldest = Math.min(...[...batches.values()].map((x) => x.firstStart));
	flushTimer = setTimeout(flushDataLog, end - oldest >= 2e3 ? 0 : 300);
}
const routeOf = () => {
	try {
		return window.location.hash.replace(/^#/, "").split("?")[0] || "/";
	} catch {
		return "/";
	}
};
/**
* One ERROR line: what failed, its root cause (status, server text, request id), the route, and with
* `context` (an unhandled crash) the last actions that ran. Counts and names only, no row values.
* Not for expected outcomes: the caller (`trace`) decides what is an error.
*/
function logError(message, cause, context = false) {
	const where = ` @ ${routeOf()}`;
	const last = context && recent.length ? ` · last actions: ${recent.join(" → ")}` : "";
	emit("error", `${LOG_PREFIX} ERROR ${message}${cause ? ` — ${cause}` : ""}${where}${last}${idTag()}`);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/platform/telemetry.ts
/**
* Replaces the canvas `Trace(...)` calls and `App.OnError`.
*
* The canvas app captured every error into `gblReportError` and then *commented out* the
* `Notify` that told the user — see `App.OnError` — while the panel that was supposed to
* file the report has its flow call commented out too. So today a Dataverse fault is
* completely silent. This buffer keeps the capture (the report panel needs it) and the UI
* layer is responsible for actually saying something.
*/
/** Ring buffer. Bounded so a render loop cannot exhaust memory. */
const MAX_ENTRIES = 200;
const entries = [];
const listeners = /* @__PURE__ */ new Set();
const sinks = /* @__PURE__ */ new Set();
/** The server-side reason of `detail`, as text: the Dataverse root cause, else the error's own message. */
function causeText(detail) {
	const root = rootCauseDetail(detail);
	if (root) return root.length > 300 ? `${root.slice(0, 299)}…` : root;
	if (detail instanceof Error && detail.message !== "") return detail.message.slice(0, 300);
}
/**
* `quiet` keeps the entry in the buffer without a console line: for a failed request, whose
* `[VSB] HTTP … → 4xx` line is already there (`platform/powerClient.ts`).
*/
function trace(severity, message, detail, quiet = false) {
	if (!quiet && (severity === "error" || severity === "critical")) try {
		logError(message, causeText(detail), severity === "critical");
	} catch {}
	const entry = {
		severity,
		message,
		at: (/* @__PURE__ */ new Date()).toISOString(),
		detail
	};
	entries.push(entry);
	if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
	for (const l of listeners) l();
	for (const s of sinks) try {
		s(entry);
	} catch {}
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/theme/tokens.ts
/**
* VSB palette — TRANSCRIBED, not chosen.
*
* Every hex below is copied from `App.Formulas` → `AppTheme.palette` in
* `Src/App.pa.yaml` of the Project Costs canvas app. Changing one changes visual parity,
* so treat this file as data owned by the canvas app, not as a design decision.
*
* The canvas app also stringified this object into `gblAppThemeJson` and handed it to every
* PowerCAT control's `Theme` property. There are no PowerCAT controls here, so that whole
* mechanism is gone — the values feed Fluent v9 through `vsbTheme` in `./fluent.ts`.
*/
const palette = {
	themePrimary: "#006eb9",
	themeLighterAlt: "#f2f8fc",
	themeLighter: "#cde4f4",
	themeLight: "#a4ceea",
	themeTertiary: "#55a2d6",
	themeSecondary: "#177ec2",
	themeDarkAlt: "#0065a8",
	themeDark: "#00558d",
	themeDarker: "#003f68",
	neutralLighterAlt: "#faf9f8",
	neutralLighter: "#f3f2f1",
	neutralLight: "#edebe9",
	neutralQuaternaryAlt: "#e1dfdd",
	neutralQuaternary: "#d0d0d0",
	neutralTertiaryAlt: "#c8c6c4",
	neutralTertiary: "#595959",
	neutralSecondary: "#373737",
	neutralPrimaryAlt: "#2f2f2f",
	neutralPrimary: "#000000",
	neutralDark: "#151515",
	black: "#0b0b0b",
	white: "#ffffff",
	akzent1: "#469bd7",
	akzent2: "#41aab4",
	akzent3: "#82a51e",
	akzent4: "#f5911e",
	akzent5: "#d20532",
	akzent6: "#af2887",
	hoverButton: "#CCE2F1",
	Grayscale00: "#0D0D0D",
	Grayscale10: "#6C6C6C",
	Grayscale20: "#E3E3E3",
	Grayscale30: "#F1F1F1",
	Grayscale40: "#FAFAFA",
	Grayscale50: "#FFFFFF",
	Error: "#B22727",
	Success: "#3C9856",
	SuccessLight: "#E9F3EC",
	Warning: "#EE940C",
	Green: "#82a51e",
	GreenDark: "#75941c",
	GreenLight: "#a0cb24"
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/domain/project.ts
/**
* Project choice sets, and the decoration the overview grid hangs off them.
*
* Every integer here was read out of `src/generated/models/Vsb_projectsModel.ts`, which
* `pac code add-data-source` produced from the live environment — not inferred from a label.
*
* The decoration logic is ported from the skeleton's `src/domain/approval.ts` and checked
* line-for-line against the canvas source it came from: the three parallel `Switch`es on
* `Text('Approval States')` in
* `Project Main Screen.pa.yaml` → `psf_MainScreen_DetailList_Container_FluentDetailsList.Items`
* (`loc_iconstate`, `loc_statetag`, `loc_iconcolor`). The canvas mapping is reproduced exactly.
*/
/** `vsb_approvalstates`. */
const APPROVAL_STATE = {
	draft: 95285e4,
	approving: 952850001,
	approved: 952850002,
	rejected: 952850003,
	canceled: 952850004
};
/** `vsb_technology`. */
const TECHNOLOGY$1 = {
	wind: 95285e4,
	pv: 952850001,
	hybrid: 952850002,
	bess: 952850003,
	hydrogen: 952850004,
	hydro: 952850005,
	substation: 952850006
};
const TECHNOLOGY_LABEL$2 = {
	[TECHNOLOGY$1.wind]: "Wind",
	[TECHNOLOGY$1.pv]: "PV",
	[TECHNOLOGY$1.hybrid]: "Hybrid",
	[TECHNOLOGY$1.bess]: "BESS",
	[TECHNOLOGY$1.hydrogen]: "Hydrogen",
	[TECHNOLOGY$1.hydro]: "Hydro",
	[TECHNOLOGY$1.substation]: "Substation"
};
new Map(Object.entries(TECHNOLOGY_LABEL$2).map(([v, label]) => [label.toLowerCase(), Number(v)]));
APPROVAL_STATE.draft, palette.akzent2, APPROVAL_STATE.approving, palette.akzent4, APPROVAL_STATE.approved, palette.akzent3, APPROVAL_STATE.rejected, palette.akzent5, APPROVAL_STATE.canceled, palette.akzent4;
palette.Grayscale20;
palette.akzent2, palette.Grayscale10, palette.Grayscale10;
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/domain/technology.ts
/**
* `Technology` — the `CHOICE_PROCESS.technology` option set, and the two directions of
* translation every screen that shows or filters it needs.
*
* This lives in `domain/` rather than in `features/project-main/rules.ts` for a concrete
* reason. The column is a Dataverse *choice*, so a row carries the integer `952850000` and a
* `FormattedValue` sibling reading `"Wind"`. `features/shared/useProjectContext.ts` maps a
* project row into the store, and the app header renders `selected.technology` directly — so
* without a shared resolver the header displays the raw `952850000`. A feature module cannot
* be imported by shared code without inverting the dependency, hence here.
*
* `features/project-main/rules.ts` re-exports these, so its existing importers are unaffected.
*/
const TECHNOLOGY_LABEL$1 = {
	[CHOICE_PROCESS.technology.wind]: "Wind",
	[CHOICE_PROCESS.technology.pv]: "PV",
	[CHOICE_PROCESS.technology.hybrid]: "Hybrid",
	[CHOICE_PROCESS.technology.bess]: "BESS",
	[CHOICE_PROCESS.technology.hydrogen]: "Hydrogen",
	[CHOICE_PROCESS.technology.hydro]: "Hydro",
	[CHOICE_PROCESS.technology.substation]: "Substation"
};
new Map(Object.entries(TECHNOLOGY_LABEL$1).map(([v, label]) => [label.toLowerCase(), Number(v)]));
const option = (code) => ({
	code,
	label: TECHNOLOGY_LABEL$1[code] ?? String(code)
});
option(TECHNOLOGY$1.wind), option(TECHNOLOGY$1.pv);
option(TECHNOLOGY$1.wind), option(TECHNOLOGY$1.pv);
option(TECHNOLOGY$1.wind), option(TECHNOLOGY$1.pv), option(TECHNOLOGY$1.bess);
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/domain/costStandards.ts
/**
* Costs settings — the pure option values, labels and error types that both the screen's
* `rules.ts` / `constants.ts` and the Dataverse module (`data/adminCost.ts`) need.
*
* They live here, not in the data module, so that `rules.ts` stays a pure leaf: a rule may not
* import a VALUE from an SDK-touching data module (CONVENTIONS rule 5), while `data/*` may import
* from `domain/*`. Nothing in this file performs I/O.
*/
/** `vsb_typeofcontract` (same values as `TYPE_OF_CONTRACT` in `features/periods/opexRules`). */
const CONTRACT_TYPE = {
	landLease: 95285e4,
	oAndM: 952850001,
	other: 952850002,
	devexCapex: 952850003
};
/**
* `vsb_technology`; the picker offers Wind and PV only. The codes come
* from the shared `@/domain/technology`; this narrows them to the two Costs offers.
*/
const TECHNOLOGY = {
	wind: TECHNOLOGY$1.wind,
	pv: TECHNOLOGY$1.pv
};
TECHNOLOGY.wind, TECHNOLOGY.pv;
/** `vsb_opexaggregation` (same as `AGGREGATION_VALUE` in `costBook.ts`). */
const AGGREGATION = {
	sum: 95285e4,
	max: 952850001,
	min: 952850002
};
/** `vsb_costunit`, in the order the canvas slices it (ACS:10567-10579). */
const COST_UNIT = {
	eur: 95285e4,
	eurMw: 952850001,
	eurWtg: 952850002,
	pln: 952850003,
	plnMw: 952850004,
	plnWtg: 952850005
};
/** `vsb_costpaidtype` (None 952850000 is never offered). */
const COST_PAID_BY = {
	devCo: 952850001,
	spv: 952850002
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/.power/schemas/appschemas/dataSourcesInfo.ts
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is auto-generated. Do not modify it manually.
* Changes to this file may be overwritten.
*/
const dataSourcesInfo = {
	"aadusers": {
		"tableId": "",
		"version": "",
		"primaryKey": "aaduserid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"assumptionsbanks": {
		"tableId": "[dbo].[AssumptionsBanks]",
		"version": "v2",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": {}
	},
	"assumptionsbopcontracts": {
		"tableId": "[dbo].[AssumptionsBoPContracts]",
		"version": "v2",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": {}
	},
	"assumptionsdebt": {
		"tableId": "[dbo].[AssumptionsDebt]",
		"version": "v2",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": {}
	},
	"assumptionskfwtranche": {
		"tableId": "[dbo].[AssumptionsKfWTranche]",
		"version": "v2",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": {}
	},
	"assumptionsrevenue": {
		"tableId": "[dbo].[AssumptionsRevenue]",
		"version": "v2",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": {}
	},
	"businessunits": {
		"tableId": "",
		"version": "",
		"primaryKey": "businessunitid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"createmultiple": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Dataverse",
		"apis": { "CreateMultiple": {
			"path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.CreateMultiple",
			"method": "POST",
			"parameters": [{
				"name": "entitySetName",
				"in": "path",
				"required": true,
				"type": "string",
				"format": "dataverse-entity-set-name"
			}, {
				"name": "Targets",
				"in": "body",
				"required": true,
				"type": "array"
			}],
			"responseInfo": { "200": { "type": "object" } }
		} }
	},
	"environmentvariabledefinitions": {
		"tableId": "",
		"version": "",
		"primaryKey": "environmentvariabledefinitionid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"environmentvariablevalues": {
		"tableId": "",
		"version": "",
		"primaryKey": "environmentvariablevalueid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"getazuremapssastoken": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": {
				"200": { "type": "object" },
				"default": { "type": "object" }
			}
		} }
	},
	"performcommonrequestofchecklistapproval": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": {
				"200": { "type": "object" },
				"default": { "type": "object" }
			}
		} }
	},
	"performcommonrequestofgateapproval": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": {
				"200": { "type": "object" },
				"default": { "type": "object" }
			}
		} }
	},
	"performrequestofchecklistapprovalcancellation": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": {
				"200": { "type": "object" },
				"default": { "type": "object" }
			}
		} }
	},
	"performrequestofgateapprovalcancellation": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": { "202": { "type": "void" } }
		} }
	},
	"requestmodulepermission": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": {
				"200": { "type": "object" },
				"default": { "type": "object" }
			}
		} }
	},
	"requestpermissioncancellation": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Connector",
		"apis": { "Run": {
			"path": "/{connectionId}/triggers/manual/run",
			"method": "POST",
			"parameters": [
				{
					"name": "connectionId",
					"in": "path",
					"required": true,
					"type": "string"
				},
				{
					"name": "input",
					"in": "body",
					"required": true,
					"type": "object"
				},
				{
					"name": "api-version",
					"in": "query",
					"required": true,
					"type": "string"
				}
			],
			"responseInfo": { "202": { "type": "void" } }
		} }
	},
	"roles": {
		"tableId": "",
		"version": "",
		"primaryKey": "roleid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"systemusers": {
		"tableId": "",
		"version": "",
		"primaryKey": "systemuserid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"teams": {
		"tableId": "",
		"version": "",
		"primaryKey": "teamid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"transactioncurrencies": {
		"tableId": "",
		"version": "",
		"primaryKey": "transactioncurrencyid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"updatemultiple": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Dataverse",
		"apis": { "UpdateMultiple": {
			"path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.UpdateMultiple",
			"method": "POST",
			"parameters": [{
				"name": "entitySetName",
				"in": "path",
				"required": true,
				"type": "string",
				"format": "dataverse-entity-set-name"
			}, {
				"name": "Targets",
				"in": "body",
				"required": true,
				"type": "array"
			}],
			"responseInfo": { "204": { "type": "void" } }
		} }
	},
	"upsertmultiple": {
		"tableId": "",
		"version": "",
		"primaryKey": "",
		"dataSourceType": "Dataverse",
		"apis": { "UpsertMultiple": {
			"path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.UpsertMultiple",
			"method": "POST",
			"parameters": [{
				"name": "entitySetName",
				"in": "path",
				"required": true,
				"type": "string",
				"format": "dataverse-entity-set-name"
			}, {
				"name": "Targets",
				"in": "body",
				"required": true,
				"type": "array"
			}],
			"responseInfo": { "200": { "type": "object" } }
		} }
	},
	"vsb_aquisitionstatuses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_aquisitionstatusid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_aquisitiontypes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_aquisitiontypeid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_assumptionslocaltaxfrances": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_assumptionslocaltaxfranceid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_assumptionslocaltaxgermanies": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_assumptionslocaltaxgermanyid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_balancingprices": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_balancingpriceid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_basecases": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_basecaseid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_bopcontractsdevcocostses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_bopcontractsdevcocostsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_bopcontractspaymenttargetses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_bopcontractspaymenttargetsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_bopcontractsstandardassumptiondevcocostses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_bopcontractsstandardassumptiondevcocostsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_bopcontractsstandardassumptionses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_bopcontractsstandardassumptionsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_bopprojectscontractses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_bopprojectscontractsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_capexaccountlists": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_capexaccountlistid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_capexcommentses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_capexcommentsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_capexcosts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_capexcostid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_capexprojectcontracts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_capexprojectcontractid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_checklistcountryandtechnologies": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_checklistcountryandtechnologyid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_checklistdefaultapprovalses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_checklistdefaultapprovalsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_countries": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_countryid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_countryareas": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_countryareaid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_countryinflationprofiles": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_countryinflationprofileid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_customchoicevalues": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_customchoicevalueid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_devexcapexstandardassumptionses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_devexcapexstandardassumptionsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_devicecosts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_devicecostid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_devicetypesinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_devicetypesinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_energyyields": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_energyyieldid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_estimationpriceinflations": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_estimationpriceinflationid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_fabricjobtypes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_fabricjobtypeid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_fabricsyncjobs": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_fabricsyncjobid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_financingcategories": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_financingcategoryid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_financinginputs": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_financinginputid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_financinginputsrepaymentamounts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_financinginputsrepaymentamountid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_financinginputstepupmarginses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_financinginputstepupmarginsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_generatorinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_generatorinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_generators": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_generatorid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_generatortypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_generatortypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_gridoperators": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_gridoperatorid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_hydrogentypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_hydrogentypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_inverters": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_inverterid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_invertertypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_invertertypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_landleaseallocationwtgs": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_landleaseallocationwtgid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_landleaseperiods": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_landleaseperiodid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_landleaseprojectcosts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_landleaseprojectcostid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_landleasesubaccounts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_landleasesubaccountid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_milestonesstandardassumptionses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_milestonesstandardassumptionsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_opexaccounts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_opexaccountid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_opexlandleasestandardassumptionses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_opexlandleasestandardassumptionsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_opexprojectcosts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_opexprojectcostid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_opexsubaccounts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_opexsubaccountid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_permits": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_permitid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectchecklists": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectchecklistid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectchecklisttrackingnotes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectchecklisttrackingnoteid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectdefaultapprovalses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectdefaultapprovalsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectdefaultchecklistses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectdefaultchecklistsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectmemberdescriptionses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectmemberdescriptionsid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectmemberses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectmembersid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectplannings": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectplanningid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectrevenues": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectrevenueid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectstates": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectstateid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectstatetrackingnotes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectstatetrackingnoteid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_projectstatetrackings": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_projectstatetrackingid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_pvmodules": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_pvmoduleid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_pvmoduletypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_pvmoduletypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_pvnegativepriceses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_pvnegativepricesid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_pvseasonalityvalueses": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_pvseasonalityvaluesid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_revenueindividualhedgevolumes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_revenueindividualhedgevolumeid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_revenuesubaccounts": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_revenuesubaccountid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_shareholderentitiies": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_shareholderentitiyid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_spvdevcomappingcapexdevexes": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_spvdevcomappingcapexdevexid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_storagetypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_storagetypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_substationtypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_substationtypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_substructures": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_substructureid",
		"dataSourceType": "Dataverse",
		"apis": {}
	},
	"vsb_substructuretypeinprojects": {
		"tableId": "",
		"version": "",
		"primaryKey": "vsb_substructuretypeinprojectid",
		"dataSourceType": "Dataverse",
		"apis": {}
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/plugins/DefaultPowerAppsBridge.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/** @private */
var DefaultPowerAppsBridge = class {
	_antiCSRFToken;
	_callbacks = {};
	_currentCallbackId = 0;
	_instanceId = Date.now().toString();
	_messageChannel = new window.MessageChannel();
	_postMessageQueue = [];
	_postMessageSource;
	async initialize() {
		this._messageChannel.port1.onmessage = this._handleMessageEvent;
		window.parent.postMessage({
			messageType: "initCommunicationWithPort",
			instanceId: this._instanceId
		}, "*", [this._messageChannel.port2]);
	}
	async executePluginAsync(pluginName, pluginAction, params = [], onUpdate) {
		return new Promise((resolve, reject) => {
			const callbackId = this._getCallbackId(pluginName);
			this._callbacks[callbackId] = {
				resolve,
				reject,
				onUpdate
			};
			this._sendMessage({
				isPluginCall: true,
				callbackId,
				service: pluginName,
				action: pluginAction,
				actionArgs: params,
				antiCSRFToken: this._antiCSRFToken
			});
		});
	}
	_sendMessage(message) {
		if (!this._postMessageSource) this._postMessageQueue.push(message);
		else this._postMessageSource.postMessage(message);
	}
	_getCallbackId(pluginName) {
		return "instanceId=" + this._instanceId + "_" + pluginName + this._currentCallbackId++;
	}
	_handleMessageEvent = (messageEvent) => {
		const message = messageEvent.data;
		if (message && typeof message.isPluginCall === "boolean") {
			if (message.isPluginCall) {
				const callbackId = message.callbackId;
				const status = message.status;
				const args = message.args;
				const keepCallback = message.keepCallback;
				try {
					const callback = this._callbacks[callbackId];
					if (keepCallback) {
						if (callback && callback.onUpdate) callback.onUpdate(message.args?.[0]);
					} else {
						if (callback) {
							if (status === 1) callback.resolve(args[0]);
							else if (status !== 0) callback.reject(args);
						}
						if (!keepCallback) delete this._callbacks[callbackId];
					}
				} catch (error) {
					console.error(error);
				}
			}
		} else if (message && message.messageType === "initCommunication") {
			this._antiCSRFToken = message.antiCSRFToken;
			this._postMessageSource = this._messageChannel.port1;
			if (this._postMessageSource) for (let i = 0; i < this._postMessageQueue.length; i++) {
				this._postMessageQueue[i].antiCSRFToken = this._antiCSRFToken;
				this._postMessageSource.postMessage(this._postMessageQueue[i]);
			}
		}
	};
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/plugins/PluginBridge.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
let bridgePromise;
/** @private */
async function executePluginAsync(pluginName, pluginAction, params = [], update) {
	return (await getBridge()).executePluginAsync(pluginName, pluginAction, params, update);
}
/** @private */
async function getBridge() {
	if (!bridgePromise) bridgePromise = (async () => {
		const injected = globalThis.powerAppsBridge;
		if (!injected && typeof window === "undefined") throw new Error("Native host must inject globalThis.powerAppsBridge before using @microsoft/power-apps in non-browser environments.");
		const bridge = injected ?? new DefaultPowerAppsBridge();
		await bridge.initialize();
		return bridge;
	})();
	return bridgePromise;
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/ConnectionUtils.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
let connectionsLoaded = false;
/** @private */
async function loadConnections() {
	if (connectionsLoaded) return;
	connectionsLoaded = true;
	await loadNonCompositeConnectionsAsync();
	await resolveCompositeConnectionsAsync();
}
async function loadNonCompositeConnectionsAsync() {
	return executePluginAsync("AppPowerAppsClientPlugin", "loadNonCompositeConnectionsAsync", []);
}
async function resolveCompositeConnectionsAsync() {
	return executePluginAsync("AppPowerAppsClientPlugin", "resolveCompositeConnectionsAsync", []);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/OperationExecutor.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
let loadConnectionsPromise;
/**
* Executes operations using the plugin.
* @private
*/
var OperationExecutor = class {
	/**
	* Executes an operation using the plugin.
	* @param operationName The name of the operation.
	* @param action The action to perform.
	* @param params The parameters for the operation.
	* @returns A promise resolving to the operation result.
	*/
	async execute(operationName, action, params) {
		if (!loadConnectionsPromise) loadConnectionsPromise = loadConnections();
		await loadConnectionsPromise;
		return {
			success: true,
			data: await executePluginAsync(operationName, action, params)
		};
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/telemetry/log.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
const ServiceName = "PublishedAppTelemetry";
/** @private */
var Log = class Log {
	_powerOperationExecutor;
	static _instance = null;
	constructor(_powerOperationExecutor) {
		this._powerOperationExecutor = _powerOperationExecutor;
	}
	static createInstance(powerOperationExecutor) {
		if (!Log._instance) Log._instance = new Log(powerOperationExecutor);
		else Log.trackEvent("TelemetryLogger", { message: "Attempted to create an instance when instance is already created." });
		return Log._instance;
	}
	static resetInstance() {
		Log._instance = null;
	}
	static async _sendMessage(actionName, ...args) {
		try {
			const result = await Log._getInstance()._powerOperationExecutor.execute(ServiceName, actionName, args);
			if (!result.success) console.error({
				message: `PowerDataRuntime.TelemetryLogger: Failed to send telemetry message.`,
				error: result.error,
				telemetryArgs: args
			});
		} catch (error) {
			console.error({
				message: `PowerDataRuntime.TelemetryLogger: Failed to send telemetry message.`,
				error,
				telemetryArgs: args
			});
		}
	}
	static trackEvent(eventName, eventData) {
		const serializedData = eventData ? Log._serializeErrors(eventData) : eventData;
		return Log._sendMessage("trackEvent", `PowerDataRuntime.${eventName}`, serializedData);
	}
	static trackException(exception) {
		return Log._sendMessage("trackException", exception);
	}
	static trackMetric(metricName, value) {
		return Log._sendMessage("trackMetric", `PowerDataRuntime.${metricName}`, value);
	}
	static startScenario(scenarioName) {
		return Log._sendMessage("startScenario", `PowerDataRuntime.${scenarioName}`);
	}
	static endScenario(scenarioName) {
		return Log._sendMessage("endScenario", `PowerDataRuntime.${scenarioName}`);
	}
	static setDefaultProperties(properties) {
		return Log._sendMessage("setDefaultProperties", properties);
	}
	static _getInstance() {
		if (!Log._instance) throw new Error("PowerDataRuntime.TelemetryLogger: Attempted to log telemetry prior to instantiation.");
		return Log._instance;
	}
	/**
	* Recursively serializes Error objects in an object to prevent empty object serialization
	* when passed through postMessage's structured clone algorithm.
	* @param obj - The object to process
	* @returns A new object with Error instances replaced by serializable objects
	*/
	static _serializeErrors(obj) {
		if (obj === null || obj === void 0) return obj;
		if (obj instanceof Error) return {
			errorMessage: obj.message,
			errorStack: obj.stack,
			errorType: obj.name
		};
		if (Array.isArray(obj)) return obj.map((item) => Log._serializeErrors(item));
		if (typeof obj === "object" && obj !== null && Object.getPrototypeOf(obj) === Object.prototype) {
			const serialized = {};
			for (const key in obj) if (Object.prototype.hasOwnProperty.call(obj, key)) serialized[key] = Log._serializeErrors(obj[key]);
			return serialized;
		}
		return obj;
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/common/types.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* HTTP methods supported by the client
* @private
*/
var HttpMethod;
(function(HttpMethod) {
	HttpMethod["GET"] = "GET";
	HttpMethod["POST"] = "POST";
	HttpMethod["PUT"] = "PUT";
	HttpMethod["DELETE"] = "DELETE";
	HttpMethod["PATCH"] = "PATCH";
})(HttpMethod || (HttpMethod = {}));
/**
* Supported data source types in the PowerDataRuntime
* @private
*/
var DataSources;
(function(DataSources) {
	/** Dataverse data source */
	DataSources["Dataverse"] = "Dataverse";
	/** Generic connector data source */
	DataSources["Connector"] = "Connector";
})(DataSources || (DataSources = {}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/codes.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Error types specific to DataRuntime
* @private
*/
var ErrorCodes;
(function(ErrorCodes) {
	ErrorCodes["InitializationFailed"] = "PDR_INIT_FAILED";
	ErrorCodes["InvalidXrmInfo"] = "INVALID_XRM_INFO";
	ErrorCodes["OperationsNotInitialized"] = "OPS_NOT_INITIALIZED";
	ErrorCodes["InvalidOperationExecutor"] = "INVALID_OPERATION_EXECUTOR";
	ErrorCodes["DataSourceNotFound"] = "CONNECTION_NOT_FOUND";
	ErrorCodes["DuplicateDataSource"] = "DUPLICATE_DATA_SOURCE";
	ErrorCodes["InitializationError"] = "RDSS_INIT_ERROR";
	ErrorCodes["InvalidDataSource"] = "INVALID_DATA_SOURCE";
	ErrorCodes["DataSourcesInfoNotFound"] = "DATA_SOURCES_INFO_NOT_FOUND";
	ErrorCodes["DataClientInitFailed"] = "DATA_CLIENT_INIT_FAILED";
	ErrorCodes["DataClientNotInitialized"] = "DATA_CLIENT_NOT_INITIALIZED";
	ErrorCodes["MetadataClientInitFailed"] = "METADATA_CLIENT_INIT_FAILED";
	ErrorCodes["MetadataClientNotInitialized"] = "METADATA_CLIENT_NOT_INITIALIZED";
	ErrorCodes["ClientProviderNotAvailable"] = "CLIENT_PROVIDER_NOT_AVAILABLE";
	ErrorCodes["ConnectionReferenceNotFound"] = "CONNECTION_REFERENCE_NOT_FOUND";
	ErrorCodes["DataClientNotAvailable"] = "DATA_CLIENT_NOT_AVAILABLE";
	ErrorCodes["DataSourceServiceNotAvailable"] = "DATA_SOURCE_SERVICE_NOT_AVAILABLE";
	ErrorCodes["MetadataClientNotAvailable"] = "METADATA_CLIENT_NOT_AVAILABLE";
	ErrorCodes["InvalidParameterValue"] = "INVALID_PARAMETER_VALUE";
	ErrorCodes["ConnectionConfigFetchFailed"] = "CONNECTION_CONFIG_FETCH_FAILED";
	ErrorCodes["DataSourceConfigFetchFailed"] = "DATA_SOURCE_CONFIG_FETCH_FAILED";
	ErrorCodes["InvalidMetadataResponse"] = "INVALID_METADATA_RESPONSE";
	ErrorCodes["TokenAcquisitionFailed"] = "TOKEN_ACQUISITION_FAILED";
})(ErrorCodes || (ErrorCodes = {}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/messages.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/** @private */
const UnknownErrorMessage = "An unknown error occurred";
/** @private */
const ErrorMessages = {
	[ErrorCodes.InitializationFailed]: "Failed to initialize PowerDataRuntime",
	[ErrorCodes.InvalidXrmInfo]: "Xrm info is required",
	[ErrorCodes.OperationsNotInitialized]: "PowerDataRuntime is not initialized",
	[ErrorCodes.DataSourceNotFound]: "Data source not found",
	[ErrorCodes.DuplicateDataSource]: "Duplicate data source",
	[ErrorCodes.InitializationError]: "Failed to initialize RuntimeDataSourceService",
	[ErrorCodes.InvalidDataSource]: "Invalid data source",
	[ErrorCodes.DataSourcesInfoNotFound]: "DataSourcesInfo must be provided to initialize the singleton instance.",
	[ErrorCodes.DataClientInitFailed]: "Failed to initialize PowerDataClient",
	[ErrorCodes.DataClientNotInitialized]: "PowerDataClient is not initialized",
	[ErrorCodes.MetadataClientInitFailed]: "Failed to initialize PowerMetadataClient",
	[ErrorCodes.MetadataClientNotInitialized]: "PowerMetadataClient is not initialized",
	[ErrorCodes.ClientProviderNotAvailable]: "Client provider is not available",
	[ErrorCodes.ConnectionReferenceNotFound]: "Connection reference not found",
	[ErrorCodes.DataClientNotAvailable]: "PowerDataClient is not available",
	[ErrorCodes.DataSourceServiceNotAvailable]: "Data source service is not available",
	[ErrorCodes.MetadataClientNotAvailable]: "PowerMetadataClient is not available",
	[ErrorCodes.InvalidParameterValue]: "Invalid parameter value",
	[ErrorCodes.ConnectionConfigFetchFailed]: "Failed to fetch connection configurations",
	[ErrorCodes.DataSourceConfigFetchFailed]: "Failed to fetch data source configurations",
	[ErrorCodes.InvalidMetadataResponse]: "Invalid metadata response format",
	[ErrorCodes.TokenAcquisitionFailed]: "Failed to acquire access token"
};
/** @private */
var DataOperationErrorMessages;
(function(DataOperationErrorMessages) {
	DataOperationErrorMessages["CreateFailed"] = "Create operation failure";
	DataOperationErrorMessages["DeleteFailed"] = "Delete operation failure";
	DataOperationErrorMessages["ExecuteFailed"] = "Execute operation failure";
	DataOperationErrorMessages["InvalidOperationParameters"] = "Invalid operation parameters";
	DataOperationErrorMessages["InvalidRequest"] = "Invalid request";
	DataOperationErrorMessages["InvalidResponse"] = "Invalid response format";
	DataOperationErrorMessages["MissingConnectorOperation"] = "Connector operation is required";
	DataOperationErrorMessages["MissingDataverseRequest"] = "Dataverse request is required";
	DataOperationErrorMessages["MissingOperationName"] = "Operation name is required";
	DataOperationErrorMessages["MissingRequestBody"] = "Request body is required";
	DataOperationErrorMessages["RetrieveFailed"] = "Retrieve operation failure";
	DataOperationErrorMessages["RetrieveMultipleFailed"] = "Retrieve multiple records operation failure";
	DataOperationErrorMessages["UpdateFailed"] = "Update operation failure";
	DataOperationErrorMessages["UploadFailed"] = "Upload operation failure";
	DataOperationErrorMessages["DownloadFailed"] = "Download operation failure";
	DataOperationErrorMessages["DeleteFileOrImageFailed"] = "Delete file or image operation failure";
	DataOperationErrorMessages["MissingFileData"] = "File data is required";
})(DataOperationErrorMessages || (DataOperationErrorMessages = {}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/types.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Base error class for PowerDataRuntime operations
* @private
*/
var PowerDataRuntimeError = class extends Error {
	code;
	/**
	* Creates an instance of PowerDataRuntimeError.
	* @param code - The error code associated with the error.
	* @param additionalInfo - Optional additional information to include in the error message.
	* @param messageOverride - Optional override for the default error message.
	*/
	constructor(code, additionalInfo, messageOverride) {
		let message = messageOverride || ErrorMessages[code] || "An unknown error occurred";
		if (additionalInfo) message += `: ${additionalInfo}`;
		super(message);
		this.code = code;
		this.name = "PowerDataRuntimeError";
		Log.trackException(this);
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/types/index.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/** @private */
function isOperationResult(result) {
	return result?.success !== void 0;
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/constants.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/** @private */
var HeaderNames;
(function(HeaderNames) {
	/**
	* The name of the header used to specify the request ID.
	*/
	HeaderNames["RequestId"] = "x-ms-client-request-id";
})(HeaderNames || (HeaderNames = {}));
/**
* Enum for DataverseDataOperation operation names.
* @private
*/
var DataverseOperationName;
(function(DataverseOperationName) {
	DataverseOperationName["CreateRecord"] = "dataverseDataOperation.createRecordAsync";
	DataverseOperationName["UpdateRecord"] = "dataverseDataOperation.updateRecordAsync";
	DataverseOperationName["UploadRecord"] = "dataverseDataOperation.uploadFileToRecord";
	DataverseOperationName["DownloadRecord"] = "dataverseDataOperation.downloadFileFromRecord";
	DataverseOperationName["DeleteRecord"] = "dataverseDataOperation.deleteRecordAsync";
	DataverseOperationName["DeleteFileOrImageRecord"] = "dataverseDataOperation.deleteFileOrImageFromRecord";
	DataverseOperationName["RetrieveRecord"] = "dataverseDataOperation.retrieveRecordAsync";
	DataverseOperationName["RetrieveMultipleRecords"] = "dataverseDataOperation.retrieveMultipleRecordsAsync";
	DataverseOperationName["ExecuteCustomApi"] = "dataverseDataOperation.executeCustomApi";
})(DataverseOperationName || (DataverseOperationName = {}));
/**
* Enum for ConnectorDataOperation operation names.
* @private
*/
var ConnectorOperationName;
(function(ConnectorOperationName) {
	ConnectorOperationName["CreateRecord"] = "connectorDataOperation.createRecordAsync";
	ConnectorOperationName["UpdateRecord"] = "connectorDataOperation.updateRecordAsync";
	ConnectorOperationName["DeleteRecord"] = "connectorDataOperation.deleteRecordAsync";
	ConnectorOperationName["RetrieveRecord"] = "connectorDataOperation.retrieveRecordAsync";
	ConnectorOperationName["RetrieveMultipleRecords"] = "connectorDataOperation.retrieveMultipleRecordsAsync";
})(ConnectorOperationName || (ConnectorOperationName = {}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/util.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Retrieves the error message from an error object.
* @param error - The error to handle, which can be an instance of Error or IOperationResult.
* @returns The error message if applicable, or throws the error if it's a PowerDataRuntimeError.
* @private
*/
function getErrorMessage(error) {
	if (typeof error === "string") return error;
	if (error instanceof Error || error instanceof PowerDataRuntimeError) return error.message || "An unknown error occurred";
	if (isOperationResult(error)) return error.error?.message || "An unknown error occurred";
	if (typeof error === "object") return JSON.stringify(error);
	return UnknownErrorMessage;
}
/**
* Handles operation errors and creates an error OperationResult
* @param error - The error object or OperationResult
* @param friendlyMessage - A friendly message to include in the error
* @private
*/
function createErrorResponse(error, friendlyMessage) {
	const message = getErrorMessage(error);
	let data;
	if (isOperationResult(error)) data = error.data;
	const errorData = /* @__PURE__ */ new Error(`${friendlyMessage}: ${message}`);
	if (error instanceof Error) errorData.stack = error.stack;
	return {
		success: false,
		error: errorData,
		data
	};
}
/**
* Parses an error from the HTTP plugin and returns a PowerDataRuntimeHttpError object.
* @param error - The error to parse, which should be an array with a nested array.
* @returns A PowerDataRuntimeHttpError object containing the message and response.
* @private
*/
function parseHttpPluginError(error) {
	let message = UnknownErrorMessage;
	let response;
	if (Array.isArray(error)) {
		if (Array.isArray(error[0])) {
			message = error[0][0] || "An unknown error occurred";
			response = error[0][2];
		}
	}
	const status = response?.status;
	const requestId = response?.headers?.[HeaderNames.RequestId];
	return {
		message,
		status,
		requestId
	};
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/error/error.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/data/defaultOperationOrchestrator.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* RuntimeDataOperations provides a unified interface for performing data operations
* across different data sources.
* @private
*/
var DefaultDataOperationOrchestrator = class {
	_dataverseOperation;
	_connectorOperation;
	_connectionsService;
	constructor(_dataverseOperation, _connectorOperation, _connectionsService) {
		this._dataverseOperation = _dataverseOperation;
		this._connectorOperation = _connectorOperation;
		this._connectionsService = _connectionsService;
	}
	/**
	* Creates a new record in the specified data source.
	* @param tableName - The name of the table.
	* @param data - The record data to create.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async createRecordAsync(tableName, data) {
		try {
			this._validateParams({
				tableName,
				data
			});
			return await (await this._getExecutor(tableName)).createRecordAsync(tableName, data);
		} catch (error) {
			return createErrorResponse(error, "Create record operation failed");
		}
	}
	/**
	* Updates an existing record in the specified data source.
	* @param tableName - The name of the table.
	* @param id - The ID of the record to update.
	* @param data - The updated record data.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async updateRecordAsync(tableName, id, data) {
		try {
			this._validateParams({
				tableName,
				id,
				data
			});
			return await (await this._getExecutor(tableName)).updateRecordAsync(tableName, id, data);
		} catch (error) {
			return createErrorResponse(error, "Update record operation failed");
		}
	}
	/**
	* Uploads data for an existing record in the specified data source.
	* @param tableName - The name of the table.
	* @param id - The ID of the record to upload data for.
	* @param columnName - The name of the file column to upload to.
	* @param fileName - The name of the file to upload (used for Dataverse file columns).
	* @param data - The data to upload.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async uploadFileToRecord(tableName, id, columnName, fileName, data) {
		try {
			this._validateParams({
				tableName,
				id,
				columnName,
				fileName,
				data
			});
			return await (await this._getExecutor(tableName)).uploadFileToRecord(tableName, id, columnName, fileName, data);
		} catch (error) {
			return createErrorResponse(error, "Upload record operation failed");
		}
	}
	/**
	* Downloads binary data from a file column in the specified data source.
	* @param tableName - The name of the table.
	* @param id - The ID of the record to download from.
	* @param columnName - The name of the file column to download from.
	* @returns A promise that resolves to the operation result with file contents as binary data (Uint8Array).
	* @throws DataOperationError if the operation fails.
	*/
	async downloadFileFromRecord(tableName, id, columnName) {
		try {
			this._validateParams({
				tableName,
				id,
				columnName
			});
			return await (await this._getExecutor(tableName)).downloadFileFromRecord(tableName, id, columnName);
		} catch (error) {
			return createErrorResponse(error, "Download record operation failed");
		}
	}
	/**
	* Downloads binary image data from an image column in the specified data source.
	* Only applicable to Dataverse data sources.
	* @param tableName - The logical name of the Dataverse table.
	* @param recordId - The ID of the record containing the image.
	* @param columnName - The name of the image column to download from.
	* @param fullSize - When true, requests the full-size image (`?size=full`). Defaults to false.
	* @returns A promise that resolves to the operation result with image contents as binary data (Uint8Array).
	*/
	async downloadImageFromRecord(tableName, recordId, columnName, fullSize) {
		try {
			this._validateParams({
				tableName,
				recordId,
				columnName
			});
			return await (await this._getExecutor(tableName)).downloadImageFromRecord(tableName, recordId, columnName, fullSize);
		} catch (error) {
			return createErrorResponse(error, "Download image operation failed");
		}
	}
	/**
	* Deletes the file or image data stored in a file/image column of an existing record.
	* Only applicable to Dataverse data sources.
	* @param tableName - The logical name of the Dataverse table.
	* @param recordId - The ID of the record containing the file or image.
	* @param columnName - The name of the file or image column whose data should be deleted.
	* @returns A promise that resolves to the operation result.
	*/
	async deleteFileOrImageFromRecord(tableName, recordId, columnName) {
		try {
			this._validateParams({
				tableName,
				recordId,
				columnName
			});
			return await (await this._getExecutor(tableName)).deleteFileOrImageFromRecord(tableName, recordId, columnName);
		} catch (error) {
			return createErrorResponse(error, "Delete file or image operation failed");
		}
	}
	/**
	* Deletes a record from the specified data source.
	* @param tableName - The name of the table.
	* @param id - The ID of the record to delete.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async deleteRecordAsync(tableName, id) {
		try {
			this._validateParams({
				tableName,
				id
			});
			return await (await this._getExecutor(tableName)).deleteRecordAsync(tableName, id);
		} catch (error) {
			return createErrorResponse(error, "Delete record operation failed");
		}
	}
	/**
	* Retrieves a record from the specified data source.
	* @param tableName - The name of the table.
	* @param id - The ID of the record to retrieve.
	* @param options - Optional operation options.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async retrieveRecordAsync(tableName, id, options) {
		try {
			this._validateParams({
				tableName,
				id
			});
			const executor = await this._getExecutor(tableName);
			this._validateOptions(options);
			return await executor.retrieveRecordAsync(tableName, id, options);
		} catch (error) {
			return createErrorResponse(error, "Retrieve record operation failed");
		}
	}
	/**
	* Retrieves multiple records from the specified data source.
	* @param tableName - The name of the table.
	* @param options - Optional operation options.
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async retrieveMultipleRecordsAsync(tableName, options) {
		try {
			this._validateParams({ tableName });
			const executor = await this._getExecutor(tableName);
			this._validateOptions(options);
			return await executor.retrieveMultipleRecordsAsync(tableName, options);
		} catch (error) {
			return createErrorResponse(error, "Retrieve multiple records operation failed");
		}
	}
	/**
	* Executes a data operation on the specified data source.
	* @param operation - The operation to execute
	* @returns A promise that resolves to the operation result.
	* @throws DataOperationError if the operation fails.
	*/
	async executeAsync(operation) {
		try {
			this._validateParams({ operation });
			return await (await this._getExecutor("", operation.connectorOperation ? DataSources.Connector : DataSources.Dataverse)).executeAsync(operation);
		} catch (error) {
			return createErrorResponse(error, "Execute operation failed");
		}
	}
	/**
	* Retrieves the appropriate executor based on the data source.
	* @param dataSource - The data source to retrieve the executor for.
	* @returns The corresponding executor instance.
	* @throws DataOperationError if the data source is invalid.
	* // TODO: Add Dataverse support
	*/
	async _getExecutor(tableName, dataSource) {
		switch (dataSource || (await this._connectionsService.getDataSource(tableName)).dataSourceType) {
			case DataSources.Dataverse: return this._dataverseOperation;
			case DataSources.Connector: return this._connectorOperation;
			default: return this._connectorOperation;
		}
	}
	/**
	* Validates the input parameters for data operations.
	* @param params - The parameters to validate.
	* @throws DataOperationError if validation fails.
	*/
	_validateParams(params) {
		for (const [key, value] of Object.entries(params)) if (!value) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: ${key} is required`);
	}
	/**
	* Validates the operation options.
	* @param options - The operation options to validate.
	* @throws Error if validation fails.
	*/
	_validateOptions(options) {
		if (!options) return;
		if (options.maxPageSize && typeof options.maxPageSize !== "number") throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: maxPageSize must be a number`);
		if (options.select) {
			if (!Array.isArray(options.select)) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: select must be an array of strings`);
			if (options.select.some((s) => typeof s !== "string" || s.trim() === "")) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: select must contain only non-empty strings`);
		}
		if (options.filter && typeof options.filter !== "string") throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: filter must be a string`);
		if (options.orderBy) {
			if (!Array.isArray(options.orderBy)) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: orderBy must be an array of strings`);
			if (options.orderBy.some((s) => typeof s !== "string" || s.trim() === "")) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: orderBy must contain only non-empty strings`);
		}
		if (options.top && typeof options.top !== "number") throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: top must be a number`);
		if (options.skip && typeof options.skip !== "number") throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: skip must be a number`);
		if (options.count && typeof options.count !== "boolean") throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: count must be a boolean`);
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/common/utils.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
function arrayBufferToBase64(buffer) {
	return window.btoa(convertArrayBufferToString(buffer));
}
function base64ToUint8Array(base64) {
	const binary = window.atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
function convertArrayBufferToString(buf) {
	if (buf.byteLength <= 65535) return String.fromCharCode(...new Uint8Array(buf));
	let binary = "";
	for (let i = 0, bytes = new Uint8Array(buf); i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
	return binary;
}
/**
* Strict encode: encodeURIComponent, but also encode ( and )
* @private
*/
function strictEncode(str) {
	return encodeURIComponent(str).replace(/\(/g, "%28").replace(/\)/g, "%29");
}
/**
* Extracts the Dataverse base URL and encoded path from a full Dataverse API URL.
* @param url - The full Dataverse API URL (should contain /api/data/v9.x/)
* @returns An object with baseUrl (up to /api/data/v9.x) and encodedPath (strict encoded path after /api/data/v9.x/)
* @private
*/
function extractDataverseUrlParts(url) {
	const baseUrlMatch = url.match(/^(https?:\/\/[^/]+\/api\/data\/v[\d.]+)/);
	const baseUrl = baseUrlMatch ? baseUrlMatch[1] : "";
	const pathMatch = url.match(/\/api\/data\/v[\d.]+\/(.+)$/);
	return {
		baseUrl,
		encodedPath: pathMatch ? strictEncode(pathMatch[1]) : ""
	};
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/data/executors/shared/stringQueryOptions.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Converts operation options to a query string format.
* @param options - The operation options to convert.
* @returns The formatted query string.
* @private
*/
function convertOptionsToQueryString(options) {
	if (!options) return "";
	const parts = [];
	if (options.select && options.select.length > 0) parts.push(`$select=${encodeURIComponent(options.select.map((s) => s.trim().replace(/%20/g, "+").replace(/'/g, "%27")).join(","))}`);
	if (options.filter) {
		const encodedFilter = encodeURIComponent(options.filter.trim()).replace(/%20/g, "+").replace(/'/g, "%27");
		parts.push(`$filter=${encodedFilter}`);
	}
	if (options.orderBy && options.orderBy.length > 0) parts.push(`$orderby=${encodeURIComponent(options.orderBy.map((s) => s.trim().replace(/%20/g, "+").replace(/'/g, "%27")).join(","))}`);
	if (options.top !== void 0 && options.top !== null) parts.push(`$top=${options.top}`);
	if (options.skip !== void 0 && options.skip !== null) parts.push(`$skip=${options.skip}`);
	if (options.count !== void 0 && options.count !== null) parts.push(`$count=${options.count}`);
	if (options.skipToken && options.skipToken.trim() !== "") parts.push(`$skiptoken=${encodeURIComponent(options.skipToken.trim())}`);
	return parts.length ? `?${parts.join("&")}` : "";
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/data/executors/connectorDataOperationExecutor.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
function normalizeSqlDatasetOverride(datasetNameOverride) {
	try {
		return decodeURIComponent(datasetNameOverride);
	} catch (error) {
		if (error instanceof URIError) return datasetNameOverride;
		throw error;
	}
}
/**
* ConnectorDataOperation provides functionality for performing CRUD operations
* against connector data sources using the Runtime Data Client.
* @private
*/
var ConnectorDataOperationExecutor = class {
	_clientProvider;
	_connectionsService;
	_databaseReferences;
	_connectionReferences;
	constructor(clientProvider, connectionsService) {
		this._validateConstructorParams(clientProvider, connectionsService);
		this._clientProvider = clientProvider;
		this._connectionsService = connectionsService;
	}
	/**
	* Creates a new record in the specified table
	*/
	async createRecordAsync(tableName, data) {
		try {
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const requestUrl = await this._buildTableUrl(tableName, connectionReference);
			return await dataClient.createDataAsync(requestUrl, connectionReference.apiId, tableName, data, { operationName: ConnectorOperationName.CreateRecord });
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.CreateFailed);
		}
	}
	/**
	* Updates an existing record in the specified table
	*/
	async updateRecordAsync(tableName, id, data) {
		try {
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const requestUrl = await this._buildTableUrl(tableName, connectionReference, `/${id}`);
			return await dataClient.updateDataAsync(requestUrl, connectionReference.apiId, tableName, data, { operationName: ConnectorOperationName.UpdateRecord });
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.UpdateFailed);
		}
	}
	/**
	* Uploads binary data to a file column in the specified table
	*/
	async uploadFileToRecord(tableName, id, columnName, fileName, data) {
		return createErrorResponse(/* @__PURE__ */ new Error(`uploadFileToRecord is not implemented for connector data sources, ${tableName}, ${columnName}, ${fileName}, ${id}, ${JSON.stringify(data)}`), DataOperationErrorMessages.UploadFailed);
	}
	/**
	* Downloads binary data from a file column — not supported for connector data sources
	*/
	async downloadFileFromRecord(tableName, id, columnName) {
		return createErrorResponse(/* @__PURE__ */ new Error(`downloadFileFromRecord is not implemented for connector data sources, ${tableName}, ${columnName}, ${id}`), DataOperationErrorMessages.DownloadFailed);
	}
	/**
	* Deletes a file or image from a column — not supported for connector data sources
	*/
	async deleteFileOrImageFromRecord(tableName, id, columnName) {
		return createErrorResponse(/* @__PURE__ */ new Error(`deleteFileOrImageFromRecord is not implemented for connector data sources, ${tableName}, ${id}, ${columnName}`), DataOperationErrorMessages.DeleteFileOrImageFailed);
	}
	/**
	* Downloads an image from an image column — not supported for connector data sources
	*/
	async downloadImageFromRecord(tableName, id, columnName, _fullSize) {
		return createErrorResponse(/* @__PURE__ */ new Error(`downloadImageFromRecord is not implemented for connector data sources, ${tableName}, ${id}, ${columnName}`), DataOperationErrorMessages.DownloadFailed);
	}
	/**
	* Deletes a record from the specified table
	*/
	async deleteRecordAsync(tableName, id) {
		try {
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const requestUrl = await this._buildTableUrl(tableName, connectionReference, `/${id}`);
			return await dataClient.deleteDataAsync(requestUrl, connectionReference.apiId, tableName, { operationName: ConnectorOperationName.DeleteRecord });
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.DeleteFailed);
		}
	}
	/**
	* Retrieves a single record from the specified table
	*/
	async retrieveRecordAsync(tableName, id, options) {
		try {
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const requestUrl = await this._buildTableUrl(tableName, connectionReference, `/${id}${convertOptionsToQueryString(options)}`);
			return await dataClient.retrieveDataAsync(requestUrl, connectionReference.apiId, tableName, HttpMethod.GET, void 0, { operationName: ConnectorOperationName.RetrieveRecord });
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.RetrieveFailed);
		}
	}
	/**
	* Retrieves multiple records from the specified table
	*/
	async retrieveMultipleRecordsAsync(tableName, options) {
		try {
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const requestUrl = await this._buildTableUrl(tableName, connectionReference, convertOptionsToQueryString(options), false);
			return await dataClient.retrieveDataAsync(requestUrl, connectionReference.apiId, tableName, HttpMethod.GET, void 0, { operationName: ConnectorOperationName.RetrieveMultipleRecords });
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.RetrieveMultipleFailed);
		}
	}
	/**
	* Executes a custom operation on the data source
	*/
	async executeAsync(operation) {
		try {
			if (!operation?.connectorOperation) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingConnectorOperation}`);
			const tableName = operation.connectorOperation.tableName;
			const dataSourceInfo = await this._connectionsService.getDataSource(tableName);
			const { dataClient, connectionReference } = await this._getClientsAndConnection(tableName);
			const config = await this._getOperationConfig(operation, connectionReference, tableName);
			const requestUrl = await this._buildOperationUrl(operation, config);
			const bodyParam = await this._buildOperationBody(operation, tableName);
			const headers = await this._buildOperationHeader(operation, tableName);
			const resolvedHeaders = bodyParam instanceof Uint8Array ? {
				...headers ?? {},
				"Content-Type": "application/octet-stream"
			} : headers;
			const httpMethod = this._getHttpMethod(dataSourceInfo, operation.connectorOperation.operationName);
			const responseInfo = dataSourceInfo.apis[operation.connectorOperation.operationName]?.responseInfo;
			return await dataClient.retrieveDataAsync(requestUrl, config.apiId, tableName, httpMethod, resolvedHeaders, bodyParam, {
				isExecuteAsync: true,
				operationName: `connectorDataOperation.${operation.connectorOperation.operationName}`,
				responseInfo
			});
		} catch (error) {
			return createErrorResponse(error, DataOperationErrorMessages.ExecuteFailed);
		}
	}
	/**
	* Determines the appropriate HTTP method for a request.
	*
	* The declared method is authoritative and must never be inferred from the runtime URL, which
	* identifies the connector rather than the operation. Codegen declares POST for stored
	* procedures, so they need no special case here.
	*
	* @param dataSourceInfo - The data source information
	* @param operation - The operation name
	* @returns The HTTP method to use
	*/
	_getHttpMethod(dataSourceInfo, operation) {
		const method = dataSourceInfo.apis[operation]?.method;
		if (method) return method;
		return HttpMethod.GET;
	}
	/**
	* Builds the operation body parameters
	*/
	async _buildOperationBody(operation, tableName) {
		const operationName = operation?.connectorOperation?.operationName;
		if (operationName) {
			if ((await this._connectionsService.getDataSource(tableName))?.apis?.[operationName]?.parameters?.some((param) => param.in === "body")) return await this._buildOperationBodyParam(operation, tableName);
		}
	}
	/**
	* Builds operation body parameters from the operation and data source info
	*/
	async _buildOperationBodyParam(operation, tableName) {
		const operationName = operation.connectorOperation?.operationName;
		if (!operationName) return "{}";
		const apiParams = (await this._connectionsService.getDataSource(tableName))?.apis?.[operationName]?.parameters || [];
		const rawParams = operation.connectorOperation?.parameters || [];
		if (typeof rawParams !== "object" || rawParams === null) return "{}";
		const bodyParam = apiParams.find((param) => param.in === "body");
		if (bodyParam) {
			const value = rawParams[bodyParam.name];
			if (value !== void 0 && value !== null) {
				if (bodyParam.format === "binary" && typeof value === "string") return base64ToUint8Array(value);
				return JSON.stringify(value);
			}
		}
		return "{}";
	}
	/**
	* Builds the operation header for a given data operation if required.
	*
	* @template TRequest - The type of the request payload for the data operation.
	* @param dataOperationRequest - The data operation containing details about the connector operation.
	* @param tableName - The name of the table associated with the data operation.
	* @returns A promise that resolves to the operation header as a string if a header parameter is required,
	*          or `undefined` if no header parameter is needed.
	*/
	async _buildOperationHeader(dataOperationRequest, tableName) {
		const operationName = dataOperationRequest.connectorOperation?.operationName;
		if (operationName) {
			if ((await this._connectionsService.getDataSource(tableName))?.apis?.[operationName]?.parameters?.some((param) => param.in === "header")) return await this._buildOperationHeaderParam(dataOperationRequest, tableName);
		}
	}
	/**
	* Builds the operation header parameters as a JSON string for a given data operation.
	*
	* @template TRequest - The type of the request object for the data operation.
	* @param dataOperationRequest - The data operation containing connector operation details and parameters.
	* @param tableName - The name of the table associated with the data operation.
	* @returns A promise that resolves to a JSON string representing the header parameters,
	*          or `undefined` if no `header` parameters are available.
	*/
	async _buildOperationHeaderParam(dataOperationRequest, tableName) {
		const operationName = dataOperationRequest.connectorOperation?.operationName;
		if (!operationName) return {};
		const apiParamSpec = (await this._connectionsService.getDataSource(tableName))?.apis?.[operationName]?.parameters || [];
		const inputParams = dataOperationRequest.connectorOperation?.parameters;
		const headers = {};
		if (!inputParams) return;
		if (typeof inputParams === "string") {
			if (apiParamSpec.length === 1 && apiParamSpec[0].in === "header") headers[apiParamSpec[0].name] = inputParams;
		}
		if (typeof inputParams === "object" && !Array.isArray(inputParams)) apiParamSpec.forEach((param) => {
			const headerValue = inputParams[param.name];
			if (param.in === "header" && headerValue !== void 0) headers[param.name] = headerValue;
		});
		if (Array.isArray(inputParams)) apiParamSpec.forEach((param, index) => {
			if (param.in === "header" && inputParams[index] !== void 0) headers[param.name] = inputParams[index];
		});
		return headers;
	}
	/**
	* Constructs the request URL for table operations
	* @param tableName - The name of the table
	* @param connectionReference - The connection reference
	* @param options - Optional URL parameters
	* @param encodeOptions - Whether to encode the options
	* @returns The constructed URL
	*/
	async _buildTableUrl(tableName, connectionReference, options = "", encodeOptions = true) {
		const dataSourceInfo = await this._connectionsService.getDataSource(tableName);
		const isSharedSql = (connectionReference.apiId ?? "").indexOf("shared_sql") > -1;
		const isSharePoint = (connectionReference.apiId ?? "").indexOf("shared_sharepointonline") > -1;
		const datasetNameOverride = connectionReference.datasetNameOverride?.trim();
		const datasetName = datasetNameOverride || connectionReference.datasetName || "";
		const normalizedDatasetName = isSharedSql && datasetNameOverride ? normalizeSqlDatasetOverride(datasetNameOverride) : datasetName;
		const rawTableId = connectionReference.tableNameOverride?.trim() || dataSourceInfo.tableId;
		const urlBuilder = {
			runtimeUrl: connectionReference.runtimeUrl ?? "",
			connectionName: connectionReference.connectionName ?? "",
			datasetName: isSharePoint ? encodeURIComponent(encodeURIComponent(datasetName)) : encodeURIComponent(normalizedDatasetName),
			tableId: encodeURIComponent(rawTableId),
			version: dataSourceInfo.version,
			isSharedSql
		};
		return this._constructUrl(urlBuilder, options, encodeOptions);
	}
	/**
	* Builds the operation URL
	*/
	async _buildOperationUrl(operation, config) {
		const operationName = operation.connectorOperation?.operationName;
		if (!operationName) throw new Error(`${DataOperationErrorMessages.InvalidOperationParameters}: ${DataOperationErrorMessages.MissingOperationName}`);
		const dataSourceInfo = await this._connectionsService.getDataSource(config.tableName);
		const isSharedSql = (config.apiId ?? "").indexOf("shared_sql") > -1;
		const api = dataSourceInfo.apis[operationName];
		const path = api.path;
		const hasPathParameters = api.parameters.some((parameter) => parameter.in === "path");
		if (isSharedSql && !hasPathParameters) return this._buildSharedSqlOperationUrl(config, path);
		return this._buildStandardOperationUrl(operation, config, operationName, path);
	}
	/**
	* Gets the connection references
	*/
	async _getConnectionReferencesAsync() {
		if (this._connectionReferences) return this._connectionReferences;
		const response = await (await this._getMetadataClient()).getAppConnectionConfigsAsync();
		this._connectionReferences = response.data;
		return this._connectionReferences;
	}
	/**
	* Gets the database references
	*/
	async _getDatabaseReferencesAsync() {
		if (this._databaseReferences) return this._databaseReferences;
		const response = await (await this._getMetadataClient()).getAppDataSourceConfigsAsync();
		this._databaseReferences = response.data;
		return this._databaseReferences;
	}
	/**
	* Gets the metadata client instance
	*/
	async _getMetadataClient() {
		const metadataClient = await this._clientProvider.getMetadataClientAsync();
		if (!metadataClient) throw new PowerDataRuntimeError(ErrorCodes.MetadataClientNotAvailable);
		return metadataClient;
	}
	/**
	* Gets the connection reference for a table
	*/
	_getConnectionReference(tableName) {
		const connectionReference = this._connectionReferences?.[tableName];
		if (!connectionReference) throw new PowerDataRuntimeError(ErrorCodes.ConnectionReferenceNotFound, tableName);
		return connectionReference;
	}
	/**
	* Gets both the data client and connection reference
	*/
	async _getClientsAndConnection(tableName) {
		await this._getReferences();
		const dataClient = await this._clientProvider.getDataClientAsync();
		if (!dataClient) throw new PowerDataRuntimeError(ErrorCodes.DataClientNotAvailable);
		return {
			dataClient,
			connectionReference: this._getConnectionReference(tableName)
		};
	}
	/**
	* Joins a runtimeUrl with a following path segment using a single `/` separator,
	* tolerating either a trailing `/` on the URL or a leading `/` on the segment.
	* The RP returns some runtimeUrls with a trailing slash; without normalization
	* we emit `…/connections//<id>/…`.
	*/
	_joinRuntimeUrl(runtimeUrl, segment) {
		return `${runtimeUrl.endsWith("/") ? runtimeUrl.slice(0, -1) : runtimeUrl}/${segment.startsWith("/") ? segment.slice(1) : segment}`;
	}
	/**
	* Builds the URL for shared SQL operations
	*/
	_buildSharedSqlOperationUrl(config, path) {
		const version = config.version ? `/${config.version}/` : "/";
		return `${config.runtimeUrl}/${config.connectionName}${version}datasets/${config.datasetName}/procedures${path}`;
	}
	/**
	* Builds the URL for standard operations
	* Assumptions / Invariants:
	*  - The connector always defines a required path parameter for the connection id named 'connectionId'.
	*  - When a dataset is applicable, the parameter name is 'dataset'.
	*  - When a table is applicable, the parameter name is 'tableName'.
	*  - A lone string parameter maps to the first remaining (non-synthetic) required API parameter.
	*  - Array parameters map positionally to the remaining API parameters after filtering.
	*  - Object parameters map by (case-insensitive, hyphen/underscore agnostic) key.
	* @param operation - The data operation containing connector operation details from runtime
	* @param config - The connector operation configuration
	* @param operationName - The name of the operation to be performed
	* @param path - The path template for the operation
	*/
	async _buildStandardOperationUrl(operation, config, operationName, path) {
		const dataSourceInfo = await this._connectionsService.getDataSource(config.tableName);
		let apiParams = dataSourceInfo.apis[operationName]?.parameters || [];
		if (apiParams.length > 0) apiParams = apiParams.filter((param) => param.name !== "connectionId" && param.name !== "dataset" && param.name !== "tableName");
		const operationParams = operation.connectorOperation?.parameters;
		const rawParamValues = {
			connectionId: config.connectionName,
			dataset: config.apiId.indexOf("shared_sharepointonline") !== -1 && config.datasetName ? encodeURIComponent(config.datasetName) : config.datasetName,
			tableName: config.tableId
		};
		if (operationParams !== void 0) {
			if (typeof operationParams === "string") {
				if (apiParams.length > 0) {
					const requiredParams = apiParams.filter((param) => param.required);
					rawParamValues[requiredParams?.[0]?.name ?? apiParams[0].name] = operationParams;
				}
			} else if (typeof operationParams === "object" && !Array.isArray(operationParams)) {
				apiParams.forEach((param) => {
					if (operationParams) {
						const value = this._getNormalizedParamValue(operationParams, param.name);
						if (value !== void 0) rawParamValues[param.name] = value;
					}
				});
				const datasetOverride = this._getNormalizedParamValue(operationParams, "dataset");
				if (datasetOverride !== void 0) rawParamValues["dataset"] = config.apiId.indexOf("shared_sharepointonline") !== -1 ? encodeURIComponent(datasetOverride) : datasetOverride;
				const tableNameOverride = this._getNormalizedParamValue(operationParams, "tableName");
				if (tableNameOverride !== void 0) rawParamValues["tableName"] = tableNameOverride;
			} else if (Array.isArray(operationParams)) apiParams.forEach((param, index) => {
				rawParamValues[param.name] = operationParams[index];
			});
		}
		const { processedPath, queryParams } = this._processParameters(dataSourceInfo.apis[operationName]?.parameters || [], rawParamValues, path);
		const separator = queryParams ? processedPath.includes("?") ? "&" : "?" : "";
		return `${this._joinRuntimeUrl(config.runtimeUrl, processedPath)}${separator}${queryParams}`;
	}
	/**
	* Normalizes the parameter name by replacing hyphens with underscores and performs case-insensitive matching
	*/
	_getNormalizedParamValue(obj, paramName) {
		const normalizedParamName = paramName.replace(/-/g, "_").toLowerCase();
		const foundKey = Object.keys(obj).find((key) => key.replace(/-/g, "_").toLowerCase() === normalizedParamName);
		return foundKey !== void 0 ? obj[foundKey] : void 0;
	}
	/**
	* Processes operation parameters into path and query parameters
	* @param apiParams - The API parameter specifications from the data source info
	* @param rawParamValues - The raw parameter values provided in the operation at runtime
	* @param path - The initial path template
	* @returns An object containing the processed path and query parameters
	*/
	_processParameters(apiParams, rawParamValues, path) {
		const usedParams = /* @__PURE__ */ new Set();
		let processedPath = path;
		const queryParams = [];
		apiParams.forEach((param, _index) => {
			const paramValue = rawParamValues[param.name];
			if (paramValue === void 0) return;
			if (param.in === "path") {
				const placeholder = `{${param.name}}`;
				if (processedPath.includes(placeholder)) {
					processedPath = processedPath.replace(placeholder, encodeURIComponent(String(paramValue)));
					usedParams.add(param.name);
				}
			} else if (param.in === "query") {
				queryParams.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(String(paramValue))}`);
				usedParams.add(param.name);
			}
		});
		return {
			processedPath,
			queryParams: queryParams.join("&")
		};
	}
	/**
	* Gets the operation configuration
	*/
	async _getOperationConfig(operation, connectionReference, tableName) {
		if (!operation.connectorOperation) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingConnectorOperation}`);
		const dataSourceInfo = await this._connectionsService.getDataSource(tableName);
		return {
			tableName,
			apiId: connectionReference.apiId ?? "",
			runtimeUrl: connectionReference.runtimeUrl ?? "",
			connectionName: connectionReference.connectionName ?? "",
			datasetName: connectionReference.datasetNameOverride?.trim() || connectionReference.datasetName || "",
			tableId: connectionReference.tableNameOverride?.trim() || dataSourceInfo.tableId,
			version: dataSourceInfo.version
		};
	}
	/**
	* Initializes the clients
	*/
	async _getReferences() {
		await this._getConnectionReferencesAsync();
		await this._getDatabaseReferencesAsync();
	}
	/**
	* Validates constructor parameters
	*/
	_validateConstructorParams(clientProvider, connectionsService) {
		if (!clientProvider) throw new PowerDataRuntimeError(ErrorCodes.ClientProviderNotAvailable);
		if (!connectionsService) throw new PowerDataRuntimeError(ErrorCodes.DataSourceServiceNotAvailable);
	}
	/**
	* Constructs the final URL
	*/
	_constructUrl(urlBuilder, options = "", encodeOptions = true) {
		const apiVersion = urlBuilder.version ? `/${urlBuilder.version}/` : "/";
		const encodedOptions = encodeOptions && options ? options.charAt(0) + encodeURIComponent(options.slice(1)) : options;
		if (urlBuilder.datasetName) return `${urlBuilder.runtimeUrl}/${urlBuilder.connectionName}${apiVersion}datasets/${urlBuilder.datasetName}/tables/${urlBuilder.tableId}/items${encodedOptions}`;
		return `${urlBuilder.runtimeUrl}/${urlBuilder.connectionName}/tables/${urlBuilder.tableId}/items${encodedOptions}`;
	}
};
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/** @private */
const ODATA_NEXT_LINK = "@odata.nextLink";
/**
* DataverseDataOperation provides functionality for performing CRUD operations
* against the Dataverse data source using the XRM WebApi or runtime metadata client.
* @private
*/
var DataverseDataOperationExecutor = class {
	_clientProvider;
	_dataSourceService;
	_databaseReferences;
	constructor(clientProvider, dataSourceService) {
		this._clientProvider = clientProvider;
		this._dataSourceService = dataSourceService;
	}
	/**
	* Creates a new record in Dataverse
	* @param tableName - The name of the table
	* @param data - The record data to create
	* @returns Promise resolving to operation result
	*/
	async createRecordAsync(tableName, data) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.createDataAsync(requestUrl, DataSources.Dataverse, tableName, data, {
				operationName: DataverseOperationName.CreateRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.CreateFailed);
	}
	/**
	* Updates an existing record in Dataverse
	* @param tableName - The name of the table
	* @param id - The record identifier
	* @param data - The updated record data
	* @returns Promise resolving to operation result
	*/
	async updateRecordAsync(tableName, id, data) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${id})`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.updateDataAsync(requestUrl, DataSources.Dataverse, tableName, data, {
				operationName: DataverseOperationName.UpdateRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.UpdateFailed);
	}
	/**
	* Uploads a record with binary data to Dataverse
	* @param tableName - The name of the table
	* @param id - The record identifier
	* @param columnName - The name of the file column
	* @param fileName - The name of the file (used for Dataverse file columns)
	* @param data - The binary data to upload
	* @returns Promise resolving to operation result
	*/
	async uploadFileToRecord(tableName, id, columnName, fileName, data) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${id})/${columnName}`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.uploadDataAsync(requestUrl, DataSources.Dataverse, tableName, data, {
				operationName: DataverseOperationName.UploadRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true,
				fileName
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.UploadFailed);
	}
	/**
	* Downloads binary data from a file column in Dataverse
	* @param tableName - The name of the table
	* @param id - The record identifier
	* @param columnName - The name of the file column
	* @returns Promise resolving to operation result with file contents as binary data (Uint8Array)
	*/
	async downloadFileFromRecord(tableName, id, columnName) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${id})/${columnName}/$value`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.retrieveDataAsync(requestUrl, DataSources.Dataverse, tableName, HttpMethod.GET, { Accept: "application/octet-stream" }, void 0, {
				operationName: DataverseOperationName.DownloadRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true,
				skipBatch: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error,
				fileName: dataverseResponse.fileName
			};
		}, DataOperationErrorMessages.DownloadFailed);
	}
	/**
	* Downloads an image from a Dataverse image column via the Web API $value endpoint.
	* @param tableName - The logical name of the Dataverse table.
	* @param recordId - The identifier of the record.
	* @param columnName - The name of the image column.
	*/
	async downloadImageFromRecord(tableName, recordId, columnName, fullSize = false) {
		const urlSuffix = `(${recordId})/${columnName}/$value${fullSize ? "?size=full" : ""}`;
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, urlSuffix), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.retrieveDataAsync(requestUrl, DataSources.Dataverse, tableName, HttpMethod.GET, { Accept: "application/octet-stream" }, void 0, {
				operationName: DataverseOperationName.DownloadRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true,
				skipBatch: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error,
				fileName: deriveImageFileName(columnName, dataverseResponse.data)
			};
		}, DataOperationErrorMessages.DownloadFailed);
	}
	/**
	* Deletes a record from Dataverse
	* @param tableName - The name of the table
	* @param id - The record identifier
	* @returns Promise resolving to operation result
	*/
	async deleteRecordAsync(tableName, id) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${id})`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.deleteDataAsync(requestUrl, DataSources.Dataverse, tableName, {
				operationName: DataverseOperationName.DeleteRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.DeleteFailed);
	}
	/**
	* Deletes the file or image data stored in a file/image column of an existing record.
	* Sends a DELETE request to `/<tableName>(<recordId>)/<columnName>`.
	* Only applicable to Dataverse data sources.
	* @param tableName - The logical name of the Dataverse table.
	* @param recordId - The identifier of the record.
	* @param columnName - The name of the file or image column whose data should be deleted.
	*/
	async deleteFileOrImageFromRecord(tableName, recordId, columnName) {
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${recordId})/${columnName}`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.deleteDataAsync(requestUrl, DataSources.Dataverse, tableName, {
				operationName: DataverseOperationName.DeleteFileOrImageRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.DeleteFileOrImageFailed);
	}
	/**
	* Retrieves a single record from Dataverse
	* @param tableName - The name of the table
	* @param id - The record identifier
	* @param options - The retrieval options
	* @returns Promise resolving to operation result
	*/
	async retrieveRecordAsync(tableName, id, options) {
		const { maxPageSize = 500, ...rest } = options || {};
		const optionsString = convertOptionsToQueryString(rest);
		const headers = { Prefer: `odata.maxpagesize=${maxPageSize},odata.include-annotations=*` };
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, `(${id})${optionsString}`), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.retrieveDataAsync(requestUrl, DataSources.Dataverse, tableName, HttpMethod.GET, headers, void 0, {
				operationName: DataverseOperationName.RetrieveRecord,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse.data,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.RetrieveFailed);
	}
	/**
	* Retrieves multiple records from Dataverse
	* @param tableName - The name of the table
	* @param options - The retrieval options
	* @param maxPageSize - Optional maximum page size
	* @returns Promise resolving to operation result
	*/
	async retrieveMultipleRecordsAsync(tableName, options) {
		const { maxPageSize = 500, ...rest } = options || {};
		const optionsString = convertOptionsToQueryString(rest);
		const headers = { Prefer: `odata.maxpagesize=${maxPageSize},odata.include-annotations=*` };
		return this._executeNativeDataverseOperation(tableName, (dataSourceInfo, tblName) => this._getDataverseRequestUrl(dataSourceInfo, tblName, optionsString), async (dataClient, requestUrl, dataSourceInfo) => {
			const dataverseResponse = await dataClient.retrieveDataAsync(requestUrl, DataSources.Dataverse, tableName, HttpMethod.GET, headers, void 0, {
				operationName: DataverseOperationName.RetrieveMultipleRecords,
				datasetName: dataSourceInfo.datasetName,
				isDataVerseOperation: true
			});
			return {
				success: dataverseResponse.success,
				data: dataverseResponse?.data?.value || [],
				skipToken: extractSkipToken(dataverseResponse?.data?.[ODATA_NEXT_LINK]),
				count: options?.count ? dataverseResponse?.data?.["@odata.count"] ?? dataverseResponse?.data?.["@Microsoft.Dynamics.CRM.totalrecordcount"] : void 0,
				error: dataverseResponse.error
			};
		}, DataOperationErrorMessages.RetrieveMultipleFailed);
	}
	/**
	* Executes a custom Dataverse operation
	* @param operation - The operation to execute
	* @returns Promise resolving to operation result
	*/
	async executeAsync(operation) {
		const { dataverseRequest } = operation;
		if (!dataverseRequest) return {
			success: false,
			data: null,
			error: { message: "Dataverse request details are required for Dataverse operations." }
		};
		const { action, parameters } = dataverseRequest;
		switch (action) {
			case "getEntityMetadata": {
				const { tableName, options } = parameters;
				if (!tableName) return {
					success: false,
					data: null,
					error: { message: "Table name is required for getEntityMetadata action." }
				};
				return this._getEntityMetadata(tableName, options ?? {});
			}
			case "customapi": {
				const { operationName, tableName, body } = parameters;
				const apiDef = (await this._dataSourceService.getDataSource(tableName)).apis[operationName];
				if (!apiDef) return {
					success: false,
					data: null,
					error: { message: `Operation '${operationName}' not found in data source '${tableName}'.` }
				};
				const dvInfo = await this._getDefaultDataverseEnvironmentInfo();
				const instanceUrl = this._getInstanceUrl(dvInfo);
				const bodyRecord = body ?? {};
				let resolvedPath = apiDef.path;
				const requestBody = {};
				const functionParams = [];
				const aliasParams = [];
				for (const param of apiDef.parameters) if (param.in === "path") {
					const pathValue = String(bodyRecord[param.name] ?? "");
					if (param.format === "dataverse-entity-set-name" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(pathValue)) return {
						success: false,
						data: null,
						error: { message: `Invalid Dataverse entity set name: "${pathValue}".` }
					};
					resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(pathValue));
				} else if (param.in === "body") {
					if (param.name in bodyRecord) requestBody[param.name] = bodyRecord[param.name];
				} else if (param.in === "query") {
					if (param.name in bodyRecord) {
						const literal = toODataLiteral(bodyRecord[param.name], param.type, param.format);
						const alias = `@p${aliasParams.length + 1}`;
						functionParams.push(`${param.name}=${alias}`);
						aliasParams.push(`${alias}=${encodeURIComponent(literal)}`);
					}
				}
				if (functionParams.length > 0) {
					const queryIndex = resolvedPath.indexOf("?");
					const callSegment = `(${functionParams.join(",")})`;
					resolvedPath = queryIndex === -1 ? resolvedPath + callSegment : resolvedPath.slice(0, queryIndex) + callSegment + resolvedPath.slice(queryIndex);
				}
				let requestUrl = `${instanceUrl}${resolvedPath.startsWith("/") ? resolvedPath.slice(1) : resolvedPath}`;
				if (aliasParams.length > 0) {
					const separator = requestUrl.includes("?") ? "&" : "?";
					requestUrl += `${separator}${aliasParams.join("&")}`;
				}
				const dataClient = await this._getDataClient();
				const response = apiDef.method.toUpperCase() === HttpMethod.GET ? await dataClient.retrieveDataAsync(requestUrl, DataSources.Dataverse, operationName, HttpMethod.GET, void 0, void 0, {
					operationName: DataverseOperationName.ExecuteCustomApi,
					datasetName: dvInfo.datasetName,
					isDataVerseOperation: true
				}) : await dataClient.createDataAsync(requestUrl, DataSources.Dataverse, operationName, requestBody, {
					operationName: DataverseOperationName.ExecuteCustomApi,
					datasetName: dvInfo.datasetName,
					isDataVerseOperation: true
				});
				return {
					success: response.success,
					data: response.data,
					error: response.error
				};
			}
			default:
				Log.trackEvent("DataverseDataOperation.UnsupportedAction", { message: `Unsupported Dataverse action: ${action}` });
				return {
					success: false,
					data: null,
					error: { message: `Unsupported Dataverse action: "${action}"` }
				};
		}
	}
	async _getEntityMetadata(tableName, options) {
		const client = await this._getDataClient();
		const dataSourceInfo = await this._getDataverseDataSourceInfo(tableName);
		const url = this._generateMetadataRequestUrl(dataSourceInfo, options);
		return client.retrieveDataAsync(url, DataSources.Dataverse, "EntityDefinitions", HttpMethod.GET, { Consistency: "Strong" }, void 0, {
			operationName: DataverseOperationName.RetrieveRecord,
			datasetName: dataSourceInfo.datasetName,
			isDataVerseOperation: true
		});
	}
	/**
	* Returns the database references for Dataverse, grouped by environment/database.
	* These come from the launch app response via runtime metadata client.
	*/
	async getDatabaseReferences() {
		if (this._databaseReferences) return this._databaseReferences;
		const runtimeDatabaseReferences = await this._loadDatabaseReferencesFromRuntime();
		if (runtimeDatabaseReferences && Object.keys(runtimeDatabaseReferences).length > 0) {
			this._databaseReferences = runtimeDatabaseReferences;
			return this._databaseReferences;
		}
		throw new PowerDataRuntimeError(ErrorCodes.DataSourceNotFound, "Failed to load Dataverse database references from runtime.");
	}
	/**
	* Loads database references from runtime metadata client (launch app response).
	*/
	async _loadDatabaseReferencesFromRuntime() {
		try {
			const response = await (await this._getMetadataClient()).getAppDataSourceConfigsAsync();
			if (!response.success || !response.data) return;
			const cdsDataSources = Object.values(response.data);
			if (cdsDataSources.length === 0) return;
			const databaseReferences = {};
			for (const cdsDataSource of cdsDataSources) {
				const cdsConfig = cdsDataSource;
				const instanceUrl = this._extractInstanceUrlFromRuntimeUrl(cdsConfig.runtimeUrl);
				const envName = "default.cds";
				if (!databaseReferences[envName]) databaseReferences[envName] = {
					databaseDetails: {
						referenceType: "Environmental",
						environmentName: envName,
						overrideValues: {
							status: "NotSpecified",
							environmentVariableName: ""
						},
						linkedEnvironmentMetadata: {
							resourceId: "",
							friendlyName: "",
							uniqueName: "",
							domainName: "",
							version: cdsConfig.version || "9.2",
							instanceUrl,
							instanceApiUrl: cdsConfig.runtimeUrl,
							baseLanguage: 1033,
							instanceState: "Ready",
							createdTime: "",
							platformSku: ""
						}
					},
					dataSources: {}
				};
				const dataSourceName = cdsConfig.entitySetName || cdsConfig.logicalName;
				databaseReferences[envName].dataSources[dataSourceName] = {
					entitySetName: cdsConfig.entitySetName,
					logicalName: cdsConfig.logicalName,
					isHidden: false
				};
			}
			return databaseReferences;
		} catch (error) {
			Log.trackEvent("DataverseDataOperation.FailedToLoadDatabaseReferences", {
				message: "[DataverseDataOperation] Failed to load database references from runtime",
				error
			});
			return;
		}
	}
	_extractInstanceUrlFromRuntimeUrl(runtimeUrl) {
		try {
			const matches = runtimeUrl.match(/^(https?:\/\/[^/]+)/);
			return matches ? matches[1] : runtimeUrl;
		} catch (error) {
			Log.trackEvent("DataverseDataOperation.FailedToExtractInstanceUrl", {
				message: "[DataverseDataOperation] Failed to extract instance URL from runtime URL",
				error
			});
			return runtimeUrl;
		}
	}
	/**
	* Helper to get a native data client and database reference
	*/
	async _getDataClient() {
		const dataClient = await this._clientProvider.getDataClientAsync();
		if (!dataClient) {
			Log.trackEvent("DataverseDataOperation.DataClientNotAvailable", { message: "[DataverseDataOperation] Data client is not available" });
			throw new PowerDataRuntimeError(ErrorCodes.DataClientNotAvailable, "Data client is not available.");
		}
		return dataClient;
	}
	/**
	* Gets the metadata client instance
	*/
	async _getMetadataClient() {
		const metadataClient = await this._clientProvider.getMetadataClientAsync();
		if (!metadataClient) {
			Log.trackEvent("DataverseDataOperation.MetadataClientNotAvailable", { message: "[DataverseDataOperation] Metadata client is not available" });
			throw new PowerDataRuntimeError(ErrorCodes.MetadataClientNotAvailable);
		}
		return metadataClient;
	}
	/**
	* Template method for connector-style CRUD operations to reduce duplication.
	* Handles client, dataSourceInfo, requestUrl, and error handling.
	*/
	async _executeNativeDataverseOperation(tableName, buildUrl, operation, errorMessage) {
		try {
			const dataClient = await this._getDataClient();
			const dataSourceInfo = await this._getDataverseDataSourceInfo(tableName);
			return operation(dataClient, buildUrl(dataSourceInfo, tableName), dataSourceInfo);
		} catch (error) {
			return createErrorResponse(error, errorMessage);
		}
	}
	/**
	* Helper to get the Dataverse datasourceinfo from databaseReferences
	*/
	async _getDataverseDataSourceInfo(tableName) {
		let dbRefs;
		try {
			dbRefs = await this.getDatabaseReferences();
		} catch (error) {
			Log.trackEvent("DataverseDataOperation.GetDataSourceInfoFailed", {
				message: "[DataverseDataOperation] Failed to get database references",
				tableName,
				error
			});
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new PowerDataRuntimeError(ErrorCodes.DataSourceNotFound, `Failed to get Dataverse data source info for table '${tableName}': ${errorMessage}`);
		}
		for (const dbKey of Object.keys(dbRefs)) {
			const db = dbRefs[dbKey];
			if (db.dataSources[tableName]) {
				const ds = db.dataSources[tableName];
				return {
					datasetName: db.databaseDetails?.environmentName,
					referenceType: db.databaseDetails?.referenceType,
					linkedEnvironmentMetadata: db.databaseDetails?.linkedEnvironmentMetadata,
					entitySetName: ds?.entitySetName,
					logicalName: ds?.logicalName,
					isHidden: ds?.isHidden,
					tableId: ds?.logicalName,
					apis: {}
				};
			}
		}
		const notFoundMsg = `No Dataverse data source found for table: ${tableName}`;
		Log.trackEvent("DataverseDataOperation.DataSourceNotFound", {
			message: notFoundMsg,
			tableName
		});
		throw new PowerDataRuntimeError(ErrorCodes.DataSourceNotFound, notFoundMsg);
	}
	/**
	* Returns the Dataverse environment info from the default CDS database reference.
	* Used for custom API operations where the data source name is not an entity table.
	*/
	async _getDefaultDataverseEnvironmentInfo() {
		const db = (await this.getDatabaseReferences())["default.cds"];
		if (!db?.databaseDetails?.linkedEnvironmentMetadata?.instanceUrl) throw new PowerDataRuntimeError(ErrorCodes.DataSourceNotFound, "No Dataverse environment found at default.cds database reference.");
		return {
			datasetName: db.databaseDetails.environmentName,
			referenceType: db.databaseDetails.referenceType,
			linkedEnvironmentMetadata: db.databaseDetails.linkedEnvironmentMetadata,
			tableId: "",
			apis: {}
		};
	}
	_getInstanceUrl(dataSourceInfo) {
		const instanceUrl = dataSourceInfo.linkedEnvironmentMetadata?.instanceUrl;
		if (!instanceUrl) throw new PowerDataRuntimeError(ErrorCodes.DataClientInitFailed, "No instanceUrl found for Dataverse table.");
		return instanceUrl.endsWith("/") ? instanceUrl : `${instanceUrl}/`;
	}
	_getDataverseRequestUrl(dataSourceInfo, tableName, urlPath = "") {
		return `${this._getInstanceUrl(dataSourceInfo)}api/data/v9.0/${tableName}${urlPath}`;
	}
	/**
	* Constructs GET request URL for fetching metadata using options object.
	* @param dataSourceInfo - The data source information for the Dataverse table.
	* @param options - The options for the metadata request.
	* @returns The constructed metadata request URL.
	*/
	_generateMetadataRequestUrl(dataSourceInfo, options) {
		const { logicalName } = dataSourceInfo;
		if (!logicalName) throw new PowerDataRuntimeError(ErrorCodes.DataClientInitFailed, "No logicalName found for Dataverse table.");
		const url = new URL(`${this._getInstanceUrl(dataSourceInfo)}api/data/v9.0/EntityDefinitions(LogicalName='${logicalName}')`);
		const { metadata, schema } = options;
		const selects = new Set(Array.isArray(metadata) ? metadata : []);
		selects.add("LogicalName");
		const expands = [];
		if (schema?.manyToOne) expands.push("ManyToOneRelationships");
		if (schema?.oneToMany) expands.push("OneToManyRelationships");
		if (schema?.manyToMany) expands.push("ManyToManyRelationships");
		if (schema?.columns === "all") expands.push("Attributes");
		else if (schema && Array.isArray(schema.columns) && schema.columns.length > 0) {
			const attributesCollection = schema.columns.map((a) => `'${a}'`).join(",");
			expands.push(`Attributes($filter=Microsoft.Dynamics.CRM.In(PropertyName='LogicalName',PropertyValues=[${attributesCollection}]))`);
		}
		url.search = new URLSearchParams({
			$select: [...selects].join(","),
			$expand: expands.join(",")
		}).toString();
		return url.toString();
	}
};
/**
* Extracts the skip token from the next link URL.
* @param nextLink - The @odata.nextLink URL containing the skip token
* @returns The extracted skip token or undefined if not found.
*/
function extractSkipToken(nextLink) {
	if (!nextLink?.trim()) return;
	const match = nextLink.match(/[?&]\$?skiptoken=([^&#]+)/i);
	return match ? decodeURIComponent(match[1]) : void 0;
}
/**
* Detects the image format from the magic bytes at the start of the binary data.
* This is necessary because Dataverse image columns do not provide file extension or MIME type information.
* The use of download url companion column (e.g: columnName_url) is not possible due to CORS, so we have to rely on the binary data sniff to determine the extension. This is a standard technique.
* Referring: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/image-column-data?tabs=sdk#download-url
* Sniffing the magic bytes allows us to derive a file extension for the downloaded image, which can be used when saving the file or setting the correct MIME type for display.
* Docs: https://en.wikipedia.org/wiki/List_of_file_signatures
* Dataverse image columns support only GIF, JPEG, BMP, and PNG.
* The function checks for these formats and returns the corresponding extension.
* See: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/image-column-data?tabs=sdk#image-file-types
* Returns a file extension string, or "png" as a fallback if the format is unrecognized.
*/
function sniffImageExtension(data) {
	if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpg";
	if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return "png";
	if (data.length >= 4 && data[0] === 71 && data[1] === 73 && data[2] === 70 && data[3] === 56) return "gif";
	if (data.length >= 2 && data[0] === 66 && data[1] === 77) return "bmp";
	return "png";
}
/**
* Derives a filename for a downloaded image by sniffing the magic bytes of the binary data.
* Falls back to "png" if the format is unrecognized, as PNG is the most common Dataverse image format.
*/
function deriveImageFileName(columnName, data) {
	return `${columnName}.${data ? sniffImageExtension(data) : "png"}`;
}
/**
* Canonical GUID grammar (8-4-4-4-12 hex groups). Used to validate values before they are emitted
* as bare (unquoted) OData literals, so an attacker-controlled value cannot inject additional
* function-call segments (e.g. `)`, `,`, `=`) into the URL.
*/
const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/**
* ISO-8601 grammar for `Edm.Date` — a date with no time component (`2020-01-01`). Used to validate
* values before they are emitted as bare (unquoted) OData literals; like GUIDs, a bare date has no
* quoting to neutralize OData metacharacters, so it is rejected unless it matches the grammar.
*/
const ODATA_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/**
* ISO-8601 grammar for `Edm.DateTimeOffset` (`2020-01-01T16:00:00Z`, with optional seconds and
* fractional seconds). Per the OData/Edm spec a date-time offset literal MUST carry a time component
* and an explicit zone offset (`Z` or `±hh:mm`) — a date-only or offset-less value is a different Edm
* type and is rejected here rather than being emitted as a bare literal Dataverse would reject.
*/
const ODATA_DATETIMEOFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})$/;
/**
* Standard base64 grammar (RFC 4648 §4, the `+`/`/` alphabet with correct `=` padding). Used to
* validate the contents of an `Edm.Binary` value before it is wrapped in a `binary'...'` literal.
* The value must be a whole number of 4-character quanta (with the final quantum optionally padded
* to length 4 with `=`), so malformed lengths such as `"42"` are rejected locally rather than
* producing an invalid literal that only fails server-side. The url-safe alphabet (`-`/`_`) is
* intentionally rejected — Dataverse expects standard base64 and JavaScript encoders emit it.
*/
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
/**
* ISO-8601 duration grammar for `Edm.Duration` (`P`, optional day component, optional `T` time
* component). Matches values such as `PT1H`, `P2DT3H4M5S`, `-PT30M`. `P` must be followed by at
* least one component, and if the `T` time designator is present it must be followed by at least one
* of hours/minutes/seconds — so degenerate values like `P` or `P1DT` are rejected.
*/
const ODATA_DURATION_REGEX = /^[+-]?P(?=.*\d)(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/;
/**
* Encodes an `Edm.Binary` value to its base64 payload. Dataverse `FileType`/binary function
* parameters are typed as base64 strings by codegen, so a string is passed through unchanged;
* `ArrayBuffer`/typed-array values are encoded for convenience.
*/
function toBase64Payload(value) {
	if (typeof value === "string") return value;
	if (value instanceof ArrayBuffer) return arrayBufferToBase64(value);
	if (ArrayBuffer.isView(value)) {
		const view = value;
		const bytes = new Uint8Array(view.byteLength);
		bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
		return arrayBufferToBase64(bytes.buffer);
	}
	return String(value);
}
/**
* Converts a JavaScript value to an OData primitive literal string for use in function call URLs.
*
* Serialization rules:
* - `null`/`undefined` → `null`.
* - GUIDs (`type === 'guid'` or `format === 'guid'`/`'uuid'`) are emitted bare (unquoted). Dataverse
*   rejects a single-quoted value where an `Edm.Guid` is expected (`0x80060888`). Because the value
*   is emitted without quoting or escaping, it is first validated against the GUID grammar and
*   rejected otherwise — a bare literal has no escaping to neutralize OData metacharacters, so an
*   unvalidated value could inject extra function-call parameters.
* - `Edm.DateTimeOffset` (`format === 'datetimeoffset'`) is emitted bare (unquoted) as an ISO-8601
*   date-time literal that must include a time component and a zone offset (`Z`/`±hh:mm`);
*   `Edm.Date` (`format === 'date'`) is emitted bare as a date-only `YYYY-MM-DD` literal. As with
*   GUIDs, Dataverse rejects a single-quoted value where these Edm types are expected, and each is
*   validated against its own grammar before being emitted bare.
* - Binary (`format === 'binary'`) is emitted as a `binary'<base64>'` literal.
* - Duration (`format === 'duration'`) is emitted as a `duration'<ISO-8601 duration>'` literal
*   (e.g. `duration'PT1H'`). Dataverse rejects a plain single-quoted string where an `Edm.Duration`
*   is expected, so the value is validated against the ISO-8601 duration grammar first.
* - Collections (`type === 'array'` or an array value) are emitted as a JSON array literal, e.g.
*   `["a","b"]`. This is the format the Dataverse Web API accepts for `Collection(...)` function
*   parameters; a bare `String(array)` collapses to a comma-joined token that Dataverse rejects
*   ("parameter ... is not in scope").
* - Strings are single-quoted with internal single quotes escaped by doubling.
* - Numbers and booleans are serialized as-is.
*
* The returned literal is NOT URL-encoded — the function-param assembly emits every parameter via an
* OData parameter alias and applies a single `encodeURIComponent` there, so encoding lives in one place.
*/
function toODataLiteral(value, type, format) {
	if (value === null || value === void 0) return "null";
	if (type === "guid" || format === "guid" || format === "uuid") {
		const guid = String(value);
		if (!GUID_REGEX.test(guid)) throw new PowerDataRuntimeError(ErrorCodes.InvalidParameterValue, `Expected a GUID but received '${guid}'.`);
		return guid;
	}
	if (format === "binary") {
		const base64 = toBase64Payload(value);
		if (!BASE64_REGEX.test(base64)) throw new PowerDataRuntimeError(ErrorCodes.InvalidParameterValue, "Expected a base64-encoded value for a binary parameter.");
		return `binary'${base64}'`;
	}
	if (format === "duration") {
		const duration = String(value);
		if (!ODATA_DURATION_REGEX.test(duration)) throw new PowerDataRuntimeError(ErrorCodes.InvalidParameterValue, `Expected an ISO-8601 duration but received '${duration}'.`);
		return `duration'${duration}'`;
	}
	if (format === "date") {
		const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
		if (!ODATA_DATE_REGEX.test(iso)) throw new PowerDataRuntimeError(ErrorCodes.InvalidParameterValue, `Expected an ISO-8601 date (YYYY-MM-DD) but received '${iso}'.`);
		return iso;
	}
	if (format === "datetimeoffset") {
		const iso = value instanceof Date ? value.toISOString() : String(value);
		if (!ODATA_DATETIMEOFFSET_REGEX.test(iso)) throw new PowerDataRuntimeError(ErrorCodes.InvalidParameterValue, `Expected an ISO-8601 date-time with a zone offset but received '${iso}'.`);
		return iso;
	}
	if (type === "array" || Array.isArray(value)) return JSON.stringify(Array.isArray(value) ? value : [value]);
	if (type === "string") return `'${String(value).replace(/'/g, "''")}'`;
	return String(value);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/metadata/runtimeDataSourceService.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Error types specific to RuntimeDataSourceService
* @private
*/
var DataSourceServiceError;
DataSourceServiceError || (DataSourceServiceError = {});
/**
* RuntimeDataSourceService provides functionality for managing and retrieving
* data source information.
* @private
*/
var RuntimeDataSourceService = class {
	_powerDataSourcesInfoProvider;
	/**
	* Data source information
	*/
	_dataSourcesInfo;
	/**
	* Indicates whether the service has been initialized
	*/
	_isInitialized;
	/**
	* Creates a new instance of RuntimeDataSourceService
	*/
	constructor(_powerDataSourcesInfoProvider) {
		this._powerDataSourcesInfoProvider = _powerDataSourcesInfoProvider;
		this._dataSourcesInfo = {};
		this._isInitialized = false;
	}
	/**
	* Initializes the service by loading user data sources
	* @throws PowerDataRuntimeError if initialization fails
	*/
	async initialize() {
		try {
			const userDataSources = await this._getUserDataSources();
			this._dataSourcesInfo = {};
			Object.keys(userDataSources).forEach((key) => {
				this._dataSourcesInfo[key] = userDataSources[key];
			});
			this._isInitialized = true;
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.InitializationError, getErrorMessage(error));
		}
	}
	/**
	* Gets all user data sources
	* @returns Array of data source information
	* @throws PowerDataRuntimeError if service is not initialized
	*/
	async getUserDataSources() {
		await this._ensureInitialized();
		return this._dataSourcesInfo;
	}
	/**
	* Gets information for a specific data source
	* @param dataSource - The ID of the data source
	* @returns Data source information
	* @throws PowerDataRuntimeError if data source is not found or service is not initialized
	*/
	async getDataSource(dataSource) {
		await this._ensureInitialized();
		const dataSourceInfo = this._dataSourcesInfo[dataSource];
		if (!dataSourceInfo) {
			const errorMessage = `Unable to find data source: ${dataSource} in data sources info.`;
			throw new PowerDataRuntimeError(ErrorCodes.DataSourceNotFound, errorMessage);
		}
		return dataSourceInfo;
	}
	/**
	* Checks if a data source exists
	* @param dataSourceId - The ID of the data source to check
	* @returns True if the data source exists, false otherwise
	* @throws PowerDataRuntimeError if service is not initialized
	*/
	async hasDataSource(dataSource) {
		await this._ensureInitialized();
		return dataSource in this._dataSourcesInfo;
	}
	/**
	* Ensures the service is initialized
	* @throws PowerDataRuntimeError if service is not initialized
	*/
	async _ensureInitialized() {
		if (!this._isInitialized) await this.initialize();
	}
	/**
	* Gets user data sources from the provided data source schemas
	* @returns Promise resolving to array of data source information
	*/
	async _getUserDataSources() {
		const dataSourcesInfo = await this._powerDataSourcesInfoProvider.getDataSourcesInfo();
		return Promise.resolve(dataSourcesInfo);
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/metadata/runtimeMetadataOperations.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* RuntimeMetadataOperations provides functionality for retrieving metadata
* about connections and APIs.
* @private
*/
var RuntimeMetadataOperations = class {
	_clientProvider;
	constructor(_clientProvider) {
		this._clientProvider = _clientProvider;
	}
	async getConnections(context) {
		const response = await (await this._clientProvider.getMetadataClientAsync()).getAppConnectionConfigsAsync(context);
		return {
			success: response.success,
			data: response.data ? [response.data] : [],
			error: response.error
		};
	}
	async getConnectionApis(_connectionId, context) {
		const response = await (await this._clientProvider.getMetadataClientAsync()).getAppDataSourceConfigsAsync(context);
		return {
			success: response.success,
			data: response.data ? [response.data] : [],
			error: response.error
		};
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtimeClient/runtimeDataClient.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* RuntimeDataClient handles data operations through PowerOperationExecutor
* @private
*/
var RuntimeDataClient = class RuntimeDataClient {
	_powerOperationExecutor;
	_createRequestBody;
	static SERVICES = {
		dataClient: "AppHttpClientPlugin",
		identityService: "AppIdentityServicePlugin"
	};
	static ACTIONS = {
		sendHttp: "sendHttpAsync",
		getToken: "getAppAccessTokenAsync",
		getDynamicToken: "getAppDynamicResourceAccessTokenAsync"
	};
	static REQUEST_SOURCE = "PublishedApp";
	constructor(_powerOperationExecutor, _createRequestBody) {
		this._powerOperationExecutor = _powerOperationExecutor;
		this._createRequestBody = _createRequestBody;
	}
	/**
	* Creates a new instance of RuntimeDataClient
	*/
	static createInstanceAsync(powerOperationExecutor, createRequestBody) {
		return Promise.resolve(new RuntimeDataClient(powerOperationExecutor, createRequestBody));
	}
	/**
	* Creates data using POST method
	* @param url - The URL for the request
	* @param apiId - The API ID for authentication
	* @param tableName - The name of the table to access
	* @param body - The request body for the POST method
	* @param operationName - Optional operation name for telemetry
	* @return Promise resolving to the response data
	* @throws Error if the request fails or the response is invalid
	* @throws Error if the request body is invalid
	*/
	async createDataAsync(url, apiId, tableName, body, context) {
		try {
			if (!body) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingRequestBody}`);
			const config = {
				url,
				method: HttpMethod.POST,
				apiId,
				tableName,
				body: JSON.stringify(body)
			};
			context = this._ensureContext(context, "runtimeDataClient.createDataAsync");
			return await this._executeRequest(config, context);
		} catch (error) {
			if (isOperationResult(error)) return error;
			else return createErrorResponse(error, DataOperationErrorMessages.CreateFailed);
		}
	}
	/**
	* Updates data using PATCH method
	* @param url - The URL for the request
	* @param apiId - The API ID for authentication
	* @param tableName - The name of the table to access
	* @param body - The request body for the PATCH method
	* @param operationName - Optional operation name for telemetry
	* @return Promise resolving to the response data
	* @throws Error if the request fails or the response is invalid
	* @throws Error if the request body is invalid
	*/
	async updateDataAsync(url, apiId, tableName, body, context) {
		try {
			if (!body) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingRequestBody}`);
			const config = {
				url,
				method: HttpMethod.PATCH,
				apiId,
				tableName,
				body: JSON.stringify(body)
			};
			context = this._ensureContext(context, "runtimeDataClient.updateDataAsync");
			return await this._executeRequest(config, context);
		} catch (error) {
			if (isOperationResult(error)) return error;
			else return createErrorResponse(error, DataOperationErrorMessages.UpdateFailed);
		}
	}
	/**
	* Uploads data using PATCH method for file/image columns.
	* @param url - The URL for the request (should include the column name, e.g., /accounts(id)/sample_filecolumn)
	* @param apiId - The API ID for authentication
	* @param tableName - The name of the table to access
	* @param data - The binary content to upload
	* @param context - Operation context, must include fileName for upload and may include telemetry information
	* @return Promise resolving to the response data
	* @remarks File size is not validated client-side; limits are enforced server-side by Dataverse.
	* For file columns the limit is 128 MB or the column's MaxSizeInKB setting, whichever is lower.
	* For image columns the maximum configurable size is 30 MB.
	*/
	async uploadDataAsync(url, apiId, tableName, data, context) {
		try {
			if (!data) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingRequestBody}`);
			if (!context?.fileName) throw new Error(`${DataOperationErrorMessages.InvalidRequest}: ${DataOperationErrorMessages.MissingFileData}`);
			const config = {
				url,
				method: HttpMethod.PATCH,
				apiId,
				tableName,
				headers: {
					"Content-Type": "application/octet-stream",
					"x-ms-file-name": context.fileName
				},
				body: data
			};
			context = this._ensureContext(context, "runtimeDataClient.uploadDataAsync");
			return await this._executeRequest(config, context);
		} catch (error) {
			if (isOperationResult(error)) return error;
			else return createErrorResponse(error, DataOperationErrorMessages.UploadFailed);
		}
	}
	/**
	* Deletes data using DELETE method
	* @param url - The URL for the request
	* @param connectionApi - The API ID for authentication
	* @param serviceNamespace - The name of the service namespace
	* @param operationName - Optional operation name for telemetry
	* @return Promise resolving to the response data
	* @throws Error if the request fails or the response is invalid
	*/
	async deleteDataAsync(url, connectionApi, serviceNamespace, context) {
		try {
			const config = {
				url,
				method: HttpMethod.DELETE,
				apiId: connectionApi,
				tableName: serviceNamespace
			};
			context = this._ensureContext(context, "runtimeDataClient.deleteDataAsync");
			return await this._executeRequest(config, context);
		} catch (error) {
			if (isOperationResult(error)) return error;
			else return createErrorResponse(error, DataOperationErrorMessages.DeleteFailed);
		}
	}
	/**
	* Retrieves data using GET or POST method
	* @param url - The URL for the request
	* @param apiId - The API ID for authentication
	* @param tableName - The name of the table to access
	* @param method - The HTTP method
	* @param body - Optional request body for POST method
	* @param context - Optional operation context
	* @param operationName - Optional operation name for telemetry
	* @return Promise resolving to the response data
	* @throws Error if the request fails or the response is invalid
	*/
	async retrieveDataAsync(url, apiId, tableName, method, headers, body, context) {
		try {
			const config = {
				url,
				method,
				apiId,
				tableName,
				headers,
				body: body ? body instanceof Uint8Array || body instanceof ArrayBuffer ? body : typeof body === "string" ? body : JSON.stringify(body) : void 0
			};
			context = this._ensureContext(context, "runtimeDataClient.retrieveDataAsync");
			return await this._executeRequest(config, context);
		} catch (error) {
			if (isOperationResult(error)) return error;
			else return createErrorResponse(error, DataOperationErrorMessages.RetrieveFailed);
		}
	}
	/**
	* Gets an access token for the specified API.
	* If the API is Dataverse, retrieves a dynamic resource token; otherwise, retrieves a standard appservice API token.
	* @param apiId - The API ID for authentication
	* @param datasetName - Optional dataset name for Dataverse
	* @returns Promise resolving to the access token
	* @throws Error if token acquisition fails
	*/
	async _getAccessToken(apiId, datasetName) {
		try {
			let result;
			if (apiId === DataSources.Dataverse) result = await this._powerOperationExecutor.execute(RuntimeDataClient.SERVICES.identityService, RuntimeDataClient.ACTIONS.getDynamicToken, [datasetName]);
			else result = await this._powerOperationExecutor.execute(RuntimeDataClient.SERVICES.identityService, RuntimeDataClient.ACTIONS.getToken, [apiId]);
			return result.data;
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.TokenAcquisitionFailed, getErrorMessage(error));
		}
	}
	_mergePreferHeaders(configHeaders, method) {
		let preferHeader = "";
		if (configHeaders?.Prefer) preferHeader += configHeaders.Prefer;
		if (method === HttpMethod.POST || method === HttpMethod.PATCH) {
			const defaultPrefer = "return=representation,odata.include-annotations=*";
			if (preferHeader) {
				if (!preferHeader.includes("return=representation")) preferHeader += (preferHeader ? "," : "") + defaultPrefer;
			} else preferHeader = defaultPrefer;
		}
		return preferHeader;
	}
	/**
	* Creates headers for the HTTP request.
	* Combines default headers with any custom headers provided in the config.
	* Custom headers are optional and take precedence over default headers.
	* @param token - The access token for authentication
	* @param config - The HTTP request configuration
	* @return The headers for the request
	* @throws Error if header creation fails
	*/
	_createHeaders(token, config, context) {
		const isFileUpload = config.headers?.["Content-Type"] === "application/octet-stream";
		const baseHeaders = {
			Accept: "application/json",
			"x-ms-protocol-semantics": "cdp",
			ServiceNamespace: config.tableName,
			Authorization: `paauth ${token}`,
			"x-ms-pa-client-custom-headers-options": "{\"addCustomHeaders\":true}",
			"x-ms-enable-selects": "true",
			"x-ms-pa-client-telemetry-options": `paclient-telemetry {"operationName":"${context?.operationName ?? "runtimeDataClient.executeRequest"}"}`,
			"x-ms-pa-client-telemetry-additional-data": `{"apiId":"${config.apiId}"}`
		};
		if (config.apiId === DataSources.Dataverse) {
			baseHeaders["x-ms-protocol-semantics"] = DataSources.Dataverse;
			baseHeaders.Authorization = `dynamicauth ${token}`;
			const { baseUrl, encodedPath } = extractDataverseUrlParts(config.url);
			const batchId = context?.batchId || "";
			const preferHeader = this._mergePreferHeaders(config.headers, config.method);
			if (!isFileUpload && !context?.skipBatch) baseHeaders.BatchInfo = JSON.stringify({
				baseUrl,
				encodedPath,
				headers: {
					Accept: "application/json",
					...preferHeader ? { Prefer: preferHeader } : {},
					...config.method === HttpMethod.POST || config.method === HttpMethod.PATCH ? { "Content-Type": "application/json" } : {}
				},
				batchId
			});
		}
		if (config.headers) return {
			...baseHeaders,
			...config.headers
		};
		return baseHeaders;
	}
	/**
	* Executes an HTTP request with the given configuration
	* @param config - The HTTP request configuration
	* @param context - Optional operation context
	* @return Promise resolving to the response data
	* @throws Error if the request fails or the response is invalid
	* @throws Error if the response content type is invalid
	*/
	async _executeRequest(config, context) {
		const token = await this._getAccessToken(config.apiId, context?.datasetName);
		const headers = this._createHeaders(token, config, context);
		const requestBody = config.body ? this._createRequestBody ? this._createRequestBody(config) : config.headers?.["Content-Type"] === "application/octet-stream" ? new Blob([config.body], { type: "application/octet-stream" }) : new Blob([config.body], { type: "application/json" }) : "";
		let result;
		try {
			result = await this._powerOperationExecutor.execute(RuntimeDataClient.SERVICES.dataClient, RuntimeDataClient.ACTIONS.sendHttp, [
				{
					url: config.url,
					method: config.method,
					requestSource: RuntimeDataClient.REQUEST_SOURCE,
					allowSessionStorage: true,
					returnDirectResponse: true,
					headers
				},
				requestBody,
				"arraybuffer"
			]);
		} catch (error) {
			return {
				success: false,
				error: parseHttpPluginError(error),
				data: void 0
			};
		}
		const responseData = result.data;
		const responseHeaders = responseData[0].headers;
		const contentType = responseHeaders["Content-Type"];
		if (!contentType) return {
			success: true,
			data: void 0
		};
		else if (contentType.indexOf("application/json") !== -1) {
			const data = result.data[1];
			let text = this._decodeArrayBuffer(data);
			if (!text) text = "{}";
			const parsedResult = JSON.parse(text);
			if (context?.isDataVerseOperation || this._isDataverseCall(config.url)) return {
				success: true,
				data: parsedResult
			};
			else if (!context?.isExecuteAsync && "value" in parsedResult && Array.isArray(parsedResult.value)) return {
				success: true,
				data: parsedResult.value,
				count: parsedResult["@odata.count"]
			};
			else return {
				success: true,
				data: parsedResult
			};
		} else if (contentType.indexOf("image/") !== -1) {
			const buffer = result.data[1];
			if (buffer instanceof ArrayBuffer) return {
				success: true,
				data: arrayBufferToBase64(buffer)
			};
			return {
				success: true,
				data: buffer
			};
		} else if (contentType.indexOf("application/octet-stream") !== -1) {
			const buffer = result.data[1];
			const rawFileName = responseHeaders["x-ms-file-name"];
			const fileName = typeof rawFileName === "string" && rawFileName ? rawFileName : void 0;
			return {
				success: true,
				data: buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer,
				...fileName !== void 0 ? { fileName } : {}
			};
		} else {
			const buffer = result.data[1];
			if (buffer instanceof ArrayBuffer) {
				const value = convertArrayBufferToString(buffer);
				const status = responseData[0].status;
				const responseType = context?.responseInfo?.[status];
				if (responseType) {
					let parsedValue;
					try {
						parsedValue = JSON.parse(value);
					} catch (err) {
						return {
							success: false,
							data: void 0,
							error: new Error(DataOperationErrorMessages.InvalidResponse)
						};
					}
					if (responseType.type === "array" && !Array.isArray(parsedValue)) return {
						success: false,
						data: void 0,
						error: new Error(DataOperationErrorMessages.InvalidResponse)
					};
					if (responseType.type === "object" && (typeof parsedValue !== "object" || Array.isArray(parsedValue) || parsedValue === null)) return {
						success: false,
						data: void 0,
						error: new Error(DataOperationErrorMessages.InvalidResponse)
					};
					return {
						success: true,
						data: parsedValue
					};
				} else return {
					success: true,
					data: value
				};
			}
			const statusCode = responseData[0].status;
			if (statusCode >= 200 && statusCode < 300) return {
				success: true,
				data: void 0
			};
			return {
				success: false,
				data: responseData,
				error: new Error(DataOperationErrorMessages.InvalidResponse)
			};
		}
	}
	_ensureContext(context, defaultOperationName) {
		if (!context) context = {};
		if (!context.operationName) context.operationName = defaultOperationName;
		return context;
	}
	/**
	* Checks if the given URL is a Dataverse API call
	* @param url - The URL to check
	* @returns True if the URL is a Dataverse API call, false otherwise
	*/
	_isDataverseCall(url) {
		if (!url) return false;
		const urlLower = decodeURIComponent(url).toLowerCase();
		return urlLower.includes("/api/data/") && !urlLower.includes("/apim");
	}
	/**
	* Decodes ArrayBuffer to string, handling both browser and Node.js environments
	* @param buffer - The ArrayBuffer to decode
	* @returns The decoded string
	*/
	_decodeArrayBuffer(buffer) {
		if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(buffer);
		const uint8Array = new Uint8Array(buffer);
		const results = [];
		const chunkSize = 8192;
		for (let i = 0; i < uint8Array.length; i += chunkSize) {
			const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
			results.push(String.fromCharCode.apply(null, Array.from(chunk)));
		}
		try {
			return results.join("");
		} catch {
			return results.join("");
		}
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtimeClient/runtimeMetadataClient.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* RuntimeMetadataClient handles metadata operations through PowerOperationExecutor
* @private
*/
var RuntimeMetadataClient = class RuntimeMetadataClient {
	_powerOperationExecutor;
	static SERVICES = { powerAppsClient: "AppPowerAppsClientPlugin" };
	static ACTIONS = {
		getConnectionConfigs: "loadAppConnectionsAsync_v2",
		getDataSourceConfigs: "getAppCdsDataSourceConfigsAsync"
	};
	constructor(_powerOperationExecutor) {
		this._powerOperationExecutor = _powerOperationExecutor;
	}
	/**
	* Creates a new instance of RuntimeMetadataClient
	* @param powerOperationExecutor - The powerOperationExecutor instance
	* @returns Promise resolving to IRuntimeMetadataClient
	*/
	static createInstanceAsync(powerOperationExecutor) {
		return Promise.resolve(new RuntimeMetadataClient(powerOperationExecutor));
	}
	/**
	* Fetches app connection configurations
	* @returns Promise resolving to connection reference details
	* @throws Error if the operation fails
	*/
	async getAppConnectionConfigsAsync() {
		try {
			const config = {
				service: RuntimeMetadataClient.SERVICES.powerAppsClient,
				action: RuntimeMetadataClient.ACTIONS.getConnectionConfigs,
				params: []
			};
			return {
				success: true,
				data: await this._executeOperation(config)
			};
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.ConnectionConfigFetchFailed, getErrorMessage(error));
		}
	}
	/**
	* Fetches app data source configurations
	* @returns Promise resolving to connection reference details
	* @throws Error if the operation fails
	*/
	async getAppDataSourceConfigsAsync() {
		try {
			const config = {
				service: RuntimeMetadataClient.SERVICES.powerAppsClient,
				action: RuntimeMetadataClient.ACTIONS.getDataSourceConfigs,
				params: []
			};
			return {
				success: true,
				data: await this._executeOperation(config)
			};
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.DataSourceConfigFetchFailed, getErrorMessage(error));
		}
	}
	/**
	* Executes a metadata operation with the given configuration
	* @param config - The operation configuration
	* @returns Promise resolving to the operation result
	* @throws Error if the operation fails
	*/
	async _executeOperation(config) {
		try {
			const result = await this._powerOperationExecutor.execute(config.service, config.action, config.params || []);
			return Object.keys(result.data).reduce((acc, key) => {
				acc[key.toLowerCase()] = (result.data ?? {})[key];
				return acc;
			}, {});
		} catch {
			throw new PowerDataRuntimeError(ErrorCodes.InvalidMetadataResponse);
		}
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtimeClient/runtimeClientProvider.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* RuntimeClientProvider manages the lifecycle of runtime clients for data and metadata operations.
* Implements a lazy initialization pattern for clients and ensures proper error handling.
* @private
*/
var RuntimeClientProvider = class {
	_dataClient;
	_metadataClient;
	_operationExecutor;
	constructor(powerOperationExecutor) {
		this._operationExecutor = powerOperationExecutor;
	}
	/**
	* Gets or initializes the data client
	* @throws Error if client initialization fails
	* @returns Promise resolving to IRuntimeDataClient
	*/
	async getDataClientAsync() {
		try {
			if (!this._dataClient) this._dataClient = await this._initializeDataClient();
			if (!this._dataClient) throw new PowerDataRuntimeError(ErrorCodes.DataClientNotInitialized);
			return this._dataClient;
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.DataClientInitFailed, getErrorMessage(error));
		}
	}
	/**
	* Gets or initializes the metadata client
	* @throws Error if client initialization fails
	* @returns Promise resolving to IRuntimeMetadataClient
	*/
	async getMetadataClientAsync() {
		try {
			if (!this._metadataClient) this._metadataClient = await this._initializeMetadataClient();
			if (!this._metadataClient) throw new PowerDataRuntimeError(ErrorCodes.MetadataClientNotInitialized);
			return this._metadataClient;
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.MetadataClientInitFailed, getErrorMessage(error));
		}
	}
	/**
	* Initializes the data client
	* @returns Promise resolving to IRuntimeDataClient
	*/
	async _initializeDataClient() {
		const bridge = await getBridge();
		return RuntimeDataClient.createInstanceAsync(this._operationExecutor, bridge.createRequestBody?.bind(bridge));
	}
	/**
	* Initializes the metadata client
	* @returns Promise resolving to IRuntimeMetadataClient
	*/
	async _initializeMetadataClient() {
		return RuntimeMetadataClient.createInstanceAsync(this._operationExecutor);
	}
	/**
	* Resets both clients, forcing re-initialization on next use
	* Useful for testing or recovering from error states
	*/
	reset() {
		this._dataClient = void 0;
		this._metadataClient = void 0;
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtime/powerDataRuntime.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* PowerDataRuntime provides a unified interface for data and metadata operations
* in the Power runtime environment.
* @private
*/
var PowerDataRuntime = class {
	_clientProvider;
	_dataSourceService;
	_dataOperations;
	_metadataOperations;
	_isInitialized;
	/**
	* Creates a new instance of PowerDataRuntime
	* @param params - Initialization parameters
	* @throws DataRuntimeError if initialization fails
	*/
	constructor(params) {
		try {
			Log.createInstance(params.powerOperationExecutor);
			this._clientProvider = new RuntimeClientProvider(params.powerOperationExecutor);
			this._dataSourceService = new RuntimeDataSourceService(params.powerDataSourcesInfoProvider);
			this._isInitialized = false;
			this._initialize();
		} catch (error) {
			if (error instanceof Error) Log.trackException(error);
			throw error;
		}
	}
	/**
	* Gets the Data operations interface
	* @throws PowerDataRuntimeError if operations are not initialized
	*/
	get Data() {
		this._ensureInitialized();
		if (!this._dataOperations) this._dataOperations = this._createDataOperations();
		return this._dataOperations;
	}
	/**
	* Gets the Metadata operations interface
	* @throws PowerDataRuntimeError if operations are not initialized
	*/
	get Metadata() {
		this._ensureInitialized();
		if (!this._metadataOperations) this._metadataOperations = this._createMetadataOperations();
		return this._metadataOperations;
	}
	/**
	* Ensures the PowerDataRuntime is initialized
	* @throws PowerDataRuntimeError if not initialized
	*/
	_ensureInitialized() {
		if (!this._isInitialized) throw new PowerDataRuntimeError(ErrorCodes.OperationsNotInitialized);
	}
	/**
	* Initializes the PowerDataRuntime components
	* @throws PowerDataRuntimeError if initialization fails
	*/
	_initialize() {
		try {
			this._dataOperations = this._createDataOperations();
			this._metadataOperations = this._createMetadataOperations();
			this._isInitialized = true;
		} catch (error) {
			throw new PowerDataRuntimeError(ErrorCodes.InitializationFailed, getErrorMessage(error));
		}
	}
	/**
	* Creates a new instance of DataOperations
	*/
	_createDataOperations() {
		return new DefaultDataOperationOrchestrator(new DataverseDataOperationExecutor(this._clientProvider, this._dataSourceService), new ConnectorDataOperationExecutor(this._clientProvider, this._dataSourceService), this._dataSourceService);
	}
	/**
	* Creates a new instance of MetadataOperations
	*/
	_createMetadataOperations() {
		return new RuntimeMetadataOperations(this._clientProvider);
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtime/powerDataRuntimeInstance.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Singleton instance of PowerDataRuntime
*/
let powerDataRuntimeInstance;
/**
* Gets or creates a singleton instance of PowerDataRuntime
* @param powerDataSourcesInfoProvider - Data sources info provider to initialize the PowerDataRuntime
* @param powerOperationExecutor - Optional power operation executor to initialize the PowerDataRuntime
* @returns PowerDataRuntime instance
* @private
*/
function getPowerDataRuntime(powerDataSourcesInfoProvider, powerOperationExecutor) {
	if (!powerDataRuntimeInstance) powerDataRuntimeInstance = new PowerDataRuntime({
		powerDataSourcesInfoProvider,
		powerOperationExecutor
	});
	return powerDataRuntimeInstance;
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtime/powerDataSourcesInfoProvider.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Singleton provider for managing data sources information.
* @private
*/
var PowerDataSourcesInfoProvider = class PowerDataSourcesInfoProvider {
	static instance = null;
	dataSourcesInfo;
	/**
	* Private constructor to enforce the singleton pattern.
	* @param dataSourcesInfo The data sources information to initialize the provider with.
	*/
	constructor(dataSourcesInfo) {
		this.dataSourcesInfo = dataSourcesInfo;
	}
	/**
	* Retrieves the singleton instance of PowerDataSourcesInfoProvider.
	* If the instance does not exist, it initializes it with the provided data sources info.
	*
	* @param dataSourcesInfo Optional parameter to initialize the instance if it doesn't exist.
	* @returns The singleton instance of PowerDataSourcesInfoProvider.
	* @throws Error if the instance is not initialized and no dataSourcesInfo is provided.
	*/
	static getInstance(dataSourcesInfo) {
		if (!this.instance) {
			if (!dataSourcesInfo) throw new PowerDataRuntimeError(ErrorCodes.DataSourcesInfoNotFound);
			this.instance = new PowerDataSourcesInfoProvider(dataSourcesInfo);
		}
		return this.instance;
	}
	/**
	* Retrieves the data sources information.
	*
	* @returns A promise resolving to the data sources information.
	*/
	async getDataSourcesInfo() {
		return this.dataSourcesInfo;
	}
};
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/runtime/getRuntimeContext.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
let _executor;
function getExecutor() {
	if (!_executor) _executor = new OperationExecutor();
	return _executor;
}
/**
* Builds (or retrieves) a singleton runtime context based on provided data sources.
* Must be called after initializeRuntime() has injected the OperationExecutor.
* @private
*/
async function getPowerSdkInstance(dataSourcesInfo) {
	const executor = getExecutor();
	return getPowerDataRuntime(PowerDataSourcesInfoProvider.getInstance(dataSourcesInfo), executor);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/createRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Creates a new record in the specified table.
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to create the record in.
* @param record - The record to create.
* @returns A promise that resolves to the created record.
* @private
*/
async function createRecordAsync(dataSourcesInfo, tableName, record) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.createRecordAsync(tableName, record);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/deleteFileOrImageFromRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Deletes the file or image data stored in a file/image column of an existing record.
* Sends a DELETE request to `/<tableName>(<recordId>)/<columnName>`.
* This API is intended for use with file and image columns in Dataverse.
* @param dataSourcesInfo - The data sources information.
* @param tableName - The logical name of the Dataverse table.
* @param recordId - The identifier of the record.
* @param columnName - The name of the file or image column whose data should be deleted.
* @returns - A promise that resolves to an operation result.
* @private
*/
async function deleteFileOrImageFromRecord(dataSourcesInfo, tableName, recordId, columnName) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.deleteFileOrImageFromRecord(tableName, recordId, columnName);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/deleteRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Deletes a record from the specified table.
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to delete the record from.
* @param recordId - The ID of the record to delete.
* @returns A promise that resolves to the result of the delete operation.
* @private
*/
async function deleteRecordAsync(dataSourcesInfo, tableName, recordId) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.deleteRecordAsync(tableName, recordId);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/downloadFileFromRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Downloads binary data from a file column of an existing record (maximum size 128 MB).
* Returns the file contents as binary.
* This API is intended for use with file/image columns in Dataverse, and will not work with other column types.
* For file columns in Dataverse, the recordId is the ID of the Dataverse record, and the tableName is the logical name of the Dataverse table.
* See documentation for more details:
* https://learn.microsoft.com/en-us/power-apps/developer/data-platform/file-column-data?tabs=webapi#download-a-file-in-a-single-request-using-web-api
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to download the file from.
* @param recordId - The ID of the record to download from.
* @param columnName - The name of the file column to download from.
* @returns - A promise that resolves to an operation result with the file contents as binary.
* @private
*/
async function downloadFileFromRecord(dataSourcesInfo, tableName, recordId, columnName) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.downloadFileFromRecord(tableName, recordId, columnName);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/downloadImageFromRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Downloads binary data from an image column of an existing record.
* Returns the image contents as binary.
* This API is intended for use with image columns in Dataverse, and will not work with other column types.
* For image columns in Dataverse, the imageRelativeUrl is the relative URL of the image, and the tableName is the logical name of the Dataverse table.
* See documentation for more details:
* https://learn.microsoft.com/en-us/power-apps/developer/data-platform/file-column-data?tabs=webapi#download-a-file-in-a-single-request-using-web-api
* @param dataSourcesInfo - The data sources information.
* @param tableName - The logical name of the Dataverse table.
* @param recordId - The identifier of the record containing the image.
* @param columnName - The name of the image column.
* @param fullSize - When true, requests the full-size image (`?size=full`). Defaults to false (thumbnail/smaller size image).
* @returns - A promise that resolves to an operation result with the image contents as binary.
* @private
*/
async function downloadImageFromRecord(dataSourcesInfo, tableName, recordId, columnName, fullSize) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.downloadImageFromRecord(tableName, recordId, columnName, fullSize);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/execute.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Executes a data operation.
* @param operation - The data operation to execute.
* @returns - A promise that resolves to the result of the operation.
* @private
*/
async function executeAsync(dataSourcesInfo, operation) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.executeAsync(operation);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/retrieveMultipleRecords.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Retrieves multiple records from the specified table.
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to create the record in.
* @param options - Optional operation options.
* @returns - A promise that resolves to the created record.
* @private
*/
async function retrieveMultipleRecordsAsync(dataSourcesInfo, tableName, options) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.retrieveMultipleRecordsAsync(tableName, options);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/retrieveRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Retrieves a record from the specified table.
* @param tableName - The name of the table to retrieve the record from.
* @param recordId - The ID of the record to retrieve.
* @param options - Optional operation options.
* @returns A promise that resolves to the retrieved record.
* @private
*/
async function retrieveRecordAsync(dataSourcesInfo, tableName, recordId, options) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.retrieveRecordAsync(tableName, recordId, options);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/updateRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Updates an existing record in the specified table.
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to create the record in.
* @param recordId - The ID of the record to update.
* @param changes - The changes to apply to the record.
* @returns - A promise that resolves to the created record.
* @private
*/
async function updateRecordAsync(dataSourcesInfo, tableName, recordId, changes) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.updateRecordAsync(tableName, recordId, changes);
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/internal/data/core/api/uploadRecord.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
/**
* Uploads to an existing record in the specified table with binary data (maximum size 128 MB).
* Content type header must be application/octet-stream, and the binary data should be provided directly (e.g., as a Uint8Array or other binary type). This API is intended for use with file columns in Dataverse, and will not work with other column types.
* For file columns in Dataverse, the recordId is the ID of the Dataverse record, and the tableName is the logical name of the Dataverse table.
* See documentation for more details:
* https://learn.microsoft.com/en-us/power-apps/developer/data-platform/file-column-data?source=recommendations&tabs=webapi#upload-a-file-in-a-single-request-using-web-api
* @param dataSourcesInfo - The data sources information.
* @param tableName - The name of the table to upload the record in.
* @param recordId - The ID of the record to upload.
* @param columnName - The name of the file column to upload to.
* @param fileName - The name of the file to upload (used for Dataverse file columns).
* @param data - The body of the request which should have the binary contents of the file to upload.
* @returns - A promise that resolves to an operation result indicating success or failure of the upload.
* @private
*/
async function uploadFileToRecord(dataSourcesInfo, tableName, recordId, columnName, fileName, data) {
	return await (await getPowerSdkInstance(dataSourcesInfo)).Data.uploadFileToRecord(tableName, recordId, columnName, fileName, data);
}
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
function getClient(dataSourcesInfo) {
	return {
		createRecordAsync: (tableName, record) => {
			return createRecordAsync(dataSourcesInfo, tableName, record);
		},
		deleteRecordAsync: (tableName, recordId) => {
			return deleteRecordAsync(dataSourcesInfo, tableName, recordId);
		},
		executeAsync: (operation) => {
			return executeAsync(dataSourcesInfo, operation);
		},
		retrieveMultipleRecordsAsync: (tableName, options) => {
			return retrieveMultipleRecordsAsync(dataSourcesInfo, tableName, options);
		},
		retrieveRecordAsync: (tableName, recordId, options) => {
			return retrieveRecordAsync(dataSourcesInfo, tableName, recordId, options);
		},
		updateRecordAsync: (tableName, recordId, changes) => {
			return updateRecordAsync(dataSourcesInfo, tableName, recordId, changes);
		},
		uploadFileToRecord: (tableName, recordId, columnName, fileName, data) => {
			return uploadFileToRecord(dataSourcesInfo, tableName, recordId, columnName, fileName, data);
		},
		downloadFileFromRecord: (tableName, recordId, columnName) => {
			return downloadFileFromRecord(dataSourcesInfo, tableName, recordId, columnName);
		},
		downloadImageFromRecord: (tableName, recordId, columnName, fullSize) => {
			return downloadImageFromRecord(dataSourcesInfo, tableName, recordId, columnName, fullSize);
		},
		deleteFileOrImageFromRecord: (tableName, recordId, columnName) => {
			return deleteFileOrImageFromRecord(dataSourcesInfo, tableName, recordId, columnName);
		}
	};
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/node_modules/@microsoft/power-apps/dist/data/index.js
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
*/
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/generated/services/Vsb_capexaccountlistsService.ts
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
var Vsb_capexaccountlistsService = class Vsb_capexaccountlistsService {
	static dataSourceName = "vsb_capexaccountlists";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_capexaccountlistsService.client.createRecordAsync(Vsb_capexaccountlistsService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_capexaccountlistsService.client.updateRecordAsync(Vsb_capexaccountlistsService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_capexaccountlistsService.client.deleteRecordAsync(Vsb_capexaccountlistsService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_capexaccountlistsService.client.retrieveRecordAsync(Vsb_capexaccountlistsService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_capexaccountlistsService.client.retrieveMultipleRecordsAsync(Vsb_capexaccountlistsService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_capexaccountlistsService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_capexaccountlistsService.dataSourceName,
				options
			}
		} });
	}
};
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_landleasesubaccountsService {
	static dataSourceName = "vsb_landleasesubaccounts";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_landleasesubaccountsService.client.createRecordAsync(Vsb_landleasesubaccountsService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_landleasesubaccountsService.client.updateRecordAsync(Vsb_landleasesubaccountsService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_landleasesubaccountsService.client.deleteRecordAsync(Vsb_landleasesubaccountsService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_landleasesubaccountsService.client.retrieveRecordAsync(Vsb_landleasesubaccountsService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_landleasesubaccountsService.client.retrieveMultipleRecordsAsync(Vsb_landleasesubaccountsService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_landleasesubaccountsService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_landleasesubaccountsService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_opexsubaccountsService {
	static dataSourceName = "vsb_opexsubaccounts";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_opexsubaccountsService.client.createRecordAsync(Vsb_opexsubaccountsService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_opexsubaccountsService.client.updateRecordAsync(Vsb_opexsubaccountsService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_opexsubaccountsService.client.deleteRecordAsync(Vsb_opexsubaccountsService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_opexsubaccountsService.client.retrieveRecordAsync(Vsb_opexsubaccountsService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_opexsubaccountsService.client.retrieveMultipleRecordsAsync(Vsb_opexsubaccountsService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_opexsubaccountsService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_opexsubaccountsService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_opexaccountsService {
	static dataSourceName = "vsb_opexaccounts";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_opexaccountsService.client.createRecordAsync(Vsb_opexaccountsService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_opexaccountsService.client.updateRecordAsync(Vsb_opexaccountsService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_opexaccountsService.client.deleteRecordAsync(Vsb_opexaccountsService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_opexaccountsService.client.retrieveRecordAsync(Vsb_opexaccountsService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_opexaccountsService.client.retrieveMultipleRecordsAsync(Vsb_opexaccountsService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_opexaccountsService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_opexaccountsService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class TransactioncurrenciesService {
	static dataSourceName = "transactioncurrencies";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await TransactioncurrenciesService.client.createRecordAsync(TransactioncurrenciesService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await TransactioncurrenciesService.client.updateRecordAsync(TransactioncurrenciesService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await TransactioncurrenciesService.client.deleteRecordAsync(TransactioncurrenciesService.dataSourceName, id);
	}
	static async get(id, options) {
		return await TransactioncurrenciesService.client.retrieveRecordAsync(TransactioncurrenciesService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await TransactioncurrenciesService.client.retrieveMultipleRecordsAsync(TransactioncurrenciesService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return TransactioncurrenciesService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: TransactioncurrenciesService.dataSourceName,
				options
			}
		} });
	}
	static async upload(id, columnName, file, fileDisplayName) {
		const arrayBuffer = await file.arrayBuffer();
		const data = new Uint8Array(arrayBuffer);
		return await TransactioncurrenciesService.client.uploadFileToRecord(TransactioncurrenciesService.dataSourceName, id, columnName, fileDisplayName || file.name, data);
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_countryinflationprofilesService {
	static dataSourceName = "vsb_countryinflationprofiles";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_countryinflationprofilesService.client.createRecordAsync(Vsb_countryinflationprofilesService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_countryinflationprofilesService.client.updateRecordAsync(Vsb_countryinflationprofilesService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_countryinflationprofilesService.client.deleteRecordAsync(Vsb_countryinflationprofilesService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_countryinflationprofilesService.client.retrieveRecordAsync(Vsb_countryinflationprofilesService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_countryinflationprofilesService.client.retrieveMultipleRecordsAsync(Vsb_countryinflationprofilesService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_countryinflationprofilesService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_countryinflationprofilesService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_spvdevcomappingcapexdevexesService {
	static dataSourceName = "vsb_spvdevcomappingcapexdevexes";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_spvdevcomappingcapexdevexesService.client.createRecordAsync(Vsb_spvdevcomappingcapexdevexesService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_spvdevcomappingcapexdevexesService.client.updateRecordAsync(Vsb_spvdevcomappingcapexdevexesService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_spvdevcomappingcapexdevexesService.client.deleteRecordAsync(Vsb_spvdevcomappingcapexdevexesService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_spvdevcomappingcapexdevexesService.client.retrieveRecordAsync(Vsb_spvdevcomappingcapexdevexesService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_spvdevcomappingcapexdevexesService.client.retrieveMultipleRecordsAsync(Vsb_spvdevcomappingcapexdevexesService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_spvdevcomappingcapexdevexesService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_spvdevcomappingcapexdevexesService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_devexcapexstandardassumptionsesService {
	static dataSourceName = "vsb_devexcapexstandardassumptionses";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_devexcapexstandardassumptionsesService.client.createRecordAsync(Vsb_devexcapexstandardassumptionsesService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_devexcapexstandardassumptionsesService.client.updateRecordAsync(Vsb_devexcapexstandardassumptionsesService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_devexcapexstandardassumptionsesService.client.deleteRecordAsync(Vsb_devexcapexstandardassumptionsesService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_devexcapexstandardassumptionsesService.client.retrieveRecordAsync(Vsb_devexcapexstandardassumptionsesService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_devexcapexstandardassumptionsesService.client.retrieveMultipleRecordsAsync(Vsb_devexcapexstandardassumptionsesService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_devexcapexstandardassumptionsesService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_devexcapexstandardassumptionsesService.dataSourceName,
				options
			}
		} });
	}
});
/*!
* Copyright (C) Microsoft Corporation. All rights reserved.
* This file is autogenerated. Do not edit this file directly.
*/
(class Vsb_opexlandleasestandardassumptionsesService {
	static dataSourceName = "vsb_opexlandleasestandardassumptionses";
	static client = getClient(dataSourcesInfo);
	static async create(record) {
		return await Vsb_opexlandleasestandardassumptionsesService.client.createRecordAsync(Vsb_opexlandleasestandardassumptionsesService.dataSourceName, record);
	}
	static async update(id, changedFields) {
		return await Vsb_opexlandleasestandardassumptionsesService.client.updateRecordAsync(Vsb_opexlandleasestandardassumptionsesService.dataSourceName, id, changedFields);
	}
	static async delete(id) {
		await Vsb_opexlandleasestandardassumptionsesService.client.deleteRecordAsync(Vsb_opexlandleasestandardassumptionsesService.dataSourceName, id);
	}
	static async get(id, options) {
		return await Vsb_opexlandleasestandardassumptionsesService.client.retrieveRecordAsync(Vsb_opexlandleasestandardassumptionsesService.dataSourceName, id, options);
	}
	static async getAll(options) {
		return await Vsb_opexlandleasestandardassumptionsesService.client.retrieveMultipleRecordsAsync(Vsb_opexlandleasestandardassumptionsesService.dataSourceName, options);
	}
	static getMetadata(options = {}) {
		return Vsb_opexlandleasestandardassumptionsesService.client.executeAsync({ dataverseRequest: {
			action: "getEntityMetadata",
			parameters: {
				tableName: Vsb_opexlandleasestandardassumptionsesService.dataSourceName,
				options
			}
		} });
	}
});
/** Dataverse `statecode` 0 = Active for every custom table in this solution. */
const ACTIVE = "statecode eq 0";
function createRequestGate(o) {
	const ceiling = Math.max(1, Math.floor(o.ceiling));
	const lane = Math.max(1, Math.min(ceiling, Math.floor(o.writeLane)));
	let active = 0;
	let writes = 0;
	let peak = 0;
	let writePeak = 0;
	const queue = [];
	const pump = () => {
		for (let i = 0; i < queue.length && active < ceiling;) {
			const next = queue[i];
			if (next.write && writes >= lane) {
				i += 1;
				continue;
			}
			queue.splice(i, 1);
			active += 1;
			if (next.write) writes += 1;
			if (active > peak) peak = active;
			if (writes > writePeak) writePeak = writes;
			next.start();
		}
	};
	const run = (write, task) => new Promise((resolve, reject) => {
		const start = () => {
			const done = () => {
				active -= 1;
				if (write) writes -= 1;
				pump();
			};
			new Promise((started) => {
				started(task());
			}).then((value) => {
				done();
				resolve(value);
			}, (error) => {
				done();
				reject(error);
			});
		};
		queue.push({
			write,
			start
		});
		pump();
	});
	return {
		runRead: (task) => run(false, task),
		runWrite: (task) => run(true, task),
		peak: () => peak,
		writePeak: () => writePeak,
		inFlight: () => active,
		writesInFlight: () => writes,
		waiting: () => queue.length,
		reset: () => {
			peak = active;
			writePeak = writes;
		}
	};
}
createRequestGate({
	ceiling: 40,
	writeLane: 24
});
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/data/client.ts
/** Drops keys whose value is undefined, so `{filter: undefined}` never becomes `$filter=`. */
function compact(options) {
	const out = {};
	for (const [k, v] of Object.entries(options)) if (v !== void 0) out[k] = v;
	return out;
}
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 500;
async function fetchAll(operation, page, options) {
	const { maxPages = DEFAULT_MAX_PAGES, ...query } = options;
	const boundedByCaller = options.maxPages !== void 0;
	const rows = [];
	let skipToken;
	let pages = 0;
	const startedAt = performance.now();
	const logRead = (ok, error) => logData({
		kind: "read",
		target: operation,
		rows: rows.length,
		pages,
		ms: performance.now() - startedAt,
		ok,
		...error instanceof Error ? { error: error.message.slice(0, 120) } : {}
	});
	try {
		do {
			const result = await page(compact({
				maxPageSize: DEFAULT_PAGE_SIZE,
				...query,
				...skipToken ? { skipToken } : {}
			}));
			rows.push(...unwrap(result, `${operation} (page ${pages + 1})`));
			skipToken = result.skipToken;
			pages += 1;
			if (pages >= maxPages && skipToken) {
				trace("error", `${operation} stopped after ${pages} pages with more rows available — the filter is too broad`, { rows: rows.length });
				if (!boundedByCaller) throw DataError.deterministic(operation, `more than ${rows.length} rows match, so the read was stopped after ${pages} pages and is incomplete`);
				break;
			}
		} while (skipToken);
	} catch (error) {
		logRead(false, error);
		throw error;
	}
	logRead(true);
	return rows;
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/data/sharedRead.ts
function sharedRead(read, ttlMs, now = Date.now) {
	let entry;
	return {
		get() {
			if (entry) {
				const age = now() - entry.startedAt;
				if (!entry.settled || age < ttlMs) return entry.promise;
			}
			const mine = {
				promise: read(),
				startedAt: now(),
				settled: false
			};
			entry = mine;
			mine.promise.then(() => {
				mine.settled = true;
			}, () => {
				mine.settled = true;
				if (entry === mine) entry = void 0;
			});
			return mine.promise;
		},
		invalidate() {
			entry = void 0;
		}
	};
}
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/data/capexChart.ts
/**
* The CAPEX chart of accounts, read once for the whole Cost side (optimization programme B2, OPT-07c).
*
* Five Cost loaders used to read `vsb_capexaccountlists` each on its own and with no cache: `loadCostAccounts` (every cost
* book, every category tab, every post-save refetch), `loadCapexCategories` (the tab strip), `loadCapexTotals` (the Summary tab),
* the Add Cost from Table sheet and the Contracts screen's `listCapexAccounts`. The Summary tab alone made three identical
* reads. They now take their view of this one read: the ACTIVE rows, with the union of the columns the five need, ordered by
* `vsb_number` (the Contracts screen's order; the other loaders sort the rows themselves by `vsb_order` then `vsb_number`).
*
* FRESHNESS. The read is shared while it runs and remembered for `CAPEX_CHART_MEMO_MS` (30 s, the app's default stale time). Any
* write to a CAPEX account in this session drops the memo: the Application Settings screens call `invalidateCapexChart()` from
* their write path (`data/adminInvalidation.ts`, `invalidateAfterCapexAccountsWrite`, and the save mutation itself), so the Cost
* screens never show a chart older than the last admin edit made in the same tab. Another user's edit shows within 30 s, which
* is inside the staleness the Cost screens' own queries already allow. Set `CAPEX_CHART_MEMO_MS = 0` to keep only the
* coalescing of simultaneous reads.
*
* NOT used by the Application Settings loaders (`adminCapexAccounts.ts`, `adminCost.ts`): they show inactive rows and are
* deliberately read fresh on entry.
*/
/** How long a chart read is reused (ms). `0` = no memo, only in-flight sharing. */
const CAPEX_CHART_MEMO_MS = 3e4;
/** The union of the columns the five Cost-side views read. */
const CHART_SELECT = [
	"vsb_capexaccountlistid",
	"vsb_number",
	"vsb_name",
	"vsb_order",
	"_vsb_parentaccount_value",
	"vsb_accountcategory"
];
sharedRead(() => fetchAll("list CAPEX accounts", (o) => Vsb_capexaccountlistsService.getAll(o), {
	select: CHART_SELECT,
	filter: ACTIVE,
	orderBy: ["vsb_number asc"]
}), CAPEX_CHART_MEMO_MS);
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/data/adminCost.ts
const EXCLUDED_CATEGORY_NAME = OVERLEVERAGING;
/**
* From ONE read, as a pure and immutable derivation (nothing
* shared is mutated). root (`00001`) → category (excl. "Overleveraging") → account → sub-account.
*/
function buildCapexHierarchy(rows) {
	const byOrder = (a, b) => a.order - b.order || a.number.localeCompare(b.number) || a.name.localeCompare(b.name);
	const byParent = /* @__PURE__ */ new Map();
	for (const r of rows) {
		if (r.parentId === void 0) continue;
		const group = byParent.get(r.parentId);
		if (group) group.push(r);
		else byParent.set(r.parentId, [r]);
	}
	for (const group of byParent.values()) group.sort(byOrder);
	const childrenOf = (parentId) => byParent.get(parentId) ?? [];
	const root = rows.find((r) => r.number === CAPEX_ROOT_NUMBER);
	if (!root) return {
		categories: [],
		accounts: [],
		subaccounts: []
	};
	const categories = [];
	const accounts = [];
	const subaccounts = [];
	for (const c of childrenOf(root.id)) {
		if (c.name === EXCLUDED_CATEGORY_NAME) continue;
		categories.push({
			id: c.id,
			name: c.name,
			order: c.order
		});
		for (const a of childrenOf(c.id)) {
			accounts.push({
				id: a.id,
				name: a.name,
				order: a.order,
				categoryId: c.id
			});
			for (const s of childrenOf(a.id)) subaccounts.push({
				id: s.id,
				name: s.name,
				number: s.number,
				order: s.order,
				accountId: a.id,
				accountName: a.name,
				accountOrder: a.order,
				categoryId: c.id,
				categoryOrder: c.order,
				aggregatedName: `${a.name} / ${s.name} ${s.number}`
			});
		}
	}
	return {
		categories,
		accounts,
		subaccounts
	};
}
CONTRACT_TYPE.oAndM, CONTRACT_TYPE.landLease, CONTRACT_TYPE.other;
/**
* `vsb_costunit` labels — `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Items`
* (`Choices('Cost Unit')`), the option labels from customizations.xml (the generated model's
* labels are mangled).
*/
const COST_UNIT_LABEL = {
	[COST_UNIT.eur]: "EUR",
	[COST_UNIT.eurMw]: "EUR/MW(p)",
	[COST_UNIT.eurWtg]: "EUR/WTG",
	[COST_UNIT.pln]: "PLN",
	[COST_UNIT.plnMw]: "PLN/MW(p)",
	[COST_UNIT.plnWtg]: "PLN/WTG"
};
COST_PAID_BY.devCo, COST_PAID_BY.spv;
AGGREGATION.sum, AGGREGATION.max, AGGREGATION.min;
Array.from({ length: 36 }, (_, i) => ({
	value: i,
	label: `${i} ${i <= 1 ? "year" : "years"}`
}));
Array.from({ length: 12 }, (_, i) => ({
	value: i,
	label: `${i} ${i <= 1 ? "month" : "months"}`
}));
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/features/admin/admin-cost/rules.ts
/** `"###,###,###,###"`. */
const fmtInteger = (n) => n === void 0 ? "" : canvasNumberText(n, void 0, { maximumFractionDigits: 0 });
const UNKNOWN_CATEGORY_ID = "__unknown__";
function unitLabel(unit) {
	return unit === void 0 ? "" : COST_UNIT_LABEL[unit] ?? "";
}
/** `lbl_DevexCapex_…_CostsTableHeader_Cluster_1.Text` — `"1,3,5"` for the true cluster flags. */
function clusterText(clusters) {
	return clusters.map((on, i) => on ? String(i + 1) : "").filter(Boolean).join(",");
}
/** `lbl_DevexCapex_…_CostsTableHeader_Cost_1.Text` — `$"{Text(vsb_costamount, "###,###,###,###")} {vsb_unit}"`. */
function costText(amount, unit) {
	return `${fmtInteger(amount)} ${unitLabel(unit)}`.trim();
}
/**
* `img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment.Tooltip` —
* `$"{If(Len(comment) > 0, "Comment:")}⏎{If(Len(comment) > 0, comment, "Add Comment")}"`. The canvas
* text keeps a leading line break when there is no comment; it is not reproduced.
*/
function commentTooltip(comment) {
	return comment.length > 0 ? `Comment:\n${comment}` : "Add Comment";
}
function toDevexRowView(cost, sub) {
	return {
		cost,
		account: sub?.accountName ?? "",
		subaccount: sub ? `${sub.name} - ${sub.number}` : "",
		description: cost.descriptionInput,
		costText: costText(cost.costAmount, cost.unit),
		clusterText: clusterText(cost.clusters),
		commentTooltip: commentTooltip(cost.comment),
		hasComment: cost.comment.length > 0
	};
}
/**
* `btn_Filter_Devex_Capex_Assumptions.OnSelect` (hidden, Select()-ed): one header per category
* that has costs (category order), its costs ordered by account order then sub-account order.
* DIVERGENCE: costs under a category outside the active hierarchy (e.g. deactivated) are listed
* last under "(Unknown category)" rather than dropped, as the canvas grouping by category does.
*/
function buildDevexTree(costs, hierarchy) {
	const subById = new Map(hierarchy.subaccounts.map((s) => [s.id, s]));
	const known = new Set(hierarchy.categories.map((c) => c.id));
	const sortKey = (c) => {
		const s = c.subaccountId ? subById.get(c.subaccountId) : void 0;
		return [
			s?.accountOrder ?? Number.MAX_SAFE_INTEGER,
			s?.order ?? Number.MAX_SAFE_INTEGER,
			c.descriptionInput
		];
	};
	const sorted = [...costs].sort((a, b) => {
		const ka = sortKey(a);
		const kb = sortKey(b);
		return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
	});
	const view = (c) => toDevexRowView(c, c.subaccountId ? subById.get(c.subaccountId) : void 0);
	const groups = [];
	for (const category of hierarchy.categories) {
		const rows = sorted.filter((c) => c.categoryId === category.id).map(view);
		if (rows.length > 0) groups.push({
			categoryId: category.id,
			categoryName: category.name,
			rows
		});
	}
	const orphans = sorted.filter((c) => !c.categoryId || !known.has(c.categoryId)).map(view);
	if (orphans.length > 0) groups.push({
		categoryId: UNKNOWN_CATEGORY_ID,
		categoryName: "(Unknown category)",
		rows: orphans
	});
	return groups;
}
ES_ADMIN.devexCapexStandardAssumptions;
AGGREGATION.sum, AGGREGATION.max, AGGREGATION.min;
//#endregion
//#region ../../../../ProjectCosts-CodeApp/src/features/admin/admin-gates-approvals/rules.ts
/** Global choice `vsb_approvalmode`. */
const MODE = {
	Formal: 95285e4,
	Local: 952850001,
	OnlyNotifications: 952850002
};
MODE.Formal, MODE.Local, MODE.OnlyNotifications;
const byOrder = (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
/**
* A checklist task is shown — as a nested row or as an Add Task option —
* only while it is active and not marked "To Delete" by Check List Settings.
* DIVERGENCE: the canvas filters neither (`gal_…_ChecklistDefaultApprovals.Items`,
* `drp_…_State_1.Items` and `but_…_Row_Edit_3.DisplayMode` read every `Project Default Checklists`
* row of the scope), so it lists inactive and "To Delete" tasks too (doc 09 §2).
*/
const isShownChecklist = (c) => c.active && !c.toDelete;
function buildTaskIndex(data) {
	const firstChecklistById = /* @__PURE__ */ new Map();
	for (const c of data.checklists) {
		if (!c.id) continue;
		const key = c.id.toLowerCase();
		if (!firstChecklistById.has(key)) firstChecklistById.set(key, c);
	}
	const approvedChecklistIds = /* @__PURE__ */ new Set();
	const tasksByState = /* @__PURE__ */ new Map();
	for (const approval of data.approvals) {
		if (!approval.checklistId) continue;
		const key = approval.checklistId.toLowerCase();
		approvedChecklistIds.add(key);
		const checklist = firstChecklistById.get(key);
		if (checklist && isShownChecklist(checklist) && checklist.stateId) {
			const stateKey = checklist.stateId.toLowerCase();
			const bucket = tasksByState.get(stateKey);
			if (bucket) bucket.push({
				approval,
				checklist
			});
			else tasksByState.set(stateKey, [{
				approval,
				checklist
			}]);
		}
	}
	const candidatesByState = /* @__PURE__ */ new Map();
	for (const c of data.checklists) {
		if (!isShownChecklist(c) || !c.stateId) continue;
		if (c.id && approvedChecklistIds.has(c.id.toLowerCase())) continue;
		const stateKey = c.stateId.toLowerCase();
		const bucket = candidatesByState.get(stateKey);
		if (bucket) bucket.push(c);
		else candidatesByState.set(stateKey, [c]);
	}
	for (const bucket of tasksByState.values()) bucket.sort((a, b) => byOrder(a.checklist, b.checklist));
	for (const bucket of candidatesByState.values()) bucket.sort(byOrder);
	const NONE = [];
	return {
		tasksOf: (state) => state.id ? tasksByState.get(state.id.toLowerCase()) ?? NONE : NONE,
		candidatesOf: (state) => state.id ? candidatesByState.get(state.id.toLowerCase()) ?? NONE : NONE,
		canAdd: (state) => state.id ? (candidatesByState.get(state.id.toLowerCase())?.length ?? 0) > 0 : false
	};
}
ES_PROCESS.projectDefaultApprovals;
CHECKLIST_ENTITY_SETS.approvals;
//#endregion
//#region bench.ts
const t = (label, fn, reps = 20) => {
	fn();
	const s = performance.now();
	for (let i = 0; i < reps; i++) fn();
	console.log(`${label}: ${((performance.now() - s) / reps).toFixed(3)} ms/call`);
};
const id = (p, n) => `${p}-${String(n).padStart(8, "0")}-0000-0000-000000000000`;
const rows = [{
	id: id("r", 0),
	number: "00001",
	name: "root",
	order: 0,
	active: true,
	parentId: null
}];
for (let c = 0; c < 10; c++) rows.push({
	id: id("c", c),
	number: `1${c}`,
	name: `cat${c}`,
	order: c,
	active: true,
	parentId: id("r", 0)
});
for (let a = 0; a < 100; a++) rows.push({
	id: id("a", a),
	number: `2${a}`,
	name: `acc${a}`,
	order: a,
	active: true,
	parentId: id("c", a % 10)
});
for (let s = 0; s < 5e3; s++) rows.push({
	id: id("s", s),
	number: `3${s}`,
	name: `sub${s}`,
	order: s,
	active: s % 7 !== 0,
	parentId: id("a", s % 100)
});
t(`buildCapexTree ${rows.length} rows`, () => buildCapexTree(rows));
const hrows = rows.map((r) => ({
	id: r.id,
	name: r.name,
	number: r.number,
	order: r.order,
	parentId: r.parentId ?? void 0
}));
t(`buildCapexHierarchy ${hrows.length} rows`, () => buildCapexHierarchy(hrows));
const hier = buildCapexHierarchy(hrows);
const costs = [];
for (let i = 0; i < 3e3; i++) {
	const s = hier.subaccounts[i % hier.subaccounts.length];
	costs.push({
		id: id("d", i),
		description: `d${i}`,
		descriptionInput: `d${i}`,
		clusters: [
			true,
			false,
			true,
			false,
			true
		],
		costAmount: i,
		unit: 1,
		costPaidBy: 1,
		comment: i % 3 ? "x" : "",
		countryId: "c",
		technology: 1,
		categoryId: s.categoryId,
		subaccountId: s.id
	});
}
t(`buildDevexTree ${costs.length} costs`, () => buildDevexTree(costs, hier));
const checklists = [];
const approvals = [];
for (let i = 0; i < 250; i++) {
	checklists.push({
		id: id("k", i),
		name: `t${i}`,
		order: i,
		stateId: id("st", i % 6),
		active: true,
		toDelete: false
	});
	approvals.push({
		id: id("p", i),
		checklistId: id("k", i),
		name: "",
		mode: 1,
		gateActive: true,
		pmId: null,
		contributors: null,
		approvers: null,
		notifications: null
	});
}
t("buildTaskIndex 250+250", () => buildTaskIndex({
	checklists,
	approvals
}));
//#endregion
export {};
