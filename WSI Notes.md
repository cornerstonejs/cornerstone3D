# WSI Notes

The WSI viewer is a fairly basic viewer intended only to demonstrate that it is possible to use the `dicom-microscopy-viewer` (DMV) project within OHIF.  There are a number of issues with the viewer as it stands which would need to be addressed:

1. The viewport as implemented relies on some changes to DMV which would need to be
   completed and published to the public repository.
   * Estimate: 1 week

2. The positioning of annotations, zooming and panning all have some number of bugs that
   cause issues with display.  These would need to be ironed out.
   * Estimate: 1 week

3. The entire area retrieve data framework is broken in terms of fundamental design because
   it relies on having sufficient memory to store an entire level of data.  This would be required to be fixed in order to add support for things like Circle ROI data
   * Estimate: 2 weeks

4. Loading of the DMV component and the WSI component itself is integrated into the
   `@cornerstonejs/core` component, meaning it is suddenly much larger.  This needs to be turned into a separate component that can be runtime loaded using the WebPack es5 module
   extensions.
   * Estimate: 1 week

5. Any segmentation of WSI would require a new segmentation model which allows for a better representation for segmentation objects.  Perhaps just using outline segmentations would work, as that can be drawn effectively at scale.
   * DICOM Seg is part of the standard.  Supporting it will require converting to outline or handling fractional segmentations (broken up into a map)
   * DICOM Seg is just getting a compression TSUID added
  * Estimate 1: Contour Segmentation
    * Base Segmentation Display and editing: 2 weeks
    * Segmentation Rendering Performance: 2 weeks (to allow displaying lots of contours)
  * Estimate 2: Labelmap segmentation (given contour + optimizations)
    * Labelmap creation/editing/display on WSI: 3 weeks
    * DICOM Seg Import: 1 week
    * Implementation of preliminary WG-04 DICOM Seg Compression:  1 week

6. The mapping between annotation and image position is missing.  This would need to be added to allow finding the annotations and figuring out which layer to display them on.
git
  * Estimate: 1 week

7a. WSI encoder for non-DICOM WSI data.  If the scanner is not outputting DICOM WSI, then converting from scanner raw data into DICOM is required.  This is expected to take at least 1 month's time per scanner format, plus a base/overall converter of 6 weeks.

7b. WSI encoder for large DICOM non-WSI single frames.   For this item to make sense, the images need to be slow to handle using the existing HTJ2K progressive encoding techniques.  The actual conversion here isn't too hard, but because it loses significant parts of the original data stream, would need to be justified as being sufficiently better than HTJ2K.
Another solution here is to add better blocked encoding to the HTJ2K encoder to allow decoding of sub-resolution blocks to have teh decoding natively use map fragmented image data.
   * The estimate on this would be 2 weeks to encode HTJ2K into the WSI format


Base estimate: 16 weeks
 + 5 weeks for labelmap segmentation
 + various for WSI encoder
