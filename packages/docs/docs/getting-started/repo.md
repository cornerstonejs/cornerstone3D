## Cornerstone3D

This repository contains three projects:

- `/packages/cornerstone-render`: The rendering library equivalent of `cornerstone-core`
- `/packages/cornerstone-tools`: The tool library equivalent of `cornerstone-tools`
- `/packages/cornerstone-image-loader-streaming-volume`: For streaming the volumes into the viewport and progressively loading them
- `/demo`: Consumes all of the above libraries to demonstrate functionality in various `react` demo apps.

In an effort to slowly and intentionally grow the API surface area of these libraries,
we at times rely on functionality in their predecessors. In that same vein, the `demo`
project has a `helpers` folder containing functionality that many consumers of
these libraries would benefit from. These helper functions demonstrate how a consumer can:

- register an external metadata provider
- register an image and volume loader
- add metadata to the provider
- sort the imageIds and lots of other useful utility functions

At a later date, those helpers may make their
way back into the rendering and tool libraries.
