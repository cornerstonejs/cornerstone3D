---
id: geometryLoader
title: Geometry Loaders
---

# Geometry Loaders

This section describes the geometry loaders in Cornerstone Core.

If you read the Segmentation rendering [section](../cornerstone-tools/segmentation/index.md)
you can see that a Segmentation can be rendered as a Volume (Labelmap), or it can be
rendered as a Contour, or Surface.

:::note TIP
Similar relationship structure has been adapted in popular medical imaging software
such as [3D Slicer](https://www.slicer.org/) with the addition of [polymorph segmentation](https://github.com/PerkLab/PolySeg).
:::

Geometry loaders are used to load and cache geometry data from a file or URL in general.

## Register Mesh Loader

You can use [`registerGeometryLoader`](/docs/api/core/namespaces/geometryloader/functions/registerGeometryLoader) to make an external mesh loader available to the cornerstone library. This function accept a `scheme` which the mesh loader function (second argument) should act on.

```js
import {
  geometryLoader,
  cornerstoneMeshLoader,
  Enums,
  Types,
} from '@cornerstonejs/core';

geometryLoader.registerGeometryLoader('mesh', cornerstoneMeshLoader);
```

### CornerstoneMeshLoader

You can take a look at our sample code example for `cornerstoneMeshLoader` [here](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/core/examples/meshLoader)

```js
const mesh1 = await geometryLoader.loadAndCacheGeometry(
  'mesh:https://example.com/mesh.ply',
  {
    type: Enums.GeometryType.MESH,
    geometryData: {
      id: 'mesh1',
      format: Enums.MeshType.PLY,
    } as Types.MeshData,
  }
);

const mesh2 = await geometryLoader.loadAndCacheGeometry(
  'mesh:https://example.com/mesh.obj',
  {
    type: Enums.GeometryType.MESH,
    geometryData: {
      id: 'mesh2',
      format: Enums.MeshType.OBJ,
      materialUrl: 'https://example.com/material.mtl',
    } as Types.MeshData,
  }
);

viewport.setActors([
  { uid: mesh1.id, actor: (mesh1.data as Types.IMesh).actor },
  { uid: mesh2.id, actor: (mesh2.data as Types.IMesh).actor },
]);
```

#### Supported mesh formats

The supported mesh formats for the `cornerstoneMeshLoader` are:

- PLY
- OBJ
- STL
- VTP

### Supported material formats

The supported material formats for the `cornerstoneMeshLoader` are:

- MTL
- JPG
- PNG
- JPEG
