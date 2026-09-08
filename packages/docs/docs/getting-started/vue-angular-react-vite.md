---
id: vue-angular-react-etc
title: 'React, Vue, Angular, etc.'
summary: Guide for integrating Cornerstone3D with popular frontend frameworks, including configuration examples for Vite and Webpack with troubleshooting tips
---

Here are some examples of how to use Cornerstone3D with React, Vue, Angular, and Vite-based frameworks.

**Example repositories:**

- [Cornerstone3D with Vite + React](https://github.com/cornerstonejs/vite-react-cornerstone3d)
- [Cornerstone3D with Vite + Vue](https://github.com/cornerstonejs/vue-cornerstone3d)
- [Cornerstone3D with Angular](https://github.com/cornerstonejs/angular-cornerstone3d)
  - [Community maintained project](https://github.com/yanqzsu/ng-cornerstone)
- [Cornerstone3D with Next.js](https://github.com/cornerstonejs/nextjs-cornerstone3d)

---

## Setup and install

### Prerequisites

- **Node.js** (e.g. 18+ or 20+ depending on the template)
- **npm** or **yarn**

### Vue (Vite)

1. Clone or create a Vite + Vue project and install dependencies:

   ```bash
   npm install
   # or: yarn
   ```

2. **Required setup:**
   - **Vite config:** Use `@originjs/vite-plugin-commonjs` for `dicom-parser`, set `optimizeDeps.exclude: ['@cornerstonejs/dicom-image-loader']`, `optimizeDeps.include: ['dicom-parser']`, and `worker: { format: 'es' }`. See [Vite basic setup](#basic-setup) below.
   - **Subpath:** For running under a subpath (e.g. `/subpath/`), set `base` from `process.env.BASE_PATH` and use scripts like `dev:subpath` / `build:subpath` that set `BASE_PATH=/subpath/`. The Vue template uses `cross-env` for this.
   - **Codec WASM:** Vite resolves the codec binaries on its own, so nothing is required here. Optionally set `init({ wasmBasePath })` to serve them from a location you choose, e.g. a CDN — see [Codec WASM location](#codec-wasm-location).

3. **How to run:**
   - **Dev (root):** `npm run dev` → open http://localhost:5173/
   - **Build (root):** `npm run build` → output in `dist/`
   - **Preview (root):** `npm run preview` → open http://localhost:4173/
   - **Dev (subpath):** `npm run dev:subpath` → open http://localhost:5173/subpath/
   - **Build (subpath):** `npm run build:subpath` then `npm run preview:subpath` (or use `npm run dev:subpath` to test).

### Angular

1. Install dependencies (this runs **postinstall** scripts that set up the build):

   ```bash
   npm install
   ```

2. **Required setup:**
   - **Postinstall / prebuild:** The project uses scripts to create Node stubs (`fs`/`path`) for the browser build and to bundle the DICOM image loader worker and copy codec WASM. These run on `npm install` and before `npm run build` (via `prebuild`). The **preview** script runs them before building so the production bundle has the worker and codecs.
   - **Serve:** In development, `@cornerstonejs/dicom-image-loader` is excluded from prebundle so the worker loads correctly.
   - **Codec WASM:** Required here, unlike the Vite templates — the `application` builder uses esbuild, which does not resolve the codecs' bare specifiers. Point the loader at the copied binaries with `init({ wasmBasePath })`; see [Codec WASM location](#codec-wasm-location).
   - **Assets:** Codec `.wasm` files are copied from `node_modules` into the build via `angular.json` assets; the worker is generated into `public/cs-dicom-loader/` (and that folder is typically gitignored).

3. **How to run:**
   - **Dev (root):** `npm start` or `npm run dev` → open http://localhost:4200/
   - **Build (root):** `npm run build` → output in `dist/angular-vite-6/`
   - **Preview (root):** `npm run preview` → builds then serves at http://localhost:4201/ (use this if the dev server doesn’t load images correctly).
   - **Dev (subpath):** `npm run dev:subpath` → open http://localhost:4200/subpath/
   - **Build (subpath):** `npm run build:subpath` → then run the preview script or serve `dist/angular-vite-6/browser` with the app under `/subpath/`.
   - **Preview (subpath):** `npm run preview:subpath` → builds for subpath then serves at http://localhost:4202/.

   For production, deploy the contents of `dist/angular-vite-6/browser` and serve it at `/` or at your subpath.

### React (Vite)

1. Install dependencies:

   ```bash
   npm install
   # or: yarn
   ```

2. **Required setup:**
   - **Vite config:** Same as Vue: CommonJS plugin for `dicom-parser`, exclude `@cornerstonejs/dicom-image-loader` from `optimizeDeps`, include `dicom-parser`, and `worker: { format: 'es' }`. Optionally use a Cornerstone WASM plugin or `base` for subpath.
   - **Subpath:** Set `base: '/subpath/'` in `vite.config.ts` (or from env) for build/preview under a subpath.
   - **Codec WASM:** Vite resolves the codec binaries on its own, so nothing is required here. Optionally set `init({ wasmBasePath })` to serve them from a location you choose, e.g. a CDN — see [Codec WASM location](#codec-wasm-location).

3. **How to run:**
   - **Dev (root):** `npm run dev` → open http://localhost:5173/
   - **Build:** `npm run build` → output in `dist/`
   - **Preview (root):** `npm run preview` → open http://localhost:4173/
   - **Subpath:** Set `base: '/subpath/'` in config, then build and preview (or run dev with that base) and open the app at `http://localhost:5173/subpath/` or the preview URL with `/subpath/`.

**Quick reference:**

| Framework    | Install       | Dev (root)    | Build           | Preview / prod-like                    |
| ------------ | ------------- | ------------- | --------------- | -------------------------------------- |
| Vue (Vite)   | `npm install` | `npm run dev` | `npm run build` | `npm run preview`                      |
| Angular      | `npm install` | `npm start`   | `npm run build` | `npm run preview` (builds then serves) |
| React (Vite) | `npm install` | `npm run dev` | `npm run build` | `npm run preview`                      |

For subpath, use the `dev:subpath` / `build:subpath` / `preview:subpath` scripts where available (Vue, Angular) or set `base` in Vite config (React/Vue).

---

## Codec WASM location

Each decoder locates its WASM binary with a bare `@cornerstonejs/codec-...` specifier inside `new URL(..., import.meta.url)`. Whether that needs any setup from you depends on the bundler:

| Bundler               | Behavior                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| webpack 5             | Resolves the specifier through the package `exports` map and emits the binary as an asset. Nothing to do.      |
| Vite / Rollup (build) | Same: resolves and emits the binary (or inlines it, when under the asset inline limit). Nothing to do.         |
| esbuild               | Does **not** resolve it. `new URL(...)` is treated as ordinary code, so the bare specifier survives the build. |

Angular's `application` builder is esbuild-based, so Angular applications are the common case that needs configuration. In Vite, keep `@cornerstonejs/dicom-image-loader` out of dev-time dependency optimization (the `optimizeDeps.exclude` above), because prebundling runs esbuild — that is the same limitation seen from the dev server.

When the specifier is not resolved, the request goes to a path that does not exist — usually answered by the SPA fallback, which surfaces as:

```
CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f
```

(`3c 21 64 6f` is `<!do` — the decoder received `index.html` instead of a binary.)

Serve the binaries yourself and point the loader at them with `wasmBasePath`:

```js
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';

dicomImageLoaderInit({
  wasmBasePath: '/assets/cs-wasm/',
});
```

Reach for this when your bundler does not resolve the specifiers (esbuild, so Angular), or when you want the binaries served from a location you control — a CDN, or a path that suits a subpath deployment — regardless of bundler.

That is a single root for every codec — there is no per-codec option. The directory must contain the four binaries under their published names, copied at build time out of the `dist` directory of each codec package:

| File                           | Copy from                                 |
| ------------------------------ | ----------------------------------------- |
| `charlswasm_decode.wasm`       | `@cornerstonejs/codec-charls`             |
| `libjpegturbowasm_decode.wasm` | `@cornerstonejs/codec-libjpeg-turbo-8bit` |
| `openjpegwasm_decode.wasm`     | `@cornerstonejs/codec-openjpeg`           |
| `openjphjs.wasm`               | `@cornerstonejs/codec-openjph`            |

For a **subpath** deployment, include the base path. Deriving it from the document keeps one build working at any mount point:

```js
dicomImageLoaderInit({
  wasmBasePath: new URL('assets/cs-wasm/', document.baseURI).href,
});
```

A relative `wasmBasePath` resolves against the decode worker's location, and an absolute path or full URL (e.g. a CDN) is used as given. When the option is unset, the default `import.meta.url` resolution applies, which is what unbundled and script-tag usage relies on.

---

## Vite

### Basic Setup

The following is an example of a Vite configuration for a vite-based project that works with cornerstone3D.

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  plugins: [
    react(),
    // for dicom-parser
    viteCommonjs(),
  ],
  // seems like only required in dev mode
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
  worker: {
    format: 'es',
  },
});
```

:::note
This configuration is for basic usage of cornerstone3D tools, no polySeg and no labelmap interpolation
:::

### Advanced Setup

#### PolySeg

If you need to use polyseg to convert between segmentation representations, you can add the following as a dependency and initialize the cornerstoneTools with the following configuration:

```bash
yarn add @cornerstonejs/polymorphic-segmentation
```

```js
import * as polySeg from '@cornerstonejs/polymorphic-segmentation';
import { init } from '@cornerstonejs/tools';

initialize({
  addons: {
    polySeg,
  },
});
```

Next, you'll need to edit the Vite configuration to include the following. Keep in mind that we're including the WASM files in the build and excluding them from dependency optimization. There is an ongoing issue in vite with `import.meta.url` ([check their GitHub issue](https://github.com/vitejs/vite/issues/8427)), which force us to exclude the wasm files from optimization of dependencies.

```js
export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  plugins: [
    react(),
    // for dicom-parser
    viteCommonjs(),
  ],
  // seems like only required in dev mode
  optimizeDeps: {
    exclude: [
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/polymorphic-segmentation',
    ],
    include: ['dicom-parser'],
  },
  worker: {
    format: 'es',
  },
});
```

#### Labelmap Interpolation

you need to add the following to your vite config:

```bash
yarn add @cornerstonejs/labelmap-interpolation
```

and then you need to edit the vite config to include the following:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  plugins: [
    react(),
    // for dicom-parser
    viteCommonjs(),
  ],
  // seems like only required in dev mode
  optimizeDeps: {
    exclude: [
      '@cornerstonejs/dicom-image-loader',
      '@cornerstonejs/polymorphic-segmentation',
      '@cornerstonejs/labelmap-interpolation',
    ],
    include: ['dicom-parser'],
  },
  worker: {
    format: 'es',
  },
});
```

## Webpack

### Basic Setup

It should work out of the box with no configuration, so the following `nextjs.config.js` is the only thing you need to add.

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // resolve fs for one of the dependencies
    config.resolve.fallback = {
      fs: false,
    };

    return config;
  },
};

export default nextConfig;
```

### Advanced Setup (PolySeg & Labelmap Interpolation)

You might need to add

```js

```

## Troubleshooting

### 1. Rollup Options

By default, we don't include the `@icr/polyseg-wasm`, `itk-wasm`, and `@itk-wasm/morphological-contour-interpolation` libraries in our bundle to keep the size pretty small.
Rollup **might** complain about these libraries, so you can add the following to the rollupOptions:

```js
worker: {
    format: "es",
    rollupOptions: {
      external: ["@icr/polyseg-wasm"],
    },
  },
```

### 2. Path Resolution Issues with @cornerstonejs/core

If you encounter the error "No known conditions for "./types" specifier in "@cornerstonejs/core" package" during build (while development works fine), add the following alias to your Vite configuration:

```javascript
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    '@root': fileURLToPath(new URL('./', import.meta.url)),
    "@cornerstonejs/core": fileURLToPath(new URL('node_modules/@cornerstonejs/core/dist/esm', import.meta.url)),
  },
},
```

### 3. Tool Name Minification Issues

If you experience issues with tool names being minified (e.g., LengthTool being registered as "FE"), you can prevent minification by adding:

```javascript
build: {
  minify: false,
}
```

:::note
These solutions have been tested primarily on macOS but may also apply to other operating systems. If you're using Vuetify or other Vue frameworks, these configurations might need to be adjusted based on your specific setup.
:::

### 4. Webpack

For webpack, simply install the cornerstone3D library and import it into your project.

If you previously used

`noParse: [/(codec)/],`

to avoid parsing codecs in your webpack module, remove that line. The cornerstone3D library now includes the codecs as an ES module.

Also since we are using wasm, you will need to add the following to your webpack configuration in the `module.rules` section:

```javascript
{
  test: /\.wasm/,
  type: 'asset/resource',
},
```

### 5. Svelte + Vite

Similar to the configuration above, use the CommonJS plugin converting commonjs to esm. Otherwise, it will be pending at `await viewport.setStack(stack);`, the image will not be rendered.

```javascript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  plugins: [svelte(), viteCommonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
});
```

:::note Tip
If you are using `sveltekit`, and config like `plugins: [ sveltekit(), viteCommonjs() ]`, `viteCommonjs()` may not work.
Try replace `sveltekit` with `vite-plugin-svelte` and it will work.
