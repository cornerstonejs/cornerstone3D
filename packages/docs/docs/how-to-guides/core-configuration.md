---
id: core-configuration
---


# Configuration

The project in the `packages/demo/` directory is used to demonstrate usage and
library features.

### Requirements

- [Node >=12.13.0](https://nodejs.org/en/download/)
- [Yarn >=1.19.1](https://classic.yarnpkg.com/en/docs/install/)
- NPM Packages: `dicom-parser`, `cornerstone-core`, `cornerstone-wado-image-loader`, [`calculate-suv`](https://github.com/PrecisionMetrics/calculate-suv), `vtk.js`

_NOTE:_

- **vtk.js** has [special instructions for consuming it as an ES6 dependency](https://kitware.github.io/vtk-js/docs/intro_vtk_as_es6_dependency.html) and must resolve to an unpublished variant using this [URL](https://github.com/swederik/vtk-js.git#perf/md5-built)
- **calculate-suv** needs to resolve to an unpublished variant using this URL: `git+ssh://git@github.com/PrecisionMetrics/calculate-suv.git#main`
- **calculat-suv** and **cornerstone-wado-image-loader** require the user to have permission to read from those repositories (reach out to your Radical Imaging / MGH contact to request access)

### Rendering Configuration

```js title="packages/demo/src/helpers/initCornerstone.js"
// External dependencies
import dicomParser from 'dicom-parser'
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader'
import cornerstone from '@ohif/cornerstone-render'
import { imageLoader } from '@ohif/cornerstone-render'
import WADORSHeaderProvider from './WADORSHeaderProvider'

// Add our metadata provider at a very high priority
cornerstone.metaData.addProvider(
  WADORSHeaderProvider.get.bind(WADORSHeaderProvider),
  9999
)

// Configure and register our image loader
cornerstoneWADOImageLoader.external.cornerstone = cornerstone
cornerstoneWADOImageLoader.external.dicomParser = dicomParser
cornerstoneWADOImageLoader.configure({ useWebWorkers: true })

const config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: false,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
      strict: false,
    },
  },
}

cornerstoneWADOImageLoader.webWorkerManager.initialize(config)

// Registers the rendering library's image loader
// Works for imageIds prefixed with `csiv:`
imageLoader.registerImageLoader(cornerstone)
```
