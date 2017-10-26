# Version 0.15.1

- Added native CustomEvents that are triggered parallel to the jQuery events. This is part of a transition to drop the jQuery dependency entirely.
- *Note:* This version requires Cornerstone Core 0.13.2 or above, where cornerstone.events has the EventTarget interface!

e.g. CornerstoneImageLoadStart has a native CustomEvent name 'cornerstoneimageloadstart'

# Version 0.15.0

- Further fixes for browser native ES6 module loading
- Fix Web Worker tasks being inserted incorrectly based on priority
- Migrate createImage, decodeJPEGBaseline8BitColor, loadFileRequest, getPixelData, and dataSetCacheManager from Deferred to Promises
- Add dependency injection for cornerstone

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