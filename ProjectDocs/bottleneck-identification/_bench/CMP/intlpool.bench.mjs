// Micro-benchmark (SYNTHETIC inputs, real app module): cost of the pooled Intl helpers per call.
import { numberFormat, canvasNumberText, dateFormat } from "../../../../ProjectCosts-CodeApp/src/domain/locale.ts";
const N = 200000;
function t(label, fn) { fn(); const s = performance.now(); fn(); const d = performance.now() - s; console.log(label.padEnd(64), (d / N * 1000).toFixed(2), "us/call  total", d.toFixed(0), "ms for", N); }
const opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const nf = new Intl.NumberFormat("en-GB", opts);
const df = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
const d0 = new Date(2026, 3, 5);
t("raw cached Intl.NumberFormat.format", () => { for (let i = 0; i < N; i++) nf.format(i * 1.37); });
t("numberFormat(locale, opts).format  (pool lookup w/ JSON.stringify key)", () => { for (let i = 0; i < N; i++) numberFormat("en-GB", opts).format(i * 1.37); });
t("canvasNumberText(value, locale, opts)", () => { for (let i = 0; i < N; i++) canvasNumberText(i * 1.37, "de-DE", opts); });
t("raw cached Intl.DateTimeFormat.format", () => { for (let i = 0; i < N; i++) df.format(d0); });
t("dateFormat(locale, opts).format", () => { for (let i = 0; i < N; i++) dateFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d0); });
t("a.localeCompare(b) (no locale)", () => { let x = 0; for (let i = 0; i < N; i++) x += ("Contract " + (i % 977)).localeCompare("Contract " + ((i + 3) % 977)); return x; });
const col = new Intl.Collator("en-GB");
t("shared Intl.Collator.compare", () => { let x = 0; for (let i = 0; i < N; i++) x += col.compare("Contract " + (i % 977), "Contract " + ((i + 3) % 977)); return x; });
