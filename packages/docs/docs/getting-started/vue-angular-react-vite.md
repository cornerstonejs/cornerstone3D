---
id: vue-angular-react-etc
title: 'React, Vue, Angular, etc.'
summary: Guide for integrating Cornerstone3D with popular frontend frameworks, including configuration examples for Vite and Webpack with troubleshooting tips
---

Here are some examples of how to use cornerstone3D with React, Vue, Angular, vite-based frameworks, etc.
We have made it easy to use cornerstone3D with your favorite framework.

Follow the links below to see how to use cornerstone3D with your favorite framework.

- [Cornerstone3D with vite-based React](https://github.com/cornerstonejs/vite-react-cornerstone3d)
- [Cornerstone3D with vite-based Vue](https://github.com/cornerstonejs/vite-vue-cornerstone3d)
- [Cornerstone3D with Angular](https://github.com/cornerstonejs/angular-cornerstone3d)
  - [Community maintained project](https://github.com/yanqzsu/ng-cornerstone)
- [Cornerstone3D with Next.js](https://github.com/cornerstonejs/nextjs-cornerstone3d)

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
