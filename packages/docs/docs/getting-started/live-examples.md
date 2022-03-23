---
id: live-examples
---


## High level design considerations

These libraries expand upon and update the interfaces `cornerstone.js` provided
to better support volume rendering, 3D aware tools, and PET images support. These
interfaces and functionality are broadly identified as:

- Rendering / Renderer
- Image Loading / Image Loader
- Metadata Provider
- Tools

`@ohif/cornerstone-render` is a "rendering" library built on top of `vtk.js`.
which leverages `cornerstone`'s existing plumbing to integrate with image loaders and metadata providers. The `demo` package in this repository contains a simple "metadata provider", named "WADORSHeaderProvider", that allows for querying metadata by instance and
imageId.

This repository's `@ohif/cornerstone-tools` is a "tools" library that, once initialized, will listen for custom events emitted by `@ohif/cornerstone-render`. Please note, the event naming and handling overlaps the events and event handling in the `cornerstone-tools` library. If you attempt to use `cornerstone-tools` in tandem, you will likely encounter issues. As this is a possible use case, please don't hesitate to report any issues and propose potential solutions.
