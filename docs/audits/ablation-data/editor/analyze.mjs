// node analyze.mjs results/<exp>.json -> markdown table to stdout
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const by = new Map();
for (const r of d.runs) { if (!by.has(r.name)) by.set(r.name, []); by.get(r.name).push(r); }
console.log(`# ${d.meta.experiment} (reps=${d.meta.reps}, keys/rep=${d.meta.keys}, warmup=${d.meta.warmup}; ${d.meta.chromium}; ${d.meta.cpu} x${d.meta.cpus})\n`);
if (d.meta.experiment === "burst") {
  console.log("| config | n | loop ms (median of reps) | per-tx ms | IDB drain ms after loop | draftWrites |\n|---|---|---|---|---|---|");
  for (const [name, rs] of by) for (const k of ["burst", "burst2"]) {
    const L = rs.map((r) => r[k].loopMs), D = rs.map((r) => r[k].drainMs);
    console.log(`| ${name} ${k} | ${rs[0][k].n} | ${q(L, .5).toFixed(1)} [${L.map((x) => x.toFixed(0)).join(",")}] | ${(q(L, .5) / rs[0][k].n).toFixed(2)} | ${q(D, .5).toFixed(1)} [${D.map((x) => x.toFixed(0)).join(",")}] | ${rs[0][k].draftWrites} |`);
  }
  process.exit(0);
}
const f = (x) => x.toFixed(2);
console.log("| config | chars | pm blocks | dispatch med (ms) | dispatch p95 | frame med | frame p95 | analysis med | layout sum med | layouts/key | measurements/key | rep-medians dispatch (ms) |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [name, rs] of by) {
  const all = (k) => rs.flatMap((r) => r.keys.map((x) => x[k]));
  const repMed = rs.map((r) => q(r.keys.map((x) => x.dispatchMs), .5));
  console.log(`| ${name} | ${rs[0].info.mdChars} | ${rs[0].info.blocks} | ${f(q(all("dispatchMs"), .5))} | ${f(q(all("dispatchMs"), .95))} | ${f(q(all("frameMs"), .5))} | ${f(q(all("frameMs"), .95))} | ${f(q(all("analysisMs"), .5))} | ${f(q(all("layoutMs"), .5))} | ${q(all("layouts"), .5)} | ${q(all("measurements"), .5)} | ${repMed.map(f).join(", ")} |`);
}
console.log("\nCold open (median over reps): createMs, first page-layout settle, pages, DOM nodes");
for (const [name, rs] of by) {
  const c = (k) => rs.map((r) => r.info.cold[k]).filter((x) => x !== undefined);
  console.log(`- ${name}: createMs=${f(q(c("createMs"), .5))} settleMs=${c("firstPageLayoutSettleMs").length ? f(q(c("firstPageLayoutSettleMs"), .5)) : "n/a"} pages=${c("pages")[0] ?? "n/a"} dom=${c("dom")[0]}`);
}
