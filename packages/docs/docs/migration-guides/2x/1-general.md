---
id: general
title: 'General'
summary: Overview of general changes when migrating from Cornerstone3D 1.x to 2.x, including frameworks support, SharedArrayBuffer removal, TypeScript updates, and package exports
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# General

## Video Guide

Watch this video guide for a [visual walkthrough](https://www.youtube.com/embed/tkQiVLftpuI?si=HbFitXWowvlndI0i) of the migration process:

<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/tkQiVLftpuI?si=HbFitXWowvlndI0i"
  title="YouTube video player"
  frameborder="0"
  loading="lazy"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen
></iframe>

## Frameworks

We have worked hard to enhance the developer experience when using Cornerstone3D with various frameworks like React, Vue, Angular, Vite, and Webpack.

For more information, please refer to the [frameworks](../../getting-started/vue-angular-react-vite.md) page.

You need to modify your Vite and Webpack configurations to correctly import the Cornerstone3D library. Check each framework's repository for more details.

## Removal of SharedArrayBuffer

We have streamlined the process of loading volumes without sacrificing speed by eliminating the need for shared array buffers. This change resolves issues across various frameworks, where previously, specific security headers were required. Now, you can remove any previously set headers, which lowers the barrier for adopting Cornerstone 3D in frameworks that didn't support those headers. Shared array buffers are no longer necessary, and all related headers can be removed.

You can remove `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` from your custom headers if you don't need them in other
aspects of your app.

## Typescript Version

We have upgraded the typescript version from 4.6 to 5.5 in the 2.0 version of the cornerstone3D.
This upgrade most likely don't require any changes in your codebase, but it is recommended to update the typescript version in your project to 5.5
to avoid any issues in the future.

<details>
<summary>Why?</summary>

The upgrade to TypeScript 5.4 allows us to leverage the latest features and improvements offered by the TypeScript standard. You can read more about it here: https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/

</details>

## ECMAScript Target

In Cornerstone3D version 1.x, we targeted ES5. With the release of version 2.0, we have updated our target to `ES2022`.

<details>
<summary>Why?</summary>

It will result in a smaller bundle size and improved performance. There is a good chance that your setup already supports ES2022:

https://compat-table.github.io/compat-table/es2016plus/

</details>

## Remove of CJS, only ESM builds

Starting with Cornerstone3D 2.x, we will no longer ship the CommonJS (CJS) and UMD builds of the library. You most likely won't need to make any changes to your codebase. If you are aliasing the cjs library in your bundler, you can remove it completely.

<details>
<summary>Why?</summary>
Both Node.js and modern browsers now support ECMAScript Modules (ESM) by default.
</details>

:::note Tip
If you must use CJS, for example, if you are using `dicom-image-loader` and `dicom-parser`, you need to use `vite-plugin-commonjs` to convert CommonJS to ESM. For more information, please refer to the [Frameworks](../../getting-started/vue-angular-react-vite.md) page.
:::

## Package Exports

The Cornerstone libraries now utilize the `exports` field in their `package.json` files. This allows for more precise control over how modules are imported and ensures compatibility with different build systems.

Below are examples of how to import modules from each package, along with explanations of the `exports` field configuration.

<details>
<summary><b>@cornerstonejs/adapters</b></summary>

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "types": "./dist/esm/index.d.ts"
    },
    "./cornerstone": {
      "import": "./dist/esm/adapters/Cornerstone/index.js",
      "types": "./dist/esm/adapters/Cornerstone/index.d.ts"
    },
    "./cornerstone/*": {
      "import": "./dist/esm/adapters/Cornerstone/*.js",
      "types": "./dist/esm/adapters/Cornerstone/*.d.ts"
    },
    "./cornerstone3D": {
      "import": "./dist/esm/adapters/Cornerstone3D/index.js",
      "types": "./dist/esm/adapters/Cornerstone3D/index.d.ts"
    },
    "./cornerstone3D/*": {
      "import": "./dist/esm/adapters/Cornerstone3D/*.js",
      "types": "./dist/esm/adapters/Cornerstone3D/*.d.ts"
    },
    "./enums": {
      "import": "./dist/esm/adapters/enums/index.js",
      "types": "./dist/esm/adapters/enums/index.d.ts"
    }
    // ... other exports
  }
}
```

**Import Examples:**

```js
import * as cornerstoneAdapters from '@cornerstonejs/adapters'; // Imports the main entry point
import * as cornerstoneAdapter from '@cornerstonejs/adapters/cornerstone'; // Imports the Cornerstone adapter
import { someModule } from '@cornerstonejs/adapters/cornerstone/someModule'; // Imports a specific module from the Cornerstone adapter
import * as cornerstone3DAdapter from '@cornerstonejs/adapters/cornerstone3D'; // Imports the Cornerstone3D adapter
// ... other imports
```

</details>

<details>
<summary><b>@cornerstonejs/core</b></summary>

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "types": "./dist/esm/index.d.ts"
    },
    "./utilities": {
      // Subpath export
      "import": "./dist/esm/utilities/index.js",
      "types": "./dist/esm/utilities/index.d.ts"
    },
    "./utilities/*": {
      // Wildcard subpath export
      "import": "./dist/esm/utilities/*.js",
      "types": "./dist/esm/utilities/*.d.ts"
    }
    // ... other exports
  }
}
```

**Import Examples:**

```js
import * as cornerstoneCore from '@cornerstonejs/core'; // Imports the main entry point
import * as utilities from '@cornerstonejs/core/utilities'; // Imports the utilities module
import { someUtility } from '@cornerstonejs/core/utilities/someUtility'; // Imports a specific utility
// ... other imports
```

</details>

<details>
<summary><b>@cornerstonejs/tools</b></summary>

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "types": "./dist/esm/index.d.ts"
    },
    "./tools": {
      // Subpath export for tools
      "import": "./dist/esm/tools/index.js",
      "types": "./dist/esm/tools/index.d.ts"
    },
    "./tools/*": {
      // Wildcard subpath export for tools
      "import": "./dist/esm/tools/*.js",
      "types": "./dist/esm/tools/*.d.ts"
    }
    // ... other exports
  }
}
```

**Import Examples:**

```js
import * as cornerstoneTools from '@cornerstonejs/tools'; // Imports the main entry point
import * as tools from '@cornerstonejs/tools/tools'; // Imports the tools module
import { someTool } from '@cornerstonejs/tools/tools/someTool'; // Imports a specific tool
// ... other imports
```

</details>

<details>
<summary><b>@cornerstonejs/dicom-image-loader</b></summary>

```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "types": "./dist/esm/index.d.ts"
    },
    "./imageLoader": {
      // Subpath export for the image loader
      "import": "./dist/esm/imageLoader/index.js",
      "types": "./dist/esm/imageLoader/index.d.ts"
    }
    // ... other exports
  }
}
```

**Import Examples:**

```js
import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader'; // Imports the main entry point
import * as imageLoader from '@cornerstonejs/dicom-image-loader/imageLoader'; // Imports the imageLoader module specifically
// ... other imports
```

</details>

### cloneDeep

The `structuredClone` function has replaced the previous method. You don't need to make any changes to your codebase that uses Cornerstone3D.

<details>
<summary>Why?</summary>
Why to depend on a third-party library when we can use the native browser API?

</details>

---

## <!-- //////////////////////////////////////// //////////////////// //////////////////// //////////////////// ////////////////////   -->
