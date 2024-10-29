---
id: developer-experience
title: 'Developer Experience'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


# Developer Experience

### Dependency Cycles

We have removed all dependency cycles in the library, ensuring it is now free of any such issues. To maintain this, we have added rules in our linters that will catch any dependency cycles in pull requests during continuous integration. Additionally, you can run `yarn run format-check` to ensure that the formatting is correct and to check for dependencies as well.

### Published APIs

We have now published the APIs for the DICOM Image Loader and Nifti Volume Loader. So in creating your PRs don't forget to run `yarn run build:update-api` and include the generated files in your PR.

### Karma tests

There has been a lot of work to clean up tests let's dive in

#### Setup and Cleanup

Before, we had scattered logic:

```js
beforeEach(function () {
  csTools3d.init();
  csTools3d.addTool(BidirectionalTool);
  cache.purgeCache();
  this.DOMElements = [];
  this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
  this.stackToolGroup.addTool(BidirectionalTool.toolName, {
    configuration: { volumeId: volumeId },
  });
  this.stackToolGroup.setToolActive(BidirectionalTool.toolName, {
    bindings: [{ mouseButton: 1 }],
  });

  this.renderingEngine = new RenderingEngine(renderingEngineId);
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);
});

afterEach(function () {
  csTools3d.destroy();
  cache.purgeCache();
  eventTarget.reset();
  this.renderingEngine.destroy();
  metaData.removeProvider(fakeMetaDataProvider);
  imageLoader.unregisterAllImageLoaders();
  ToolGroupManager.destroyToolGroup('stack');

  this.DOMElements.forEach((el) => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
});
```

Now it's centralized:

```js
beforeEach(function () {
  const testEnv = testUtils.setupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
    viewportIds: [viewportId],
    tools: [BidirectionalTool],
    toolConfigurations: {
      [BidirectionalTool.toolName]: {
        configuration: { volumeId: volumeId },
      },
    },
    toolActivations: {
      [BidirectionalTool.toolName]: {
        bindings: [{ mouseButton: 1 }],
      },
    },
  });
  renderingEngine = testEnv.renderingEngine;
  toolGroup = testEnv.toolGroups['default'];
});

afterEach(function () {
  testUtils.cleanupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
  });
});
```

<details>
<summary>Why?</summary>

It was causing many issues with timeout and race conditions.

</details>

#### Viewport Creation

We've centralized the previously repeated logic for viewport creation into one place.

```js
const element = testUtils.createViewports(renderingEngine, {
  viewportId,
  viewportType: ViewportType.STACK,
  width: 512,
  height: 128,
});
```

#### Image Id

Previously, for the fake image loader, you should have used:

```js
const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
```

This string encoded various parameters. Now, it has been restructured into an object for better clarity:

```js
const imageInfo1 = {
  loader: 'fakeImageLoader',
  name: 'imageURI',
  rows: 64,
  columns: 64,
  barStart: 32,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
  sliceIndex: 0,
};

const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
```

same exists for volumeId

```js
const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 4,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});
```
