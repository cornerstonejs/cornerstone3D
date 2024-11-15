---
id: volumes
title: Volumes
---

# Volumes

A volume is a 3D data array that has a physical size and orientation in space. It can be built by composing pixel data and metadata of a 3D imaging series, or can be defined from scratch by the application. A volume has a `FrameOfReferenceUID`, `voxelSpacing (x,y,z)`, `voxel dimensions (x,y,z)`, `origin`, and `orientation` vectors which uniquely define its coordinate system with respect to the patient coordinate system.

## ImageVolume

In `Cornerstone3D` we use the `ImageVolume` base class to represent a 3D image volume. All volumes are derived from this class. For instance
the `StreamingImageVolume` which is used to represent a volume that is being streamed image by image. We will discuss the `StreamingImageVolume` class in more detail later.

```js
interface IImageVolume {
  /** unique identifier of the volume in the cache */
  readonly volumeId: string
  /** volume dimensions */
  dimensions: Point3
  /** volume direction */
  direction: Float32Array
  /** volume metadata */
  metadata: Metadata
  /** volume origin - set to the imagePositionPatient of the last image in the volume */
  origin: Point3
  /** volume scaling metadata */
  scaling?: {
    PET?: {
      SUVlbmFactor?: number
      SUVbsaFactor?: number
      suvbwToSuvlbm?: number
      suvbwToSuvbsa?: number
    }
  }
  /** volume size in bytes */
  sizeInBytes?: number
  /** volume spacing */
  spacing: Point3
  /** number of voxels in the volume */
  numVoxels: number
  /** volume image data as vtkImageData */
  imageData?: vtkImageData
  /** openGL texture for the volume */
  vtkOpenGLTexture: any
  /** loading status object for the volume containing loaded/loading statuses */
  loadStatus?: Record<string, any>
  /** imageIds of the volume (if it is built of separate imageIds) */
  imageIds?: Array<string>
  /** volume referencedVolumeId (if it is derived from another volume) */
  referencedVolumeId?: string // if volume is derived from another volume
  /** voxel manager */
  voxelManager?: IVoxelManager
}
```

## Voxel Manager

The `VoxelManager` is responsible for managing the voxel data of a volume. In previous version of `Cornerstone3D` we used to include `scalarData` in the `ImageVolume` object. However, this approach had several limitations in memory usage and performance. Therefore, we now delegate the voxel data management to the `VoxelManager` class which is a stateful class that keeps track of the voxel data in a volume.

You can read more about the `VoxelManager` class [here](./voxelManager.md).
