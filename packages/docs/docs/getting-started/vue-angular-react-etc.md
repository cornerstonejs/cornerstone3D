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
import { viteCommonjs } from "@originjs/vite-plugin-commonjs"


export default defineConfig({
  plugins: [viteCommonjs()],
  optimizeDeps: {
    exclude: ["@cornerstonejs/dicom-image-loader"],
    include: ["dicom-parser"],
  },
})
```


## Webpack

For webpack, simply install the cornerstone3D library and import it into your project.

If you previously used

`noParse: [/(codec)/],`

to avoid parsing codecs in your webpack module, remove that line. The cornerstone3D library now includes the codecs as an ES module.
