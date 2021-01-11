# vtkjs-viewport

> VTK.js powered offscreen rendering engine and tool framework for 3D
> visualisation of medical images.

[![NPM](https://img.shields.io/npm/v/react-vtkjs-viewport.svg)](https://www.npmjs.com/package/react-vtkjs-viewport)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport?ref=badge_shield)

## Install

This project requires `vtk.js` as an ES6 dependency.
[If you're unsure of how to consume `vtk.js` as an ES6 dependency, please check out Kitware's guide.](https://kitware.github.io/vtk-js/docs/intro_vtk_as_es6_dependency.html#Webpack-config)

```bash
# With NPM
npm install --save react-vtkjs-viewport vtk.js

# With Yarn
yarn add react-vtkjs-viewport vtk.js
```

## Development

Local development uses `<root>/examples` as a test application. You can import
the VTK Viewport and the app configuration configuration using a WebPack alias
like so:

```js
import VtkViewport from '@vtk-viewport'
```

Any updates to the example files or the VtkViewport's source will cause WebPack
to rebuild.

```bash
# Restore Dependencies
yarn install

# Start Local Dev Server
yarn run dev

# Or Start Local Dev Server with a non-default config:
APP_CONFIG=config/myCustomConfig.js yarn run dev
```

Development configuration looks like this:

```js
export default {
  // The WADO-RS root of your DICOMWeb server
  wadoRsRoot,
  // The StudyInstanceUID of the target study.
  StudyInstanceUID,
  // The SeriesInstanceUID of the target CT dataset.
  ctSeriesInstanceUID,
  // The SeriesInstanceUID of the target PT dataset.
  ptSeriesInstanceUID,
  // Optional: limitFrames will limit the number of frames
  // fetched from each series to speed up testing. e.g. limitFrames: 5.
  limitFrames,
}
```

## License

MIT © [OHIF](https://github.com/OHIF)

<!--
    Links
-->

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport?ref=badge_large)
