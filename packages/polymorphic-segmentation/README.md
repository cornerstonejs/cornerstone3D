# Cornerstone Segmentation Polymorphic Segmentation

A powerful and flexible segmentation addon for Cornerstone3D that provides polymorphic segmentation capabilities.

## Overview

The Polymorphic Segmentation package extends Cornerstone3D's segmentation capabilities with advanced features for creating, manipulating, and visualizing segmentations across different modalities and use cases.

## Installation

```bash
npm install @cornerstonejs/polymorphic-segmentation
```

## Initialization

To use the Polymorphic Segmentation package with Cornerstone Tools, you need to initialize it as an addon during the Cornerstone Tools initialization process.

### Basic Initialization

```js
import { init } from '@cornerstonejs/tools';
import * as polySeg from '@cornerstonejs/polymorphic-segmentation';

// Initialize Cornerstone Tools with the Polymorphic Segmentation addon
await init({
  addons: {
    polySeg,
  },
});
```

:::note
If you don't initialize polySeg as an addon, you will not be able to use the polymorphic segmentation features. But the
rest of the Cornerstone3D components will work as expected.
:::

## License

MIT
