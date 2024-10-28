# DICOM Image Loader

This package provides a DICOM image loader for the Cornerstone library.
This is the successor to the [cornerstoneDICOMImageLoader] which provides the following
added features:

- Typescript support (and type definitions)
- Better developer experience (e.g. mono repo, linting, etc)

A [cornerstone](https://github.com/cornerstonejs/cornerstone) Image Loader for
DICOM P10 instances over HTTP (WADO-URI) or DICOMWeb (WADO-RS) and Local filedisk. This can be used
to integrate cornerstone with WADO-URI servers, DICOMWeb servers or any other
HTTP based server that returns DICOM P10 instances (e.g.
[Orthanc](http://www.orthanc-server.com/) or custom servers)

## Key Features

- Implements a
  [cornerstone ImageLoader](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/imageLoader)
  for DICOM P10 Instances via a HTTP get request.
  - Can be used with a WADO-URI server
  - Can be used with Orthanc's file endpoint
  - Can be used with any server that returns DICOM P10 instances via HTTP GET
- Implements a
  [cornerstone ImageLoader](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/imageLoader)
  for WADO-RS (DICOMWeb)
- Supports many popular transfer syntaxes and photometric interpretations
  [see full list](_media/TransferSyntaxes.md)
  and [codec](_media/Codecs.md) for more information.
- Dynamicly Utilizes WebAssembly (WASM) builds of each codec which sgnificantly improves image decoding performance and enables us to load codec at runtime when needed dynamically, which reduces the build time and complexity.
- Framework to execute CPU intensive tasks in [web workers](_media/WebWorkers.md)
  - Used for image decoding
  - Can be used for your own CPU intensive tasks (e.g. image processing)

## Install

### NPM

```bash
yarn add @cornerstonejs/dicom-image-loader
```

## Usage

Specify the cornerstone instance you want to register the loader with.

```javascript
cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
```

Have your code configure the web worker framework:

```javascript
var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
};
cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);
```

See the [web workers](_media/WebWorkers.md) documentation for more details on
configuring.

#### Dynamic Import

To be able to use the dynamic import feature for CDIL, instead of

```js
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
```

you need to do:

```js
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader/dist/dynamic-import/cornerstoneDICOMImageLoader.min.js';
```

This way, codecs are loaded dynamically when needed. You have another option to
create an alias in the webpack config file:

```js
resolve: {
  alias: {
    '@cornerstonejs/dicom-image-loader':
      '@cornerstonejs/dicom-image-loader/dist/dynamic-import/cornerstoneDICOMImageLoader.min.js',
  },
},
```

In addition WASM builds of the codec files should be made available in the build
folder. You can use `CopyWebpackPlugin` to copy the WASM files to the build folder.

```js
 plugins: [
  new CopyWebpackPlugin([
    {
      from:
        '../../../node_modules/@cornerstonejs/dicom-image-loader/dist/dynamic-import',
      to: DIST_DIR,
    },
  ]),
```

Note 1: You need to give the correct path in the `CopyWebpackPlugin`, the above
path is relative to the `node_modules` folder in the OHIF Viewer.

Note 2: For other http servers like IIS, you need to configure it to serve WASM
files with the correct MIME type.

## Loading

![Alt text](_media/load.png)

## Backlog

- ESM build for the library
- Make the examples work again
- Free up DICOM P10 instance after decoding to reduce memory consumption
- Look at using EMSCRIPTEN based build of IJG for JPEG
- Add support for bulk data items to WADO-RS Loader
- WebWorker Manager
  - Better handling of web worker loading
  - Add events to webWorkerManager so its activity can be monitored
  - Add support for issuing progress events from web worker tasks

# FAQ

_Why is this a separate library from cornerstone?_

Mainly to avoid adding a dependency to cornerstone for the DICOM parsing
library. While cornerstone is intended to be used to display medical images that
are stored in DICOM, cornerstone aims to simplify the use of medical imaging and
therefore tries to hide some of the complexity that exists within DICOM. It is
also desirable to support display of non DICOM images so a DICOM independent
image model makes sense.

_How do I build this library myself?_

See the documentation [here](_media/Building.md)

_How do I add my own custom web worker tasks?_

See the documentation [here](_media/WebWorkers.md)

_How do I create imageIds that work with this image loader?_

See the documentation [here](_media/ImageIds.md)

# What Transfer Syntaxes are supported?

See [transfer syntaxes](_media/TransferSyntaxes.md)

[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE

[npm-url]: https://npmjs.org/package/@cornerstonejs/dicom-image-loader
[npm-version-image]: http://img.shields.io/npm/v/@cornerstonejs/dicom-image-loader.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/@cornerstonejs/dicom-image-loader.svg?style=flat

[travis-url]: http://travis-ci.org/cornerstonejs/cornerstoneDICOMImageLoader
[travis-image]: https://travis-ci.org/cornerstonejs/cornerstoneDICOMImageLoader.svg?branch=master

[coverage-url]: https://coveralls.io/github/cornerstonejs/cornerstoneDICOMImageLoader?branch=master
[coverage-image]: https://coveralls.io/repos/github/cornerstonejs/cornerstoneDICOMImageLoader/badge.svg?branch=master
