---
id: core-installation
---

# Installation

This is repository is unpublished and unversioned. It's installation and
configuration may be unfamiliar or difficult for those unacquainted with JS
packaging and bundling. Please follow the below guidance carefully and report
any issues or innacuracies.

- Installing (Options)
  - #1 Link directly to this GitHub repository in your package.json
  - #2 Publish to private or local registry
- Configuration
  - Requirements
  - `@Render` Library
  - `@Tools` Library
- Next Steps

## Setup

The packages in this repository are not yet published to a public or private
package registry. As a consumer, you have a few options:

### #1 Link directly to this GitHub repository in your package.json

0. The developer must have access to this repository
1. [Add the library to your package.json using a commit-ish Git URL](https://stackoverflow.com/questions/14187956/npm-install-from-git-in-a-specific-version)
2. Import the packaged librar(ies) as needed:

```js
import * as rendering from 'vtkjs-viewport/dist/rendering.umd.min.js'
import * as tools from 'vtkjs-viewport/dist/tools.umd.min.js'
```

2b. OR import the libraries at their source entry points

- [Make sure your bundler's "exclude rules" do not include this library](https://github.com/babel/babel-loader/issues/171#issuecomment-163385201)
- Include loaders for TS and VTK.js dependencies (see this library's `./webpack.config.js`)

```js
// Webpack
const config = {
  // ...
  exclude: /node_modules\/(?![module1|module2])/,
}
```

### #2 Publish to private or local registry

- [How to publish a private NPM package](https://docs.npmjs.com/creating-and-publishing-private-packages)
- [How to publish to GitHub's package registry](https://docs.github.com/en/packages/learn-github-packages/publishing-a-package)
- [How to setup a private NPM registry locally](https://blog.bitsrc.io/how-to-set-up-a-private-npm-registry-locally-1065e6790796)

In each of the above instances, you will need to build this solution prior to
publishing. You can then either publish the `@Rendering` and `@Tools` library
as a single or separate packages.

_If you publish them jointly..._

The default import for this library is located at `./dist/rendering.umd.min.js`.
This means you will have to do the following to import each library:

```js
// @Rendering
import * as rendering from 'vtkjs-viewport'
// Or...
import * as rendering from 'vtkjs-viewport/dist/rendering.umd.min.js'

// @Tools
import * as tools from 'vtkjs-viewport/dist/tools.umd.min.js'
```

_If you publish them separately..._

You will need to create a separate `package.json` for the `@Tools` library that
includes a new project name, and updates the `"main"` tag to point at: `./dist/tools.umd.min.js`.
This simplifies your import statements:

```js
// @Rendering
import * as rendering from 'vtkjs-viewport'
// @Tools
import * as tools from 'vtkjs-viewport-tools'
```

## Configuration

The project in the `examples/` directory is used to demonstrate usage and
library features.

### Requirements

- [Node >=12.13.0](https://nodejs.org/en/download/)
- [Yarn >=1.19.1](https://classic.yarnpkg.com/en/docs/install/)
- NPM Packages: `dicom-parser`, `cornerstone-core`, `cornerstone-wado-image-loader`, [`calculate-suv`](https://github.com/PrecisionMetrics/calculate-suv), `vtk.js`

_NOTE:_

- `vtk.js` has [special instructions for consuming it as an ES6 dependency](https://kitware.github.io/vtk-js/docs/intro_vtk_as_es6_dependency.html) and must resolve to an unpublished variant using this URL: https://github.com/swederik/vtk-js.git#perf/md5-built
- `calculate-suv` nees to resolve to an unpublished variant using this URL: git+ssh://git@github.com/PrecisionMetrics/calculate-suv.git#main
- `cornerstone-wado-image-loader` needs to resolve to an unpublished variant using this URL: git+ssh://git@github.com/PrecisionMetrics/cornerstoneWADOImageLoader.git#merge-suv-calculation
- `calculat-suv` and `cornerstone-wado-image-loader` require the user to have permission to read from those repositories (reach out to your Radical Imaging / MGH contact to request access)

### @Render

```js
// External dependencies
import dicomParser from 'dicom-parser'
import cornerstone from 'cornerstone-core'
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader'
// See: `/examples/helpers/WADORSHeaderProvider`
import WADORSHeaderProvider from './WADORSHeaderProvider'
// ~~ This project's rendering library
import { registerImageLoader } from 'vtkjs-viewport'

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
// Works for imageIds prefixed with `vtkjs:`
registerImageLoader(cornerstone)
```

### @Tools

This requires all of the above `@Rendering` configuration, as well as the following:

```js
// Import "from" will change depending on package publishing strategy
import * as csTools3d from 'vtkjs-viewport-tools'

// Wire up listeners for renderingEngine
csTools3d.init()
```

## Next Steps

For next steps, you can:

- [Check out the Usage documentation](#)
- [Explore our example application's source code](#)
