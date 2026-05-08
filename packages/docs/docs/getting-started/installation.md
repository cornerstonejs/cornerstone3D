---
id: installation
title: Installation
summary: Instructions for installing Cornerstone3D packages using npm, yarn, or pnpm, including core, tools, and image loader packages
---

# Installation

## NPM

You can install `Cornerstone3D`, `Cornerstone3DTools`, and `StreamingImageVolumeLoader` using [npm](https://www.npmjs.com/).
You can install the latest version of the packages by running:

```bash
npm install @cornerstonejs/core
npm install @cornerstonejs/tools
npm install @cornerstonejs/dicom-image-loader
npm install @cornerstonejs/nifti-volume-loader

# To use the polymorphic segmentation converters you need to install the following packages as well
npm install @icr/polyseg-wasm
```

## YARN

If you are using [Yarn](https://yarnpkg.com/), you can install the packages by running:

```bash
yarn add @cornerstonejs/core
yarn add @cornerstonejs/tools
yarn add @cornerstonejs/dicom-image-loader
yarn add @cornerstonejs/nifti-volume-loader

# To use the polymorphic segmentation converters you need to install the following packages as well
yarn add @icr/polyseg-wasm
```

## PNPM

If you are using [PNPM](https://pnpm.io), you can install packages by running:

```bash
pnpm install @cornerstonejs/core
pnpm install @cornerstonejs/tools
pnpm install @cornerstonejs/dicom-image-loader
pnpm install @cornerstonejs/nifti-volume-loader

# To use the polymorphic segmentation converters you need to install the following packages as well
pnpm install @icr/polyseg-wasm
```
