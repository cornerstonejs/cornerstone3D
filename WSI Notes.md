# WSI Notes

The WSI viewer is a fairly basic viewer intended only to demonstrate that it is possible to use the `dicom-microscopy-viewer` (DMV) project within OHIF.  There are a number of issues with the viewer as it stands which would need to be addressed:

1. The viewport as implemented relies on some changes to DMV which would need to be
   completed and published to the public repository.

2. The positioning of annotations, zooming and panning all have some number of bugs that
   cause issues with display.  These would need to be ironed out.

3. The entire area retrieve data framework is broken in terms of fundamental design because
   it relies on having sufficient memory to store an entire level of data.  This would be required to be fixed in order to add support for things like Circle ROI data

4. Loading of the DMV component and the WSI component itself is integrated into the
   `@cornerstonejs/core` component, meaning it is suddenly much larger.  This needs to be turned into a separate component that can be runtime loaded using the WebPack es5 module
   extensions.

5. Any segmentation of WSI would require a new segmentation model which allows for a better representation for segmentation objects.  Perhaps just using outline segmentations would work, as that can be drawn effectively at scale.

6. The mapping between annotation and image position is completely missing.  This would need to be added to allow finding the annotations and figuring out which layer to display them on.
git
