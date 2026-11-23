/**
 * Whether an address may be handed to `window.open` (PO-027, R-9; moved here from `features/pm/project-main/rules.ts` in D157 so the
 * header can use the same rule — a component never imports from a feature folder, CONVENTIONS rule 17).
 *
 * The SharePoint and Teams links are free text on the project row, and the InfoCenter link is an environment variable, so a value
 * such as `javascript:...` must not reach `window.open`. Only `http:` and `https:` addresses pass; an empty, scheme-less or
 * unparseable value does not (a scheme-less value opened a wrong relative address before, so refusing it is no regression).
 * NEW: the canvas `Launch()` took any text. Never throws.
 */
export function isOpenableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
