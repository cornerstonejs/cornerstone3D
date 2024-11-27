---
id: dicom-image-loader
title: '@cornerstonejs/dicom-image-loader'
---


import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';



# @cornerstonejs/dicom-image-loader

## Initialization and Configuration

**Before:**

```js
cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;
cornerstoneDICOMImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: {
    convertFloatPixelDataToInt: false,
    use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
  },
});

// Additional configuration...
cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);
```

**After:**

```js
cornerstoneDICOMImageLoader.init();

// optionally you can pass a config object to init
cornerstoneDICOMImageLoader.init({
  maxWebWorkers: 2, //
});
```

**Migration Guide:**

1. You should replace configure with `init`
2. You don't need to pass cornerstone and dicomParser anymore, we just use them internally and import them as dependencies
3. Remove `useWebWorkers` option as web workers are now always used.
4. Remove `decodeConfig` options as they are no longer applicable.
5. Remove separate `webWorkerManager.initialize` call as it's now handled internally.
6. Set `maxWebWorkers` in the configure options instead of a separate config object.
   1. by default we set half of the available cores

### Removal of External Module

The `externalModules` file has been removed. Any code relying on `cornerstone.external` should be updated to use direct imports or the new configuration method.
We just treat the cornerstonejs/core and dicomparser as any other dependency and import them directly internally

### Webpack Configuration

Remove the following Webpack rule if present in your configuration:

```json
{
  test: /\.worker\.(mjs|js|ts)$/,
  use: [
    {
      loader: 'worker-loader',
    },
  ],
},
```

Web workers are now handled internally by the library.

## Always `Prescale`

By default, Cornerstone3D always prescales images with the modality LUT (rescale slope and intercept). You probably don't need to make any changes to your codebase.

<details>
<summary>Why?</summary>
The viewport previously made the decision to prescale, and all viewports followed this approach. However, we found prescaling bugs in some user-implemented custom image loaders. We have now fixed these issues by consistently applying prescaling.

</details>

## Decoders Update

`@cornerstonejs/dicomImageLoader` previously utilized the old API for web workers, which is now deprecated. It has transitioned to the new web worker API via our new internal wrapper over `comlink` package. This change enables more seamless interaction with web workers and facilitates compiling and bundling the web workers to match the ESM version of the library.

<details>
<summary>Why?</summary>

To consolidate the web worker API using a new ES module format, which will enable new bundlers like `vite` to work seamlessly with the library.

</details>

So if you had custom logic in your webpack or other bundler you can remove the following rule

```json
{
  test: /\.worker\.(mjs|js|ts)$/,
  use: [
    {
      loader: 'worker-loader',
    },
  ],
},
```

## Removing support for non web worker decoders

We have removed support for non-web worker decoders in the 2.0 version of the cornerstone3D. This change is to ensure that the library is more performant and to reduce the bundle size.

<details>
<summary>Why?</summary>

We see no compelling reason to use non-worker decoders anymore. Web worker decoders offer superior performance and better compatibility with modern bundlers.

</details>

## Removal of `minAfterScale` and `maxAfterScale` on `imageFrame`

in favor of `smallestPixelValue` and `largestPixelValue`, previously they were 4 all used together and was
making it hard to use the correct one.

## DICOM Image Loader ESM default

We have changed the default export of the DICOM Image Loader to ESM in the 2.0 version of the cornerstone3D and correctly
publish types

This mean you don't need to have an alias for the dicom image loader anymore

<Tabs>
  <TabItem value="Before" label="Before 📦 " default>

Probably in your webpack or other bundler you had this

```js
 alias: {
  '@cornerstonejs/dicom-image-loader':
    '@cornerstonejs/dicom-image-loader/dist/dynamic-import/cornerstoneDICOMImageLoader.min.js',
},
```

  </TabItem>
  <TabItem value="After" label="After 🚀🚀">

Now you can remove this alias and use the default import

  </TabItem>
</Tabs>

<details>
<summary>Why?</summary>

ESM is the future of javascript, and we want to ensure that the library is compatible with modern bundlers and tools.

</details>

---
