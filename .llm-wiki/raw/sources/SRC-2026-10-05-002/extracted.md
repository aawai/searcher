🇺🇦
Stand with Ukraine - [Support Ukrainian Heroes](https://www.comebackalive.in.ua/donate)

[Mykola Aleksandrov](/)

[Home](/)
[Archive](/archive/)
[Tips](/tips/)
[About](/about/)
[Contact](/contact/)
[☕
Buy me a coffee](https://coff.ee/nick_a)

# Taming 'Large Chunks' in Vite + React: Why It Happens and How I Shrunk My Main Bundle

November 30, 2025
8 min read

If you've seen Vite's warning about **"Some chunks are larger than 500 kB after minification"**, you're not alone. This article explains what causes that warning in a React + Vite project and walks through the exact steps I took to shrink my main bundle—using `manualChunks`, `React.lazy`, and route-level code splitting.

## The Symptoms

During a production build, Vite (Rollup under the hood) printed something like this:

```
vite v5.x.x building for production...
✓ 6321 modules transformed.
dist/assets/index-abc123.js   1,245.67 kB │ gzip: 345.12 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit
```

My main bundle exceeded 1 MB—even after minification. That's a lot of JavaScript to ship on first paint.

## Why Large Chunks Are Bad

### ⚠️ Performance Impact

* **Longer download times** — especially painful on 3G or emerging markets
* **Heavier parse & compile** — low-end mobiles struggle with large scripts
* **Cache invalidation** — one small edit re-downloads the entire monolith
* **Poor Core Web Vitals** — FCP / LCP / INP all suffer from blocking scripts

## What Causes Giant Bundles?

By default, Vite produces a single `index.js` containing your application code *plus* every `node_modules` dependency it touches. That includes React, ReactDOM, date-fns, a charting library, icon packs—whatever you imported, eagerly or not.

* **Eager imports at the top of files**: `import { Chart } from 'chart.js';`
* **Large transitive dependencies**: one package pulls in 10 others
* **Not using lazy routes**: every page ships in one go

## The Fix: `manualChunks` + Lazy Loading

The solution has two parts:

1. **Split heavy vendor libraries** into separate, cacheable files using Vite's `manualChunks`
2. **Lazy-load routes or heavy features** with `React.lazy()` + `<Suspense>`

### 1. Configure `manualChunks`

Add or update your `vite.config.ts`:

```
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Common utils
            if (id.includes('lodash') || id.includes('date-fns') || id.includes('axios')) {
              return 'utils-vendor';
            }
            // Heavy charting
            if (id.includes('chart.js') || id.includes('recharts') || id.includes('d3')) {
              return 'chart-vendor';
            }
            // Icons
            if (id.includes('lucide') || id.includes('react-icons') || id.includes('@iconify')) {
              return 'icons-vendor';
            }
            // Everything else in node_modules
            return 'vendor';
          }
        },
      },
    },
  },
});
```

This tells Rollup to put React, charts, icons, and other vendors in their own files. Because the **React core rarely changes**, browsers can cache `react-vendor-[hash].js` across many deploys.

### 2. Lazy-load Routes

Move page-level imports from the module top to dynamic imports:

```
// Before — eager
import DashboardPage from './pages/DashboardPage';
import ReportsPage   from './pages/ReportsPage';

// After — lazy
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ReportsPage   = React.lazy(() => import('./pages/ReportsPage'));
```

Then wrap each route element in `<Suspense>`:

```
import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div>Loading…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

The result: **each page becomes its own chunk**, downloaded only when the user navigates there.

## After the Changes

Rebuild and compare:

```
dist/assets/index-d1f2e3.js           42.35 kB │ gzip:  14.21 kB
dist/assets/react-vendor-a9b8c7.js   142.18 kB │ gzip:  46.52 kB
dist/assets/chart-vendor-e4f5g6.js   324.72 kB │ gzip: 102.31 kB
dist/assets/icons-vendor-h7i8j9.js   186.44 kB │ gzip:  58.19 kB
dist/assets/vendor-k0l1m2.js          98.63 kB │ gzip:  32.07 kB
dist/assets/Dashboard-n3o4p5.js       28.19 kB │ gzip:   9.44 kB
dist/assets/Reports-q6r7s8.js         35.62 kB │ gzip:  11.87 kB
```

### 📊 What Changed

* Main entry: ~42 kB (was >1 MB)
* Vendor libraries split into cacheable, parallel-downloadable chunks
* Each route is now its own chunk, fetched on demand
* No more "chunks are larger than 500 kB" warning 🎉

## Optional: Use a Bundle Visualizer

Install [`rollup-plugin-visualizer`](https://github.com/btd/rollup-plugin-visualizer) to see exactly where the bytes come from:

```
npm i -D rollup-plugin-visualizer
```

```
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true, filename: 'dist/stats.html' }),
  ],
  // ...
});
```

Open `dist/stats.html` after a build and trim the big blocks.

## Caching and Loading Strategy Tips

* **Hashed filenames** (Vite default) ensure cache-busting when content changes, and long-term caching when it doesn't.
* **Split by stability**: put "rarely-changing" vendor stacks (React, router) in their own chunk to maximize browser re-use across releases.
* **Use `rel="preload"`/`prefetch`** for near-future routes (e.g., prefetch the chunk for the page users often open next).
* **Brotli on CDN**: ship brotli if possible (most CDNs handle this automatically). Vite's build report shows gzip by default, but your CDN can serve brotli.

## A Pragmatic Optimization Checklist

1. **Vendor splits** via `manualChunks` (React core, charts, markdown, utils).
2. **Route-level lazy loading** with `React.lazy` + `Suspense`.
3. **Feature-level lazy imports** for rarely used heavy widgets.
4. **Cherry-pick imports** and prefer ESM builds.
5. **Swap heavy deps** (Moment → Day.js, reduce icon sets, reconsider giant UI kits).
6. **Analyze with visualizer** and remove accidental bloat.
7. **Use prefetch/preload** for predictable navigation.
8. **Keep CSS lean**; large CSS can also delay rendering.
9. **Set caching headers** on your CDN; hashed assets can be cached for a year.
10. **Measure**: run Lighthouse and watch **FCP/LCP/INP** as you iterate.

## Final Thoughts

The "500 kB after minification" warning isn't fatal, but it's a **performance smell**. By **splitting stable vendor code** and **lazy-loading routes/features**, you'll shrink your boot bundle, improve caching, and create a snappier experience on both desktop and mobile. The configuration above is a low-effort, high-impact baseline you can build on—then use the visualizer to keep shaving off what users don't need on first paint.

## References & Further Reading

* [Vite "Build Options" (Rollup config, chunking)](https://vitejs.dev/config/build-options.html)
* [Rollup `manualChunks` docs](https://rollupjs.org/configuration-options/#output-manualchunks)
* [React code splitting / `React.lazy` and `Suspense`](https://react.dev/reference/react/lazy)
* [Route-level splitting with React Router](https://reactrouter.com/en/main/route/route#lazy)

### 📚 Related Articles

#### [Making My React App Feel Instant: Route‑Level Code‑Splitting](/posts/2025/10/react-lazy-suspense-vite-manualchunks/)

Deep dive into React.lazy, Suspense, vendor-aware manualChunks, prefetch on intent, and error boundaries.

#### [Managing Environment Variables in Vite, Docker, and React](/posts/2025/10/vite-docker-react-environment-variables/)

Comprehensive guide to managing environment variables across Vite, React, and Docker with TypeScript integration.

#### [React Hooks & Patterns From My Experience – Part 2](/posts/2025/09/react-hooks-experience-part2/)

Deep dive into React side effects, performance optimization, and structured state management.

#### [React Hooks & Patterns From My Experience – Part 1](/posts/2025/09/react-hooks-experience-part1/)

Practical patterns for useState, useEffect, custom hooks, and composition in React applications.

## 💬 Comments & Reactions

#### Recent Posts

### Quick Links

[Home](/)
[Archive](/archive/)
[Tips](/tips/)
[About](/about/)
[Contact](/contact/)

### Resources

[RSS Feed](/rss.xml)
[Buy me a coffee](https://coff.ee/nick_a)

### Social

[GitHub](https://github.com/NickolaiA)
[LinkedIn](https://www.linkedin.com/in/mykola-aleksandrov-10a3596/)

© 2025 Mykola Aleksandrov. All rights reserved.
