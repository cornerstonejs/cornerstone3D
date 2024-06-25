---
id: external-modules
---

# External Modules

Some modules can be used optionally with `Cornerstone3D` packages, such as the
`dicom-microscopy-viewer` used in the `WSIViewport`. These modules are linked
into a default build using the `addOns/externals/*` packages that contain
a dependency to include in the node-modules directory. However, there are
no direct links in the code to import these modules so that webpack doesnt
embed the external dependency in the overall build. These modules are loaded
through the core utility `getBrowserImport`, for example:

```
import { utilities } from '@cornerstonejs/core';

// Sets the default import settings
utilities.setBrowserImportDefaultOptions( 'myModule', {
   importPath: '/myModule/myModule.min.js'
});

const myImport = await utilities.getBrowserImport('myModule', { importPath: 'default'})
```

This gets the default import path from the `myModule` import

## Requirements for External Module Imported

In order to use the external modules, you have to have a `browserImportFunction`
defined in the html script for your application, for example:

```
<html>
  <head>
    <script>
function browserImportFunction(path) {
  return import(path);
}
    </script>
```

This will import the given path.

## Security Considerations

The import path provided will be requested in the browser context, and the script
being returned will be executed. Thus, you should only permit import paths
which are allowed in your browser context/setup.

## Building Importable Modules

This section is still under development, but for one example that works, see
the github repository [dicom-microscopy-viewer](https://github.com/ImagingDataCommons/dicom-microscopy-viewer)
This contains a functional/published example. In specific, the webpack configuration

```
 output: {
    path: outputPath,
    library: {
      name: 'dicomMicroscopyViewer',
      type: 'window',
    },
    filename: '[name].min.js',
    publicPath: '/dicom-microscopy-viewer/',
  },
```

sets this to build and export a `window.dicomMicroscopyViewer` variable that can
be read once the library is loaded. The path for this is based on the name of the
instance, and uses a sub-path for the overall path name.
