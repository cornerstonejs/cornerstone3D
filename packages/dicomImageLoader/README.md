[![NPM version][npm-version-image]][npm-url]
[![NPM downloads][npm-downloads-image]][npm-url]
[![MIT License][license-image]][license-url]
[![Build Status][travis-image]][travis-url]
[![Coverage Status][coverage-image]][coverage-url]

# cornerstone WADO Image Loader

A [cornerstone](https://github.com/cornerstonejs/cornerstone) Image Loader for
DICOM P10 instances over HTTP (WADO-URI) or DICOMWeb (WADO-RS). This can be used
to integrate cornerstone with WADO-URI servers, DICOMWeb servers or any other
HTTP based server that returns DICOM P10 instances (e.g.
[Orthanc](http://www.orthanc-server.com/) or custom servers)

## Key Features

- Implements a
  [cornerstone ImageLoader](https://github.com/cornerstonejs/cornerstone/wiki/ImageLoader)
  for DICOM P10 Instances via a HTTP get request.
  - Can be used with a WADO-URI server
  - Can be used with Orthanc's file endpoint
  - Can be used with any server that returns DICOM P10 instances via HTTP GET
- Implements a
  [cornerstone ImageLoader](https://github.com/cornerstonejs/cornerstone/wiki/ImageLoader)
  for WADO-RS (DICOMWeb)
- Supports many popular transfer syntaxes and photometric interpretations
  [see full list](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/master/docs/TransferSyntaxes.md)
  and [codec](docs/Codecs.md) for more information.
- Framework to execute CPU intensive tasks in [web workers](docs/WebWorkers.md)
  - Used for image decoding
  - Can be used for your own CPU intensive tasks (e.g. image processing)

## Live Examples

[Click here for a live example of this library in use!](http://rawgithub.com/cornerstonejs/cornerstoneWADOImageLoader/master/examples/index.html)

You can also see it in action with the
[cornerstoneDemo application](https://github.com/chafey/cornerstoneDemo).

## Install

Get the distributed unminimized file:

- [cornerstoneWADOImageLoader.js](https://unpkg.com/cornerstone-wado-image-loader)

or the distributed minimized file:

- [cornerstoneWADOImageLoader.bundle.min.js](https://unpkg.com/cornerstone-wado-image-loader)

## Usage

The cornerstoneWADOImageLoader depends on the following external libraries which
should be loaded before cornerstoneWADOImageLoader.js:

1. [dicomParser](https://github.com/cornerstonejs/dicomParser)
2. [cornerstone](https://github.com/cornerstonejs/cornerstone)

_New in 1.0.0_: Specify the cornerstone instance you want to register the loader
with.

```javascript
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
```

Have your code configure the web worker framework:

```javascript
var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
```

See the [web workers](docs/WebWorkers.md) documentation for more details on
configuring.

## Upgrade to CWIL v4.x

Cornerstone-WADO-Image-Loader (CWIL) v4.0.x has been released, which adds
support for using WebAssembly (WASM) builds of each codec. This significantly
improves image decoding performance and enables us to load codec at runtime when
needed dynamically, which reduces the build time and complexity.

In addition, we have improved the image loading performance in CWIL v4.x. In
previous versions of CWIL, image loading includes fetching AND decoding an image
before returning a promise completion, preventing more requests from being made
until the queue is empty. This limitation has been fixed in CWIL v4, which
separates image retrieval and decoding into two steps. Now after an image is
retrieved, a new request is sent to the server immediately.

|                     | Improvement                                        |
| ------------------- | -------------------------------------------------- |
| CWIL Bundle Size    | 30x smaller (3.0 MB vs 87 kb with dynamic import)  |
| JPEG Baseline Codec | 4.5x faster (2.87 ms for 512x512 16 bit CT Slice)  |
| JPEG 2000 Codec     | 1.8x faster (41.02 ms for 512x512 16 bit CT Slice) |

### Steps to upgrade

#### Dynamic Import

In v4.x, we have added dynamic importing support for the codecs as needed. To be
able to use such feature, instead of

```js
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
```

you need to do:

```js
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader/dist/dynamic-import/cornerstoneWADOImageLoader.min.js';
```

This way, codecs are loaded dynamically when needed. You have another option to
create an alias in the webpack config file as we do
[here](https://github.com/OHIF/Viewers/blob/33307d3cd28599cbb4d7189560afdd7f65033ab8/platform/viewer/.webpack/webpack.pwa.js#L65)
for OHIF Viewer.

```js
resolve: {
  alias: {
    'cornerstone-wado-image-loader':
      'cornerstone-wado-image-loader/dist/dynamic-import/cornerstoneWADOImageLoader.min.js',
  },
},
```

In addition WASM builds of the codec files should be made available in the build
folder. We use `CopyWebpackPlugin` to copy the WASM files to the build folder.
See
[here](https://github.com/OHIF/Viewers/blob/33307d3cd28599cbb4d7189560afdd7f65033ab8/platform/viewer/.webpack/webpack.pwa.js#L100)
for how we do it in OHIF Viewer.

```js
 plugins: [
  new CopyWebpackPlugin([
    {
      from:
        '../../../node_modules/cornerstone-wado-image-loader/dist/dynamic-import',
      to: DIST_DIR,
    },
  ]),
```

Note 1: You need to give the correct path in the `CopyWebpackPlugin`, the above
path is relative to the `node_modules` folder in the OHIF Viewer.

Note 2: For other http servers like IIS, you need to configure it to serve WASM
files with the correct MIME type.

## Troubleshooting

Having problems viewing your images with cornerstonWADOImageLoader? Check out
the
[troubleshooting guide](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/wiki/troubleshooting).

## Backlog

- Support for images with pixel padding
- Support for high bit (e.g. mask out burned in overlays)
- Free up DICOM P10 instance after decoding to reduce memory consumption
- Add support for compressed images to WADO-RS loader
- Look at using EMSCRIPTEN based build of IJG for JPEG
- Consolidate all EMSCRIPTEN codecs into one build to cut down on memory use and
  startup times
- Add support for bulk data items to WADO-RS Loader
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

See the documentation [here](docs/Building.md)

_How do I add my own custom web worker tasks?_

See the documentation [here](docs/WebWorkers.md)

_How do I create imageIds that work with this image loader?_

See the documentation [here](docs/ImageIds.md)

# What Transfer Syntaxes are supported?

See [transfer syntaxes](docs/TransferSyntaxes.md)

# Copyright

Copyright 2016 Chris Hafey [chafey@gmail.com](mailto:chafey@gmail.com)

<!--
  LINKS
-->

<!-- prettier-ignore-start -->

[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE

[npm-url]: https://npmjs.org/package/cornerstone-wado-image-loader
[npm-version-image]: http://img.shields.io/npm/v/cornerstone-wado-image-loader.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/cornerstone-wado-image-loader.svg?style=flat

[travis-url]: http://travis-ci.org/cornerstonejs/cornerstoneWADOImageLoader
[travis-image]: https://travis-ci.org/cornerstonejs/cornerstoneWADOImageLoader.svg?branch=master

[coverage-url]: https://coveralls.io/github/cornerstonejs/cornerstoneWADOImageLoader?branch=master
[coverage-image]: https://coveralls.io/repos/github/cornerstonejs/cornerstoneWADOImageLoader/badge.svg?branch=master

<!-- prettier-ignore-end -->

```

```
