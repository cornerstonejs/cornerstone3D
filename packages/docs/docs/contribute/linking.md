---
id: linking
---

# Linking packages

Often time you will want to link to a package to Cornerstone3D, this might be
to develop a feature, to debug a bug or for other reasons.

For instance, you find a bug in the rendering of the color images in
`cornerstone3D`, digging deeper into the code you can find you need to debug
inside `cornerstone-wado-image-loader` as the RGB images are decoded there. In order
to do so, you need to link a local development version of 'cornerstone-wado-image-loader'
to the `cornerstone3D` package, and put your `debugger` in the `cornerstone-wado-image-loader`
source code.

Also, sometimes you may want to link the external packages to include libraries into
your build that are not direct dependencies but are dynamically loaded. See the externals/README.md
file for details.

## Yarn Link

There are various ways to link to a package. The most common way is to use
[`yarn link`](https://classic.yarnpkg.com/en/docs/cli/link). In the following examples,
we assume we want to link the `cornerstone-wado-image-loader` package to our
`cornerstone3D` package.

```bash
// inside cornerstone-wado-image-loader

yarn link

// inside cornerstone3D (at the root - not the packages)

yarn link cornerstone-wado-image-loader
```

However, this is not enough. We need to tell the `cornerstone-wado-image-loader`
to build so that your changes to the source code are reflected/used in `Cornerstone3D`.
For `cornerstone-wado-image-loader` to build, you can run `yarn build`. However,
it will take a while to build the package. `cornerstone-wado-image-loader`
comes with various webpack configurations, you can use/run the
`yarn webpack:dynamic:watch` at the root of `cornerstone-wado-image-loader` to
force the reflected changes to be built again which is faster than `yarn build`.
and it also watches for changes to the source code and rebuilds the package.

## External Components

Some components such as the `dicom-microscopy-viewer` are linked externally as
optional inclusions in the overall `cornerstone3D` package. You will need to
add a peerImport function which can import the required modules, and register
your function with the cornerstone init method.

## Tips

1. `yarn link` is actually a symlink between packages. If your linking is not working,
   check out the `node_modules` in the `Cornerstone3D` directory to see if the symlink
   has been created (the updated source code - not the dist - is available in the `node_modules`).

2. If your `debugger` is not hitting, you might want to change the `mode` setting
   in the webpack to be `development` instead of `production`. This ensures, minification
   is not applied to the source code.

3. Use a more verbose source map for debugging. You can read more [here](https://webpack.js.org/configuration/devtool/)
