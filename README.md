# react-vtkjs-viewport

> VTK.js image viewport component for React 

[![NPM](https://img.shields.io/npm/v/react-vtkjs-viewport.svg)](https://www.npmjs.com/package/react-vtkjs-viewport)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport?ref=badge_shield)

## Install

This project consumes `vtk.js` as an ES6 dependency. [If you're unsure of how to consume `vtk.js` as an ES6 dependency, please check out Kitware's guide.](https://kitware.github.io/vtk-js/docs/intro_vtk_as_es6_dependency.html#Webpack-config)

```bash
# With NPM
npm install --save react-vtkjs-viewport vtk.js

# With Yarn
yarn add react-vtkjs-viewport vtk.js
```

## Development

Local development uses `<root>/examples` as a test application. You can import
the VTK Viewport using a WebPack alias like so:

`import VtkViewport from '@vtk-viewport'`

Any updates to the example files or the VtkViewport's source will cause WebPack
to rebuild.

```bash
# Restore Dependencies
yarn install

# Start Local Dev Server
yarn run dev
```

## License

MIT © [OHIF](https://github.com/OHIF)

<!--
    Links
-->


[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FOHIF%2Freact-vtkjs-viewport?ref=badge_large)
