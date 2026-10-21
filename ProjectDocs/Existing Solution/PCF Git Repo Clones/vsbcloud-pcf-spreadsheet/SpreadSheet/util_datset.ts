/*
  eslint-disable
  @typescript-eslint/consistent-type-definitions ,
  @typescript-eslint/consistent-type-definitions,
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/array-type,
  @typescript-eslint/no-base-to-string
*/

export type DuplicateKeyMode = "suffix" | "overwrite" | "skip";

export type DataSetToKeyedOptions = {
    /** If not provided, recordId is used as the key */
    keyColumn?: string;

    /** Include only these columns (logical names). If omitted, all dataset columns are used. */
    includeColumns?: string[];

    /** Exclude these columns (logical names). Applied after includeColumns. */
    excludeColumns?: string[];

    /** Prefer formatted values (recommended for lookup/option-set/etc.) */
    useFormatted?: boolean;

    /** If false, null/undefined are converted to "" */
    keepNulls?: boolean;

    /** What to do if two rows produce the same key */
    onDuplicateKey?: DuplicateKeyMode;
};

type RowObject = Record<string, unknown>;
type KeyedMap = Record<string, RowObject>;

function normalizeValue(v: unknown, keepNulls: boolean): unknown {
    if (v === null || v === undefined) return keepNulls ? v : "";
    return v;
}

function pickColumns(
    dataset: ComponentFramework.PropertyTypes.DataSet,
    opts: DataSetToKeyedOptions
): string[] {
    const all = dataset.columns.map((c) => c.name);

    let cols = opts.includeColumns?.length ? opts.includeColumns.slice() : all;

    if (opts.excludeColumns?.length) {
        const ex = new Set(opts.excludeColumns);
        cols = cols.filter((c) => !ex.has(c));
    }

    return cols;
}

function getCellValue(
    record: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
    colName: string,
    useFormatted: boolean,
    keepNulls: boolean
): unknown {
    const v = useFormatted ? record.getFormattedValue(colName) : record.getValue(colName);
    return normalizeValue(v, keepNulls);
}

function getKeyForRecord(
    recordId: string,
    record: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
    keyColumn: string | undefined,
    useFormatted: boolean,
    keepNulls: boolean
): string {
    if (!keyColumn) return recordId;

    const raw = useFormatted ? record.getFormattedValue(keyColumn) : record.getValue(keyColumn);
    const v = normalizeValue(raw, keepNulls);

    // Ensure key is a string (safe for object keys)
    const key = (v ?? recordId).toString().trim();
    return key || recordId;
}

/** 1) Best: returns { key1: {col:val}, key2: {...} } */
export function dataSetToKeyedMap(
    dataset: ComponentFramework.PropertyTypes.DataSet,
    options: DataSetToKeyedOptions = {}
): KeyedMap {
    const {
        keyColumn,
        useFormatted = true,
        keepNulls = false,
        onDuplicateKey = "suffix",
    } = options;

    const cols = pickColumns(dataset, options);
    const result: KeyedMap = {};

    // Prefer sortedRecordIds for consistent order
    const ids = dataset.sortedRecordIds ?? Object.keys(dataset.records);

    for (const recordId of ids) {
        const record = dataset.records[recordId];
        if (!record) continue;

        const baseKey = getKeyForRecord(recordId, record, keyColumn, useFormatted, keepNulls);
        let key = baseKey;

        if (result[key] !== undefined) {
            if (onDuplicateKey === "skip") continue;
            if (onDuplicateKey === "suffix") {
                let i = 2;
                while (result[`${baseKey}_${i}`] !== undefined) i++;
                key = `${baseKey}_${i}`;
            }
            // overwrite => keep key as-is
        }

        const row: RowObject = {};
        for (const colName of cols) {
            row[colName] = getCellValue(record, colName, useFormatted, keepNulls);
        }

        result[key] = row;
    }

    return result;
}

/** 2) Returns [{ key1: {...} }, { key2: {...} }] */
export function dataSetToKeyedArray(
    dataset: ComponentFramework.PropertyTypes.DataSet,
    options: DataSetToKeyedOptions = {}
): Array<Record<string, RowObject>> {
    const map = dataSetToKeyedMap(dataset, options);
    return Object.entries(map).map(([k, v]) => ({ [k]: v }));
}

/** 3) Returns your exact sample: [{ key1:{...}, key2:{...} }] */
export function dataSetToSingleObjectArray(
    dataset: ComponentFramework.PropertyTypes.DataSet,
    options: DataSetToKeyedOptions = {}
): KeyedMap[] {
    return [dataSetToKeyedMap(dataset, options)];
}

const ACCOUNTNUMBER_COL = 0;
const ACCOUNTNAME_COL = 1;

function getCellValueSafe(row: any[], colIndex: number): string {
    const v = row?.[colIndex]?.value;
    return (v ?? "").toString().trim();
}

export function findNearestAccountHeaderRow(
    data: any[][],
    startIndex: number,
    accountNoCol = ACCOUNTNUMBER_COL,
    accountNameCol = ACCOUNTNAME_COL
): { row: any[]; index: number } | null {
    for (let i = startIndex; i >= 0; i--) {

        const row = data[i];
        let accNo = row[0]
        //getCellValueSafe(row, accountNoCol);
        let accName = row[1]

        accNo = (accNo?.value ?? "").toString().trim();
        accName = (accName?.value ?? "").toString().trim();
        if (accNo !== "" && accName !== "") {

            return { row, index: i };
        }
    }
    return null;
}
