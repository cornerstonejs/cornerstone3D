---
id: volumes
title: Volumes
---

# Volumes

A volume is a 3D data array that has a physical size and orientation in space. It can be built by composing pixel data and metadata of a 3D imaging series, or can be defined from scratch by the application. A volume has a `FrameOfReferenceUID`, `voxelSpacing (x,y,z), `voxel dimensions (x,y,z)`, `origin`, and `orientation` vectors which uniquely define its coordinate system with respect to the patient coordinate system.


## Converting volumes from/to images

As we created a volume based on a series of fetched images (2D), a Volume can implement functions to convert its 3D pixel data to 2D images without re-requesting them over the network. For instance, our `StreamingImageVolume` implements `convertToCornerstoneImage` which takes an imageId and its imageId index and return a Cornerstone Image object (ImageId Index is required since we want to locate the imageId pixelData in the 3D array and copy it over the Cornerstone Image).

This is a process that can be reverted; `Cornerstone3D` can create a volume from a set of imageIds if they have properties of a volume (Same FromOfReference, origin, dimension, direction and pixelSpacing).

You can read more about decaching volume into a set of images in the `Cache` section.
