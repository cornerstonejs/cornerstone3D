# Automatic (AI, ML, Interpolation etc) Segmentation Design

This documentation explains how various types of automatic segmentation might work.

# Interaction with Tools

Most of the AI tools for segmentation want some initial area/points selected for the annotation. This can be a set of clicked points, or a box or a freeform region around the area. Additionally, the region is typically either positive - that is, include this region, or negative, exclude this region. Finally, most systems want to automatically run the segmentation on points changing within the annotation. This suggests creating a custom AI integration tool, OR perhaps a custom extension to any tool that allows running tools automatically based on the changes occurring. The points would then be marked as positive or negative points, and may also be marked as being for specific algorithms in some way.

## Changes

- Add the ability to automatically set the finding code on tools
- Define a set of finding codes for segmentAnything plus and negative values
- Hide stats on probe tool
- Add utility to auto-run segmentation on add/remove/modify events and selected annotations
- Add an example page for contour segmentation

# Automatic Next Image Segmentation

In addition to the annotation tools, the ability to automatically extend the segmentation points to the next image area, as well as to automatically have that image ready for analysis allows for users to much more quickly go through a set of images.

## Changes

- On pressing a custom key, auto-generate a set of related annotation points from the current annotation point
- Use a predictive algorithm base on current or current+last annnotation for next
  - For 1 slice only, use same points as current annotation for next annotation
  - For 2 slices, use linear interpolation from last two slices to generate next slice location
  - Merge points that are too close
- As soon as the "next" slice is done, start processing the "next next" slice", and adjust slice data position.
- Parse the annotation results into a contour annotation instance (freeform?)

# Interaction with AI/ML Processing

- Add example code to listen to annotation changes and fire off annotation instance

# Example contourAnnotationAI

A simple example page showing how the annotation might work will be added. This will have basic add/create/remove annotation points, with bindings to left/right buttons.
