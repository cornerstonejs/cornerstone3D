---
id: measurement-units
title: Measurement Units
summary: Specifies the measurement units used for CS3D in various situations.
---

# Measurement Units

Digital images don't have any native physical size associated with the image like
a photograph does, and even in a photograph, the size of the photograph will seldom
match the size of the original objects. Objects farther away in the picture will
appear smaller. Digital imaging has all of these issues and more, with the added
risk that getting a measurement or position wrong on medical images can result in
patient harm. This document tries to explain how the calibration and various
user warnings to allow figuring out the measurement scaling and annotations.

Beyond position measurements, the color or grayscale value in medical images can
also be of interest by itself. In ultrasound images, sometimes there is a doppler
section of the image showing colours for velocity. In other images, the grayscale
value can be related to the uptake of various dyes and markers.

The types of medical images are broadly broken up into:

- Volumetric images such as CT or MR where each element of an image represents a voxel
- Projection images such as an X-Ray where there is a point source, and the object being
  imaged is between the source and detector plate.
- Visible light images such as those taken with a standard camera of a skin lesion
- Video images, like the visible light but with a time component to them.
  There are also other time based series for imaging such as MR images of a beating heart.
- Composite images such as ultrasound that have different image types within a single image area
