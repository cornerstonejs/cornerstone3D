---
id: vue-angular-react-etc
title: 'React, Vue, Angular, etc.'
---

Here are some examples of how to use cornerstone3D with React, Vue, Angular, etc.
We have made it easy to use cornerstone3D with your favorite framework.

Follow the links below to see how to use cornerstone3D with your favorite framework.

- [Cornerstone3D with React](https://github.com/cornerstonejs/vite-react-cornerstone3d)
- [Cornerstone3D with Vue](https://github.com/cornerstonejs/vue-cornerstone3d)
- [Cornerstone3D with Angular](https://github.com/cornerstonejs/angular-cornerstone3d)
  - [Community maintained project](https://github.com/yanqzsu/ng-cornerstone)
- [Cornerstone3D with Next.js](https://github.com/cornerstonejs/nextjs-cornerstone3d)

## Vite

To update your Vite configuration, use the CommonJS plugin, exclude `dicom-image-loader` from optimization, and include `dicom-parser`. We plan to convert `dicom-image-loader` to an ES module, eliminating the need for exclusion in the future.

```javascript
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  plugins: [viteCommonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
});
```

## Troubleshooting

### 1. @icr/polyseg-wasm Build Issues

If you're using 3D segmentation features and encounter issues with `@icr/polyseg-wasm`, add the following to your Vite configuration:

```javascript
build: {
  rollupOptions: {
    external: ["@icr/polyseg-wasm"],
  }
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

## Svelte + Vite

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
:::
