# Version 0.14.7

- Bumped up cornerstone version to 0.12.2
- Removed library `Loadash` and added `Lodash` as a DevDependency

# Version 0.14.5

- Rename loadDataSetFromPromise to loadImageFromPromise (https://github.com/chafey/cornerstoneWADOImageLoader/pull/94)
- Set web worker status ready after task is read (https://github.com/chafey/cornerstoneWADOImageLoader/pull/95)
- Fixes for dependencies after migration to Webpack (@lscoder)

# Version 0.14.4

- Migrate to new build process with Webpack and Babel. Remove grunt from WebWorker and Codec file construction. (@lscoder)
- Fixes for examples after inital migration steps (@kofifus, @lscoder)
- Typo in package.json (@JMiha)
- Bug fix for the inital draw of color images with WW/WC 255/128
- Bug fixes for JPEG Baseline 8 Bit decoding (https://github.com/chafey/cornerstoneWADOImageLoader/issues/46)