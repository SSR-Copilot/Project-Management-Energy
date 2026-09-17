// Prints a reproducible PCF source port for apply_patch; does not write files.
import fs from 'node:fs';
import ts from 'typescript';
const root = new URL('../../../Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/', import.meta.url);
const files = ['ui/GridRenderer.ts', 'ui/ActionDropdown.ts', 'services/DatasetParser.ts', 'css/TableConnectedToDataversePCF.css'];

/*
 * Cost-cell formatter pooling.
 *
 * Upstream builds a fresh `Intl.NumberFormat` inside `formatCostValue`, which the renderer
 * calls once per grid cell — twice for a month cell, which also builds an aria-label — so
 * roughly 27 times per row. Construction costs ~80 us against ~1.5 us for `.format()` on an
 * existing instance: 266 ms of a 100-row render, 772 ms at 300 rows, against 10 ms and 29 ms
 * pooled. The output is byte-identical, since an `Intl.NumberFormat` carries no per-call
 * state, and the browser's language list is still re-read on every call.
 *
 * Applied here, like the two fixes below it, so regenerating the port keeps it.
 */
const COST_FORMAT_FIELDS_FROM = `    static MONTH_ABBREVIATIONS = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
`;
const COST_FORMAT_FIELDS_TO = `${COST_FORMAT_FIELDS_FROM}\
    // The pooled cost formatter and the language list it was built for. Static, not
    // per-instance: it depends only on navigator.languages, which is global.
    static _costFormat = null;
    static _costFormatLocales = null;
`;

const COST_FORMAT_METHOD_FROM = `        return new Intl.NumberFormat(browserLocales, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3
        }).format(value);
`;
const COST_FORMAT_METHOD_TO = `        // Constructing an Intl.NumberFormat costs ~80 us and this runs once per grid cell
        // (twice for a month cell, which also builds an aria-label), so ~27 times per row:
        // 266 ms of a 100-row render, 772 ms at 300 rows. Reusing one formatter brings
        // those to 10 ms and 29 ms. Output is byte-identical -- an Intl.NumberFormat holds
        // no per-call state -- and the locale list is re-checked on every call, so a host
        // that changes it still gets a fresh formatter.
        const localeKey = String(browserLocales);
        if (GridRenderer._costFormatLocales !== localeKey) {
            GridRenderer._costFormat = new Intl.NumberFormat(browserLocales, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3
            });
            GridRenderer._costFormatLocales = localeKey;
        }
        return GridRenderer._costFormat.format(value);
`;

/** Every replacement must actually fire; a silent no-op would ship the unpooled renderer. */
function replaceOnce(content, from, to, label) {
  const parts = content.split(from);
  if (parts.length !== 2) {
    throw new Error(`read-pcf-port: "${label}" matched ${parts.length - 1} times, expected 1 — upstream has moved`);
  }
  return parts.join(to);
}

process.stdout.write(JSON.stringify(files.map(file => {
  const source = fs.readFileSync(new URL(file, root), 'utf8');
  let content = file.endsWith('.css') ? source : ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  content = content.replace('window.dispatchEvent(event);', 'this._container.dispatchEvent(event);')
    .replace('document.getElementById("dropdown-comment-dot")', 'this._dropdownElement.querySelector("#dropdown-comment-dot")');
  if (file === 'ui/GridRenderer.ts') {
    content = replaceOnce(content, COST_FORMAT_FIELDS_FROM, COST_FORMAT_FIELDS_TO, 'cost formatter fields');
    content = replaceOnce(content, COST_FORMAT_METHOD_FROM, COST_FORMAT_METHOD_TO, 'cost formatter body');
  }
  return { path: file.replace(/\.ts$/, '.js'), content };
})));
