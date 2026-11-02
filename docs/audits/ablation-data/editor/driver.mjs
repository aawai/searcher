// Driver: real Chromium (Playwright 1.56.1 from the repo's node_modules), real keyboard events.
// usage: node driver.mjs <experiment> [--reps N] [--keys N] [--out file]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const { chromium } = await import("/home/aawei/searcher/node_modules/playwright/index.mjs");
process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= "ubuntu24.04-x64";

const DIST = "/home/aawei/experiments/editor-study/dist";
const args = process.argv.slice(2);
const exp = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPS = Number(opt("--reps", 5));
const KEYS = Number(opt("--keys", 45));
const WARM = Number(opt("--warm", 5));
const OUT = opt("--out", `/home/aawei/experiments/editor-study/results/${exp}.json`);

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  fs.readFile(path.join(DIST, p), (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": mime[path.extname(p)] ?? "application/octet-stream" });
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const F = (o) => ({ chars: 20000, extensions: "full", onChange: "session", drafts: "idb", analysis: true, pagination: "page", ...o });
const FULL = F({});
const experiments = {
  // ladder: additive, one factor added per step (each step differs from the previous in exactly one factor)
  ladder: [
    ["L0_bare", F({ extensions: "none", onChange: "none", analysis: false, pagination: "none" })],
    ["L1_+extensions", F({ onChange: "none", analysis: false, pagination: "none" })],
    ["L2_+serialize_onChange", F({ onChange: "serialize", analysis: false, pagination: "none" })],
    ["L3_+session_memDrafts", F({ drafts: "memory", analysis: false, pagination: "none" })],
    ["L4_+idbDrafts", F({ analysis: false, pagination: "none" })],
    ["L5_+analysis", F({ pagination: "none" })],
    ["L6_+paginationPlugin_continuous", F({ pagination: "continuous" })],
    ["L7_+pageMode(full)", F({})],
  ],
  // leave-one-out from the full pipeline (page mode), one factor removed at a time
  loo: [
    ["FULL", FULL],
    ["-pageMode(plugin stays, continuous)", F({ pagination: "continuous" })],
    ["-paginationPlugin", F({ pagination: "none" })],
    ["-analysis", F({ analysis: false })],
    ["-idbDrafts(memory)", F({ drafts: "memory" })],
    ["-session(serialize only)", F({ onChange: "serialize" })],
    ["-onChange(no serialize)", F({ onChange: "none" })],
    ["-extensions", F({ extensions: "none" })],
  ],
  // size sweep for the full pipeline and for the cheapest continuous pipeline
  size: [5000, 20000, 100000, 300000].flatMap((c) => [
    [`full_page_${c}`, F({ chars: c })],
    [`continuous_noPagPlugin_${c}`, F({ chars: c, pagination: "none" })],
    [`bare_${c}`, F({ chars: c, extensions: "none", onChange: "none", analysis: false, pagination: "none" })],
  ]),
};
experiments.burst = [20000, 100000].flatMap((c) => [
  [`burst_idb_${c}`, F({ chars: c, analysis: false, pagination: "none" })],
  [`burst_mem_${c}`, F({ chars: c, drafts: "memory", analysis: false, pagination: "none" })],
]);
experiments.smoke = [["smoke", FULL]];

const configs = experiments[exp];
if (!configs) throw new Error(`unknown experiment ${exp}; have ${Object.keys(experiments)}`);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const meta = {
  experiment: exp, reps: REPS, keys: KEYS, warmup: WARM, date: new Date().toISOString(),
  chromium: browser.version(), cpu: os.cpus()[0].model, cpus: os.cpus().length, loadavg: os.loadavg(),
  repoHead: fs.readFileSync("/home/aawei/searcher/.git/HEAD", "utf8").trim(),
};
const runs = [];
// rep-major, config order rotated per rep to spread drift/thermal effects
for (let rep = 0; rep < REPS; rep++) {
  const order = configs.map((_, i) => (i + rep) % configs.length);
  for (const ci of order) {
    const [name, cfg] = configs[ci];
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.__ready === true);
    const info = await page.evaluate((c) => window.__setup(c), cfg);
    const run = { name, rep, cfg, info, keys: [], errors };
    if (exp === "burst") {
      run.burst = await page.evaluate(() => window.__burst(100));
      run.burst2 = await page.evaluate(() => window.__burst(100));
    } else {
      for (let k = 0; k < KEYS + WARM; k++) {
        await page.keyboard.press(k % 2 ? "b" : "a");
        const r = await page.evaluate(() => window.__settle());
        if (k >= WARM) run.keys.push(r);
      }
      run.finalChars = await page.evaluate(() => window.__gen && document.querySelector(".ProseMirror")?.textContent?.length);
    }
    await page.evaluate(() => window.__teardown());
    await ctx.close();
    runs.push(run);
    console.log(`rep ${rep} ${name}: ` + (run.keys.length ? `dispatch med ${med(run.keys.map((k) => k.dispatchMs)).toFixed(2)}ms frame med ${med(run.keys.map((k) => k.frameMs)).toFixed(1)}ms` : JSON.stringify(run.burst)) + (errors.length ? ` ERR ${errors[0]}` : ""));
  }
}
function med(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
fs.writeFileSync(OUT, JSON.stringify({ meta, runs }));
await browser.close();
server.close();
console.log("wrote", OUT);
