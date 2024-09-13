---
id: geometryLoader
title: Geometry Loaders
---

# Geometry Loaders

This section describes the geometry loaders in Cornerstone Core.

If you read the Segmentation rendering [section](../cornerstone-tools/segmentation/index.md)
you can see that a Segmentation can be rendered as a Volume (Labelmap), or it can be
rendered as a Contour, or Surface (not implemented yet).

:::note TIP
Similar relationship structure has been adapted in popular medical imaging software
such as [3D Slicer](https://www.slicer.org/) with the addition of [polymorph segmentation](https://github.com/PerkLab/PolySeg).
:::

Geometry loaders are used to load geometry data from a file or URL in general. Currently,
we only support loading and caching the Contour geometry using the `createAndCacheGeometry` (which accepts only the data, so no loading yet) however, additional loaders such as XML, JSON, OBJ, STL, PLY, etc. can be added in the future so that the geometry data can be loaded in different formats.
