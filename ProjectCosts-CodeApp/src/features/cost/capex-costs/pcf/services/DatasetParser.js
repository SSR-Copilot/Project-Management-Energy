/**
 * Service class responsible for data transformation.
 * Parses the flat Dataverse/Canvas App dataset into a nested tree structure.
 *
 * Stateless (all static): every call re-derives the field mapping from the live
 * dataset columns, so Canvas can rename/alias columns without a PCF rebuild.
 */
export class DatasetParser {
    /**
     * Parses the flat sampleDataSet records and maps them to a hierarchical tree.
     *
     * Two-pass algorithm: pass 1 buckets every record into accounts/subaccounts/
     * contracts keyed by normalized RowId; pass 2 stitches children onto parents
     * via ParentId. Child order inside each parent follows dataset.sortedRecordIds
     * (i.e. the Canvas collection order) — sorting is a Canvas responsibility.
     * Orphans (ParentId with no matching RowId) are dropped without warning.
     */
    static parseDatasetToTree(dataset) {
        const columns = dataset.columns;
        // Dynamically find field names in a case-insensitive manner
        // Canonical defaults double as last-resort field names if no column matches.
        // Empty-string defaults (costPaidByField, isStandardContractField, ...) mean
        // "not detected" — firstAvailableValue()/safeGetValue() skip empty names, so
        // the hard-coded per-record alias lists further down still get a chance.
        let rowIdField = "RowId";
        let parentIdField = "ParentId";
        let typeField = "Type";
        let numberField = "Number";
        let nameField = "Name";
        let subLabelField = "SubLabel";
        let costPaidByField = "";
        let totalCostField = "TotalCost";
        let plannedCostField = "PlannedCost";
        let actualCostField = "ActualCost";
        let isAccountField = "";
        let isContractField = "";
        let isStandardContractField = "";
        let standardContractOptionsField = "";
        let distributionTypeField = "";
        let commentTooltipField = "";
        // Index 0..11 = Jan..Dec of the SELECTED year. mFields pre-seeds "M1".."M12";
        // the paid/comment arrays start empty and are only filled when a real column
        // is detected (empty = rely on per-record alias probing instead).
        const mFields = Array(12).fill("").map((_, i) => `M${i + 1}`);
        const monthPaidFields = Array(12).fill("");
        const monthHasCommentFields = Array(12).fill("");
        const monthCommentTooltipFields = Array(12).fill("");
        // Single pass over dataset columns: resolve each logical field to the column
        // name actually present in THIS dataset. normalizeFieldName strips casing and
        // punctuation so "vsb_IsStandardContract", "Is Standard Contract" and
        // "isstandardcontract" all collapse to the same alias key.
        columns.forEach(col => {
            const lowerName = col.name.toLowerCase();
            const normalizedName = this.normalizeFieldName(col.name);
            // RowId aliases include the Dataverse primary keys of BOTH source tables
            // (capexaccountlist for accounts/subaccounts, capexprojectcontract for
            // contracts) because row types originate from different entities.
            if (["rowid", "id", "vsbcapexaccountlistid", "capexaccountlist", "capexprojectcontract"].includes(normalizedName))
                rowIdField = col.name;
            else if (["parentid", "vsbparentaccountid", "parentaccount"].includes(normalizedName))
                parentIdField = col.name;
            else if (normalizedName === "type")
                typeField = col.name;
            else if (normalizedName === "number" || normalizedName === "vsbnumber")
                numberField = col.name;
            else if (["name", "vsbname", "vsbcostdescription", "costdescription"].includes(normalizedName))
                nameField = col.name;
            else if (normalizedName === "sublabel")
                subLabelField = col.name;
            else if (["costpaidby", "costpaidbyfilter", "vsbcostpaidby", "costtype", "vsbcosttype"].includes(normalizedName))
                costPaidByField = col.name;
            else if (["totalcost", "totalcosts", "vsbtotalcost", "totalcostamount"].includes(normalizedName))
                totalCostField = col.name;
            else if (["plannedcost", "totalplannedcost", "totalplannedcosts"].includes(normalizedName))
                plannedCostField = col.name;
            else if (["actualcost", "totalactualcost", "totalactualcosts"].includes(normalizedName))
                actualCostField = col.name;
            else if (normalizedName === "isaccount")
                isAccountField = col.name;
            else if (normalizedName === "iscontract")
                isContractField = col.name;
            // Standard-contract flag arrives under many names depending on whether a
            // Canvas collection column, a Dataverse logical name (vsb_*) or a display
            // name is bound. Removing ANY alias silently breaks standard-contract
            // detection for the data shape that uses it.
            else if ([
                "isstandardcontract",
                "standardcontract",
                "isstandard",
                "isstandardcost",
                "standardcost",
                "contracttype",
                "standardcontracttype",
                "vsbisstandardcontract",
                "vsbisstandardcost",
                "vsb_isstandardcontract",
                "vsb_isstandardcost"
            ].includes(normalizedName))
                isStandardContractField = col.name;
            else if (["standardcontractoptions", "standardcontracts", "availablestandardcontracts"].includes(normalizedName))
                standardContractOptionsField = col.name;
            // DistributionType gates the month paid/unpaid action in the grid, so its
            // alias list must cover every spelling Canvas/Dataverse can emit.
            else if ([
                "distributiontype",
                "distribution",
                "costdistributiontype",
                "contractdistributiontype",
                "vsbdistributiontype",
                "vsbcostdistributiontype",
                "vsb_distributiontype"
            ].includes(normalizedName))
                distributionTypeField = col.name;
            // Contract-level comment tooltip: long alias list because this column was
            // renamed several times in the Canvas collection over the project history.
            else if ([
                "commenttooltip",
                "generalcommenttooltip",
                "contractcommenttooltip",
                "commenttext",
                "commentdescription",
                "generalcomment",
                "contractcomment",
                "latestcomment",
                "commentsummary"
            ].includes(normalizedName))
                commentTooltipField = col.name;
            // Month-indexed columns: cost value (M{i}/Month{i}), paid flag (8 alias
            // spellings: M{i}Paid, Month{i}Paid, M{i}IsPaid, PaidM{i}, CostPaidM{i}, ...),
            // month-level comment flag, and month-level comment tooltip. These alias
            // families must stay in sync with whatever the Canvas AddColumns() emits;
            // resolving them once here keeps the hot per-record loop cheap.
            for (let i = 1; i <= 12; i++) {
                if (normalizedName === `m${i}` || normalizedName === `month${i}`) {
                    mFields[i - 1] = col.name;
                }
                else if (normalizedName === `m${i}paid`
                    || normalizedName === `m${i}ispaid`
                    || normalizedName === `month${i}paid`
                    || normalizedName === `month${i}ispaid`
                    || normalizedName === `ispaidm${i}`
                    || normalizedName === `paidm${i}`
                    || normalizedName === `costpaidm${i}`
                    || normalizedName === `m${i}costpaid`) {
                    monthPaidFields[i - 1] = col.name;
                }
                else if (normalizedName === `m${i}hascomments`
                    || normalizedName === `m${i}hascomment`
                    || normalizedName === `month${i}hascomments`
                    || normalizedName === `month${i}hascomment`
                    || normalizedName === `hascommentsm${i}`
                    || normalizedName === `hascommentm${i}`) {
                    monthHasCommentFields[i - 1] = col.name;
                }
                else if (normalizedName === `m${i}commenttooltip`
                    || normalizedName === `m${i}comments`
                    || normalizedName === `m${i}comment`
                    || normalizedName === `month${i}commenttooltip`
                    || normalizedName === `month${i}comments`
                    || normalizedName === `month${i}comment`
                    || normalizedName === `commentm${i}`
                    || normalizedName === `commentsm${i}`) {
                    monthCommentTooltipFields[i - 1] = col.name;
                }
            }
        });
        // Pass-1 buckets, keyed by normalized RowId so pass 2 can resolve ParentId
        // references in O(1). Contracts go to a plain list — nothing references a
        // contract by id, so no map is needed for them.
        const accountsMap = new Map();
        const subaccountsMap = new Map();
        const contractsList = [];
        // Parse records
        dataset.sortedRecordIds.forEach(id => {
            const record = dataset.records[id];
            // ---- Core identity fields ----
            // rowId falls back to the PCF record id (`|| id`) so a row missing RowId
            // still gets a stable map key. normalizeId trims/lowercases GUIDs so the
            // ParentId → RowId matching in pass 2 survives the mixed casing that
            // Dataverse and Canvas produce; BOTH sides must use the same normalization.
            const type = this.parseText(this.firstAvailableValue(record, [typeField, "Type", "type"]));
            const rowId = this.normalizeId(this.firstAvailableValue(record, [rowIdField, "RowId", "rowId", "ID", "id"]) || id);
            const parentId = this.normalizeId(this.firstAvailableValue(record, [parentIdField, "ParentId", "parentId"]));
            const num = this.parseText(this.firstAvailableValue(record, [numberField, "Number", "number"]));
            // SubLabel can carry ||KEY=value|| metadata tokens (||STD=..||, ||PAID=..||).
            // Keep rawSubLabel for token extraction below; strip the tokens from the
            // user-visible subLabel so the metadata never renders in the grid.
            const rawSubLabel = this.parseText(this.firstAvailableValue(record, [subLabelField, "SubLabel", "subLabel"]));
            const subLabel = this.removeMetaTokens(rawSubLabel);
            // CostPaidBy is DevCo or SPV. If the dedicated column is missing/empty it
            // is recoverable from a "[DevCo]"/"[SPV]" tag inside SubLabel — hence the
            // cleaned subLabel is passed in as fallback search text.
            const costPaidBy = this.parseCostPaidBy(this.firstAvailableValue(record, [
                costPaidByField,
                "CostPaidBy",
                "costPaidBy",
                "CostPaidByText",
                "CostType",
                "costType"
            ]), subLabel);
            let name = this.parseText(this.firstAvailableValue(record, [nameField, "Name", "name"]));
            // Fallbacks for name in case field mappings are different per type
            if (!name) {
                name = this.parseText(this.firstAvailableValue(record, [
                    "vsb_costdescription",
                    "vsb_name",
                    "Name",
                    "name"
                ]));
            }
            // ---- Standard-contract detection: three independent paths, OR-ed ----
            // 1) any boolean-ish value from the alias columns below (choice columns
            //    arrive as bool/0-1/label/object depending on the binding),
            // 2) a ||STD=1|| (or ||STD=true||) metadata token inside SubLabel,
            // 3) a name starting with "Standard " as a last-resort fallback.
            // All three exist because no single source is reliable across Canvas and
            // Dataverse shapes — do not remove a path without testing every source.
            const rawIsStandardContract = this.firstAvailableValue(record, [
                isStandardContractField,
                "IsStandardContract",
                "isStandardContract",
                "IsStandard",
                "isStandard",
                "StandardCost",
                "standardCost",
                "StandardContract",
                "standardContract"
            ]);
            const standardMeta = this.extractMetaValue(rawSubLabel, "STD");
            const isStandardContract = this.parseBoolean(rawIsStandardContract)
                || standardMeta === "1"
                || standardMeta.toLowerCase() === "true"
                || name.toLowerCase().trim().startsWith("standard ");
            // DistributionType (Individual / Equal / Cluster-distributed) decides
            // whether the month paid/unpaid action is allowed downstream. When no
            // dedicated column exists, recover it by scanning the SubLabel text.
            const distributionType = this.parseText(this.firstAvailableValue(record, [
                distributionTypeField,
                "DistributionType",
                "distributionType",
                "Distribution",
                "distribution"
            ])) || this.parseDistributionTypeFromText(subLabel);
            // M1..M12 = monthly costs for the SELECTED YEAR ONLY. These feed the month
            // cells, never the all-years totals (see the TotalCost handling below).
            const months = mFields.map((fieldName, index) => this.parseNumber(this.firstAvailableValue(record, [
                fieldName,
                `M${index + 1}`,
                `m${index + 1}`,
                `Month${index + 1}`,
                `month${index + 1}`
            ])));
            // Paid-month flags: try the detected column first, then every known alias
            // spelling (M{n}Paid, Month{n}Paid, M{n}IsPaid, PaidM{n}, CostPaidM{n},
            // M{n}CostPaid) because different Canvas iterations used different names.
            const monthPaidFromFields = monthPaidFields.map((fieldName, index) => {
                const monthNo = index + 1;
                return this.parseBoolean(this.firstAvailableValue(record, [
                    fieldName,
                    `M${monthNo}Paid`,
                    `m${monthNo}Paid`,
                    `Month${monthNo}Paid`,
                    `month${monthNo}Paid`,
                    `M${monthNo}IsPaid`,
                    `PaidM${monthNo}`,
                    `CostPaidM${monthNo}`,
                    `M${monthNo}CostPaid`
                ]));
            });
            // A ||PAID=1,2,3|| SubLabel token is an alternative paid-month source; a
            // month counts as paid if EITHER the column OR the token says so.
            const monthPaidFromSubLabel = this.parsePaidMonthsFromSubLabel(rawSubLabel);
            const monthPaid = monthPaidFromFields.map((fieldValue, index) => fieldValue || monthPaidFromSubLabel[index]);
            // Contract-level tooltip text. parseCommentTooltip rejects boolean-looking
            // values so a HasComments flag accidentally bound to one of these aliases
            // cannot render "true" as the tooltip.
            const commentTooltip = this.parseCommentTooltip(this.firstAvailableValue(record, [
                commentTooltipField,
                "CommentTooltip",
                "commentTooltip",
                "GeneralCommentTooltip",
                "generalCommentTooltip",
                "ContractCommentTooltip",
                "contractCommentTooltip",
                "CommentText",
                "commentText",
                "CommentDescription",
                "commentDescription",
                "GeneralComment",
                "generalComment",
                "ContractComment",
                "contractComment",
                "LatestComment",
                "latestComment",
                "Comment",
                "comment",
                "Comments",
                "comments"
            ]));
            // Month-level tooltips (M{n}CommentTooltip and friends). Computed BEFORE
            // monthHasComments because a non-empty tooltip implies the month has
            // comments even when the explicit flag column is absent.
            const monthCommentTooltips = monthCommentTooltipFields.map((fieldName, index) => {
                const monthNo = index + 1;
                return this.parseCommentTooltip(this.firstAvailableValue(record, [
                    fieldName,
                    `M${monthNo}CommentTooltip`,
                    `m${monthNo}CommentTooltip`,
                    `M${monthNo}Comment`,
                    `m${monthNo}Comment`,
                    `M${monthNo}Comments`,
                    `m${monthNo}Comments`,
                    `Month${monthNo}CommentTooltip`,
                    `month${monthNo}CommentTooltip`,
                    `Month${monthNo}Comment`,
                    `month${monthNo}Comment`,
                    `Month${monthNo}Comments`,
                    `month${monthNo}Comments`,
                    `CommentM${monthNo}`,
                    `commentM${monthNo}`,
                    `CommentsM${monthNo}`,
                    `commentsM${monthNo}`
                ]));
            });
            // Month "has comments" = explicit flag (any alias) OR a non-empty tooltip
            // for that month — flag columns are frequently missing from the collection.
            const monthHasComments = monthHasCommentFields.map((fieldName, index) => {
                const monthNo = index + 1;
                return this.parseBoolean(this.firstAvailableValue(record, [
                    fieldName,
                    `M${monthNo}HasComments`,
                    `m${monthNo}HasComments`,
                    `M${monthNo}HasComment`,
                    `m${monthNo}HasComment`,
                    `Month${monthNo}HasComments`,
                    `month${monthNo}HasComments`,
                    `Month${monthNo}HasComment`,
                    `month${monthNo}HasComment`,
                    `HasCommentsM${monthNo}`,
                    `hasCommentsM${monthNo}`,
                    `HasCommentM${monthNo}`,
                    `hasCommentM${monthNo}`
                ])) || monthCommentTooltips[index].length > 0;
            });
            // ---- ALL-YEARS totals (critical semantics) ----
            // TotalCost / PlannedCost / ActualCost are computed in Canvas across ALL
            // years. Summing M1..M12 here would only cover the selected year — that
            // exact mistake was a past bug — so visibleYearTotal is used ONLY when the
            // TotalCost column is genuinely absent/empty for the row.
            const visibleYearTotal = months.reduce((sum, monthCost) => sum + monthCost, 0);
            const rawTotal = this.firstAvailableValue(record, [totalCostField, "TotalCost", "totalCost", "TotalCosts", "totalCosts"]);
            const total = rawTotal === null || rawTotal === undefined || rawTotal === ""
                ? visibleYearTotal
                : this.parseNumber(rawTotal);
            const planned = this.parseNumber(this.firstAvailableValue(record, [plannedCostField, "PlannedCost", "plannedCost", "TotalPlannedCost", "totalPlannedCost"]));
            const actual = this.parseNumber(this.firstAvailableValue(record, [actualCostField, "ActualCost", "actualCost", "TotalActualCost", "totalActualCost"]));
            // Dynamically search for comment markers
            // Contract-level "has comments": first via alias list, then by re-scanning
            // the actual columns case-insensitively (covers a Comments column the alias
            // probe could miss). NOTE: the column re-scan OVERWRITES the alias result.
            // Finally, a non-empty tooltip always implies comments exist.
            let hasComments = this.parseBoolean(this.firstAvailableValue(record, [
                "HasComments",
                "hasComments",
                "Comments",
                "comments",
                "Comment",
                "comment"
            ]));
            columns.forEach(col => {
                const lowerCol = col.name.toLowerCase();
                if (lowerCol === "hascomments" || lowerCol === "comments" || lowerCol === "comment") {
                    const rawVal = this.safeGetValue(record, col.name);
                    hasComments = rawVal === true || rawVal === "true" || rawVal === 1 || Number(rawVal) > 0;
                }
            });
            hasComments = hasComments || commentTooltip.length > 0;
            // Determine item type
            // The Type column ("account"/"subaccount"/"contract") normally decides the
            // bucket. Legacy datasets without Type fall back to IsAccount/IsContract
            // flags, defaulting to "subaccount" when neither flag is set — changing
            // this default reclassifies untyped rows and breaks the hierarchy.
            let finalType = type.toLowerCase();
            if (!finalType) {
                const isAccountVal = isAccountField ? this.safeGetValue(record, isAccountField) : null;
                const isContractVal = isContractField ? this.safeGetValue(record, isContractField) : null;
                const isAccount = isAccountVal === true || isAccountVal === "true" || isAccountVal === 1;
                const isContract = isContractVal === true || isContractVal === "true" || isContractVal === 1;
                if (isAccount) {
                    finalType = "account";
                }
                else if (isContract) {
                    finalType = "contract";
                }
                else {
                    finalType = "subaccount";
                }
            }
            if (finalType === "account") {
                accountsMap.set(rowId, {
                    id: rowId,
                    number: num,
                    name: name,
                    totalCost: total,
                    plannedCost: planned,
                    actualCost: actual,
                    months: months,
                    subaccounts: []
                });
            }
            else if (finalType === "subaccount") {
                subaccountsMap.set(rowId, {
                    id: rowId,
                    parentId: parentId,
                    number: num,
                    name: name,
                    totalCost: total,
                    plannedCost: planned,
                    actualCost: actual,
                    months: months,
                    // Options embedded inline on the subaccount row (JSON or
                    // "id|name;id2|name2" text); the separate StandardContractOptions
                    // dataset (parseStandardContractOptionsDataset) can supply them too.
                    standardContractOptions: this.parseStandardContractOptions(this.firstAvailableValue(record, [
                        standardContractOptionsField,
                        "StandardContractOptions",
                        "standardContractOptions",
                        "StandardContracts",
                        "standardContracts",
                        "AvailableStandardContracts",
                        "availableStandardContracts"
                    ])),
                    contracts: []
                });
            }
            else if (finalType === "contract") {
                contractsList.push({
                    id: rowId,
                    parentId: parentId,
                    number: num,
                    name: name,
                    subLabel: subLabel,
                    costPaidBy: costPaidBy,
                    totalCost: total,
                    plannedCost: planned,
                    actualCost: actual,
                    hasComments: hasComments,
                    commentTooltip: commentTooltip,
                    isStandardContract: isStandardContract,
                    distributionType: distributionType,
                    months: months,
                    monthPaid: monthPaid,
                    monthHasComments: monthHasComments,
                    monthCommentTooltips: monthCommentTooltips
                });
            }
        });
        // ---- Pass 2: stitch children onto parents via normalized ParentId ----
        // A contract/subaccount whose ParentId matches no known RowId is silently
        // discarded (no orphan bucket, no warning). If rows vanish from the grid,
        // first check ParentId values/casing in the Canvas collection.
        // Nest relations (Contracts -> Subaccounts)
        contractsList.forEach(c => {
            const sub = subaccountsMap.get(c.parentId);
            if (sub)
                sub.contracts.push(c);
        });
        // Nest relations (Subaccounts -> Accounts)
        subaccountsMap.forEach(sub => {
            const acc = accountsMap.get(sub.parentId);
            if (acc)
                acc.subaccounts.push(sub);
        });
        // Map preserves insertion order, so accounts render in dataset (Canvas) order.
        return Array.from(accountsMap.values());
    }
    /**
     * Parses the secondary `StandardContractOptions` dataset (Canvas collection
     * `colStandardContractOptionsForPCF`) into a lookup keyed by SUBACCOUNT RowId.
     *
     * Each row represents one standard contract offered for one subaccount:
     *   - StandardContractId — aliases include the Dataverse primary key
     *     vsb_devexcapexstandardassumptionsid / devexcapexstandardassumptions / id.
     *   - SubaccountId — aliases vsb_subaccountid / capexaccountlist / subaccount.
     *     This value MUST equal the subaccount's RowId in the main dataset (after
     *     normalizeId lowercasing) or the option will never appear in the grid.
     *   - Name — aliases description / vsb_description / itemdisplayname; when the
     *     name is blank, a vsb_autoid column synthesises "Standard Contract {n}".
     *
     * Rows missing id, subaccountId or name are skipped entirely. Returns an empty
     * map while the dataset is still loading so callers render without options
     * instead of crashing mid-refresh.
     */
    static parseStandardContractOptionsDataset(dataset) {
        const optionsBySubaccount = new Map();
        if (!dataset || dataset.loading) {
            return optionsBySubaccount;
        }
        let standardContractIdField = "StandardContractId";
        let subaccountIdField = "SubaccountId";
        let nameField = "Name";
        let autoIdField = "";
        dataset.columns.forEach(col => {
            const lowerName = col.name.toLowerCase();
            const normalizedName = this.normalizeFieldName(col.name);
            if (normalizedName === "standardcontractid"
                || normalizedName === "vsbdevexcapexstandardassumptionsid"
                || normalizedName === "devexcapexstandardassumptions"
                || normalizedName === "devexcapexstandardassumptionsid"
                || normalizedName === "id") {
                standardContractIdField = col.name;
            }
            else if (normalizedName === "subaccountid"
                || normalizedName === "vsbsubaccountid"
                || normalizedName === "capexaccountlist"
                || normalizedName === "subaccount") {
                subaccountIdField = col.name;
            }
            else if (normalizedName === "name"
                || normalizedName === "description"
                || normalizedName === "vsbdescription"
                || normalizedName === "descriptioninput"
                || normalizedName === "itemdisplayname") {
                nameField = col.name;
            }
            else if (normalizedName === "autoid" || lowerName === "vsb_autoid") {
                autoIdField = col.name;
            }
        });
        dataset.sortedRecordIds.forEach(recordId => {
            const record = dataset.records[recordId];
            // Ids are normalized to lowercase so they match the subaccount RowIds
            // produced by parseDatasetToTree; the PCF record id is the id fallback.
            // (Raw getValue is used here, unlike the safeGetValue probing elsewhere,
            // because the resolved/default column names are expected to exist.)
            const id = this.normalizeId(record.getValue(standardContractIdField) || recordId);
            const subaccountId = this.normalizeId(record.getValue(subaccountIdField));
            const autoId = autoIdField ? (record.getValue(autoIdField) || "").toString().trim() : "";
            const name = (record.getValue(nameField) || (autoId ? `Standard Contract ${autoId}` : "")).toString().trim();
            // Incomplete rows are dropped: an option without a subaccount link or a
            // display name could never be selected/rendered meaningfully anyway.
            if (!id || !subaccountId || !name) {
                return;
            }
            const existingOptions = optionsBySubaccount.get(subaccountId) || [];
            existingOptions.push({ id, name });
            optionsBySubaccount.set(subaccountId, existingOptions);
        });
        return optionsBySubaccount;
    }
    /**
     * Parses standard-contract options embedded in a SINGLE dataset cell on a
     * subaccount row. Two encodings are accepted because Canvas changed the
     * format over time:
     *   1) a JSON array of objects — ids under id/Id/guid/
     *      ItemGUIDForLoadingStandardContract, names under name/Name/description/
     *      ItemDisplayName;
     *   2) legacy delimited text "id|name;id2|name2" (the name part may itself
     *      contain "|", hence the nameParts.join("|") below).
     * Ids are lowercased to stay comparable with normalizeId() output elsewhere.
     * Options missing either id or name are filtered out.
     */
    static parseStandardContractOptions(value) {
        if (value === null || value === undefined) {
            return [];
        }
        const rawValue = value.toString().trim();
        if (!rawValue) {
            return [];
        }
        try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
                return parsed
                    .map(item => ({
                    id: (item.id || item.Id || item.guid || item.ItemGUIDForLoadingStandardContract || "").toString().trim().toLowerCase(),
                    name: (item.name || item.Name || item.description || item.ItemDisplayName || "").toString().trim()
                }))
                    .filter(option => option.id && option.name);
            }
        }
        catch {
            // Non-JSON values are parsed below as id|name;id2|name2.
        }
        return rawValue
            .split(";")
            .map(part => {
            const [id, ...nameParts] = part.split("|");
            return {
                id: (id || "").trim().toLowerCase(),
                name: nameParts.join("|").trim()
            };
        })
            .filter(option => option.id && option.name);
    }
    /**
     * getValue() that never throws. The PCF dataset API may THROW or return
     * undefined for columns that are not part of the dataset (behaviour varies by
     * host/runtime version), and this parser deliberately probes many speculative
     * alias names per record — so every probe must be exception-safe. An empty
     * fieldName (an undetected optional column) short-circuits to null.
     */
    static safeGetValue(record, fieldName) {
        if (!fieldName) {
            return null;
        }
        try {
            return record.getValue(fieldName);
        }
        catch {
            return null;
        }
    }
    /**
     * getFormattedValue() that never throws, for the same reason as safeGetValue:
     * probing alias columns that may not exist must not crash the whole parse.
     * Normalizes null/undefined to "" so callers can treat "" as "no value".
     */
    static safeGetFormattedValue(record, fieldName) {
        if (!fieldName) {
            return "";
        }
        try {
            return record.getFormattedValue(fieldName) || "";
        }
        catch {
            return "";
        }
    }
    /**
     * Returns the first non-empty value among candidate column names — callers
     * pass the column resolved from the dataset first, then hard-coded aliases.
     * Per candidate, the RAW value is preferred (preserves numbers/booleans/choice
     * objects) and the FORMATTED value is only a fallback, because some hosts only
     * populate formatted text (e.g. choice labels). null/undefined/"" count as
     * "missing" so later aliases still get a chance; empty names are skipped
     * (that is what makes the ""-default field variables safe to pass in).
     */
    static firstAvailableValue(record, fieldNames) {
        for (const fieldName of fieldNames) {
            if (!fieldName) {
                continue;
            }
            const value = this.safeGetValue(record, fieldName);
            if (value !== null && value !== undefined && value !== "") {
                return value;
            }
            const formattedValue = this.safeGetFormattedValue(record, fieldName);
            if (formattedValue) {
                return formattedValue;
            }
        }
        return null;
    }
    /**
     * Reads one `||KEY=value||` metadata token out of a SubLabel string. These
     * tokens let Canvas piggyback extra flags (STD, PAID, ...) on an existing text
     * column when adding a real column to the collection is impractical. The key
     * is regex-escaped, matching is case-insensitive, and the value cannot
     * contain "|" (it would terminate the token). Returns "" when absent.
     */
    static extractMetaValue(source, key) {
        if (!source || !key) {
            return "";
        }
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = source.match(new RegExp(`\\|\\|\\s*${escapedKey}\\s*=\\s*([^|]+?)\\s*\\|\\|`, "i"));
        return match ? match[1].trim() : "";
    }
    /**
     * Strips ALL ||KEY=value|| tokens from SubLabel so end users never see the
     * smuggled metadata, then collapses leftover whitespace. Must stay in sync
     * with the token format consumed by extractMetaValue.
     */
    static removeMetaTokens(source) {
        return (source || "")
            .replace(/\|\|\s*[^|=]+?\s*=\s*[^|]*?\s*\|\|/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }
    /**
     * Decodes a ||PAID=1,2,3|| SubLabel token into a 12-slot boolean array
     * (index 0 = January). Out-of-range or non-integer entries are ignored rather
     * than failing the row. Result is OR-ed with the M{n}Paid columns by the
     * caller, so this is purely an additional "paid" source, never a veto.
     */
    static parsePaidMonthsFromSubLabel(subLabel) {
        const paidMonths = Array(12).fill(false);
        const paidMeta = this.extractMetaValue(subLabel, "PAID");
        if (!paidMeta) {
            return paidMonths;
        }
        paidMeta
            .split(",")
            .map(part => Number(part.trim()))
            .filter(monthNo => Number.isInteger(monthNo) && monthNo >= 1 && monthNo <= 12)
            .forEach(monthNo => {
            paidMonths[monthNo - 1] = true;
        });
        return paidMonths;
    }
    /**
     * Last-resort DistributionType recovery from free text (the cleaned SubLabel)
     * when no dedicated column exists. Only the canonical strings "Equal
     * Distribution" / "Individual Distribution" are returned because downstream
     * paid/unpaid gating compares against those exact values. NOTE: the cluster
     * wordings ("cluster distribution"/"cluster-distributed") currently map to
     * "Equal Distribution" — they are treated identically by the gating logic;
     * change only together with that logic in the grid.
     */
    static parseDistributionTypeFromText(value) {
        const normalized = (value || "").toLowerCase();
        if (normalized.includes("equal distribution") || normalized.includes("cluster distribution") || normalized.includes("cluster-distributed")) {
            return "Equal Distribution";
        }
        if (normalized.includes("individual distribution")) {
            return "Individual Distribution";
        }
        return "";
    }
    /**
     * Tolerant boolean for Canvas/Dataverse choice and yes/no columns, which can
     * arrive as real booleans, 0/1 numbers, "true"/"yes"/"ja" strings (German UI
     * in production!), "paid"/"unpaid" labels, choice OBJECTS (unwrapped via
     * Value/Name/Label/DisplayName), or labels merely containing "standard".
     * The negative variants ("not standard"/"non standard"/"non-standard") are
     * checked BEFORE the positive includes("standard") so "Non-Standard" cannot
     * be misread as true. Empty/unrecognized text returns false — the safe
     * default is "not paid / not standard".
     */
    static parseBoolean(value) {
        if (value === true || value === 1) {
            return true;
        }
        if (value === false || value === 0) {
            return false;
        }
        if (value && typeof value === "object") {
            const record = value;
            return this.parseBoolean(record.Value
                ?? record.value
                ?? record.Name
                ?? record.name
                ?? record.Label
                ?? record.label
                ?? record.DisplayName
                ?? record.displayName);
        }
        const normalized = (value || "").toString().trim().toLowerCase();
        if (!normalized
            || normalized === "false"
            || normalized === "no"
            || normalized === "nein"
            || normalized === "unpaid"
            || normalized === "0"
            || normalized.includes("not standard")
            || normalized.includes("non standard")
            || normalized.includes("non-standard")) {
            return false;
        }
        return normalized === "true"
            || normalized === "yes"
            || normalized === "ja"
            || normalized === "paid"
            || normalized === "1"
            || normalized.includes("standard");
    }
    /**
     * Normalizes any cell to trimmed text, unwrapping choice/lookup objects via
     * their common label properties first so "[object Object]" never leaks into
     * the UI when Canvas hands over a choice column instead of plain text.
     */
    static parseText(value) {
        if (value === null || value === undefined) {
            return "";
        }
        if (typeof value === "object") {
            const record = value;
            return this.parseText(record.Value
                ?? record.value
                ?? record.Name
                ?? record.name
                ?? record.Label
                ?? record.label
                ?? record.DisplayName
                ?? record.displayName);
        }
        return value.toString().trim();
    }
    /**
     * Extracts tooltip TEXT only. Booleans, numbers and boolean-looking strings
     * ("true"/"yes"/"1"/...) are rejected as "" because the many tooltip aliases
     * overlap with HasComments-style flag columns — without this filter a flag
     * misbound to a tooltip alias would literally render "true" as the tooltip.
     */
    static parseCommentTooltip(value) {
        if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
            return "";
        }
        const text = this.parseText(value);
        const normalized = text.toLowerCase();
        if (!text || normalized === "true" || normalized === "false" || normalized === "yes" || normalized === "no" || normalized === "1" || normalized === "0") {
            return "";
        }
        return text;
    }
    /**
     * Tolerant numeric parse for cost cells. Strips whitespace and comma
     * thousands-separators because firstAvailableValue may fall back to
     * getFormattedValue, which returns locale-formatted text like "1,234.50".
     * Anything unparseable becomes 0 so cost aggregation never produces NaN.
     */
    static parseNumber(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : 0;
        }
        const normalized = (value || "").toString().trim().replace(/\s/g, "");
        if (!normalized) {
            return 0;
        }
        const parsed = Number(normalized.replace(/,/g, ""));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    /**
     * Collapses a column name to lowercase alphanumerics, e.g.
     * "vsb_Is-Standard Contract" → "vsbisstandardcontract". This single rule is
     * what lets Canvas display names, Dataverse logical names and ad-hoc
     * collection column names all hit the same alias tables — every alias list
     * in this file is written in this normalized form, so changing the regex
     * invalidates ALL of them at once.
     */
    static normalizeFieldName(value) {
        return value.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    /**
     * Canonicalizes RowId/ParentId/GUID values to trimmed LOWERCASE strings,
     * unwrapping lookup objects (id/Id/ID/guid/Guid/GUID) first. The hierarchy
     * stitching and the StandardContractOptions → subaccount matching compare
     * these strings directly, so BOTH sides of every link must pass through this
     * method — Dataverse returns GUIDs with different casing depending on API.
     */
    static normalizeId(value) {
        if (value === null || value === undefined) {
            return "";
        }
        if (typeof value === "object") {
            const record = value;
            const possibleId = record.id || record.Id || record.ID || record.guid || record.Guid || record.GUID;
            if (possibleId !== null && possibleId !== undefined) {
                return possibleId.toString().trim().toLowerCase();
            }
        }
        return value.toString().trim().toLowerCase();
    }
    /**
     * Maps the cost bearer to the canonical "DevCo"/"SPV" spellings the grid
     * filters/renders on. When the dedicated column is empty the cleaned
     * SubLabel is scanned instead, which is how a "[DevCo]"/"[SPV]" tag embedded
     * in SubLabel is recovered. Unrecognized non-empty values are returned
     * verbatim so a new category surfaces in the UI instead of disappearing.
     */
    static parseCostPaidBy(value, subLabel) {
        const rawValue = (value ?? "").toString().trim();
        const fallbackValue = subLabel || "";
        const normalized = (rawValue || fallbackValue).toLowerCase();
        if (normalized.includes("devco") || normalized.includes("dev co")) {
            return "DevCo";
        }
        if (normalized.includes("spv")) {
            return "SPV";
        }
        return rawValue;
    }
    /**
     * Parses a cluster start date and truncates it to LOCAL midnight so cluster
     * boundary math is date-only — a time-of-day or timezone offset coming from
     * the Dataverse/PCF date property must not shift a cluster into the
     * neighbouring month. Invalid/empty input returns null, which callers treat
     * as "cluster not configured".
     */
    static normalizeDate(value) {
        if (!value) {
            return null;
        }
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    /**
     * Builds month-by-month cluster assignment and grouped spans for header rendering.
     *
     * Inputs are the StartYear and Cluster1..6Date PCF properties (set by Canvas).
     * Each configured cluster is mapped to the month (0..11) of the SELECTED year
     * where it becomes active:
     *   - starts before StartYear  → month 0 (already active in January)
     *   - starts during StartYear  → its actual calendar month
     *   - starts after StartYear   → sentinel 12, filtered out (never visible)
     * A cluster then stays active until the next cluster's start month. With no
     * visible clusters the whole year becomes a single clusterIndex-0 span, which
     * the header renders as "no cluster".
     */
    static calculateClusterTimeline(context) {
        const startYear = context.parameters.StartYear?.raw || 2026;
        const clusterStarts = [
            context.parameters.Cluster1Date?.raw,
            context.parameters.Cluster2Date?.raw,
            context.parameters.Cluster3Date?.raw,
            context.parameters.Cluster4Date?.raw,
            context.parameters.Cluster5Date?.raw,
            context.parameters.Cluster6Date?.raw
        ]
            .map((raw, idx) => {
            const normalized = this.normalizeDate(raw);
            if (!normalized) {
                return null;
            }
            const year = normalized.getFullYear();
            // 12 is the "starts after the selected year" sentinel; such clusters
            // are filtered out below so they cannot affect this year's header.
            let startMonth = 12;
            if (year < startYear) {
                startMonth = 0;
            }
            else if (year === startYear) {
                startMonth = normalized.getMonth();
            }
            return {
                clusterIndex: idx + 1,
                startMonth
            };
        })
            .filter((entry) => entry !== null && entry.startMonth < 12)
            // Earliest start first; ties broken by cluster number so the header is
            // stable when two clusters share a start month.
            .sort((a, b) => (a.startMonth - b.startMonth) || (a.clusterIndex - b.clusterIndex));
        if (clusterStarts.length === 0) {
            const emptyClusters = Array(12).fill(0);
            return {
                monthClusters: emptyClusters,
                spans: [{ clusterIndex: 0, length: 12 }]
            };
        }
        // Months BEFORE the first visible cluster's start are pre-filled with that
        // first cluster's index — the header has no "no cluster yet" state mid-year,
        // so the earliest cluster claims the leading months by design.
        const monthClusters = Array(12).fill(clusterStarts[0].clusterIndex);
        let activeCluster = clusterStarts[0].clusterIndex;
        let nextStartIdx = 1;
        // Sweep Jan→Dec: the `while` (not `if`) lets several clusters start in the
        // same month — the last one in sorted order wins for that month onward.
        for (let month = 0; month < 12; month++) {
            while (nextStartIdx < clusterStarts.length && month >= clusterStarts[nextStartIdx].startMonth) {
                activeCluster = clusterStarts[nextStartIdx].clusterIndex;
                nextStartIdx++;
            }
            monthClusters[month] = activeCluster;
        }
        // Run-length encode the clusters to build spanned cells
        const spans = [];
        let currentCluster = monthClusters[0];
        let currentLength = 1;
        for (let i = 1; i < 12; i++) {
            if (monthClusters[i] === currentCluster) {
                currentLength++;
            }
            else {
                spans.push({ clusterIndex: currentCluster, length: currentLength });
                currentCluster = monthClusters[i];
                currentLength = 1;
            }
        }
        spans.push({ clusterIndex: currentCluster, length: currentLength });
        return {
            monthClusters,
            spans
        };
    }
    /**
     * Determines grouped cluster spans for header rendering.
     *
     * Thin convenience wrapper kept for callers that only need the header spans
     * and not the per-month cluster map of calculateClusterTimeline.
     */
    static calculateClusterSpans(context) {
        return this.calculateClusterTimeline(context).spans;
    }
}
