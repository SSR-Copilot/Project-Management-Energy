// Prints a reproducible PCF source port for apply_patch; does not write files.
import fs from 'node:fs';
import ts from 'typescript';
const root = new URL('../../../Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/', import.meta.url);
const files = ['ui/GridRenderer.ts', 'ui/ActionDropdown.ts', 'services/DatasetParser.ts', 'css/TableConnectedToDataversePCF.css'];
process.stdout.write(JSON.stringify(files.map(file => {
  const source = fs.readFileSync(new URL(file, root), 'utf8');
  let content = file.endsWith('.css') ? source : ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  content = content.replace('window.dispatchEvent(event);', 'this._container.dispatchEvent(event);')
    .replace('document.getElementById("dropdown-comment-dot")', 'this._dropdownElement.querySelector("#dropdown-comment-dot")');
  return { path: file.replace(/\.ts$/, '.js'), content };
})));
