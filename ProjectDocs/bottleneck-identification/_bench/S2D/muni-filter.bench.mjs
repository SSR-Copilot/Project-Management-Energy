// S2D: cost of filtering an Area's already-loaded municipality list on the client (RND-02 option O3).
// Synthetic rows in the shape of MunicipalityRow; 2,000 rows (Bavaria) and 5,000 (the page cap). Median of 200 runs.
const mk = (n) => Array.from({ length: n }, (_, i) => ({ uid: `DE${String(i).padStart(6, "0")}`, municipality: `Gemeinde ${i} am Sonnenberg ${i % 7}`, state: "Bayern", tradetaxrate: "400" }));
const filt = (rows, t) => { const q = t.trim().toLowerCase(); return q ? rows.filter((r) => r.municipality.toLowerCase().includes(q) || r.uid.toLowerCase().includes(q)) : rows; };
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
for (const n of [2000, 5000]) {
  const rows = mk(n);
  for (const t of ["g", "ge", "gem", "sonnenberg 3", "zzz"]) {
    for (let w = 0; w < 50; w++) filt(rows, t);
    const ts = [];
    let kept = 0;
    for (let i = 0; i < 200; i++) { const t0 = performance.now(); kept = filt(rows, t).length; ts.push(performance.now() - t0); }
    console.log(`${n} rows, term "${t}": ${med(ts).toFixed(3)} ms median, ${kept} kept`);
  }
}
