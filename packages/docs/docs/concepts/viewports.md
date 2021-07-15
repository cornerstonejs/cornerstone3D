---
id: viewports
title: Viewports
---


# Viewports

A viewport can be thought of as:

- A camera viewing a scene from a specific perspective.
- A canvas to display the output of this camera.

For example, a CT scene could have 4 viewports in a “4-up” view: Axial MPR, Sagittal MPR, Coronal MPR, A 3D perspective volume render

CS3D includes two types of viewports currently:

## VolumeViewport

- Suitable for rendering a volumetric data which is considered as one 3D image.
- VolumeViewport is consisted of multiple imageIds.
- Having a VolumeViewport enables Multi-planar reformation or reconstruction (MPR) by design, in which you can visualize the volume from various different orientations without addition of performance costs.
- VolumeViewport lives inside a Scene. To define a VolumeViewport, you must provide a SceneUID which is a unique ID for the scene .containing the viewport. By defining a Scene for a VolumeViewport, you automatically enable reusing the same data and rendering it from different angles without data duplication.

## StackViewport

- Suitable for rendering a stack of images, that might or might not belong to the same image.
- Stack can include 2D images of various shapes, size and direction
- For StackViewport, as you don’t need volume rendering functionalities, you don't need to provide a SceneUID. However, we create an *internal* scene by generating a random UID to manage the relationship between viewports and scenes.
