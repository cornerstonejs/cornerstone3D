// Import necessary utilities and types from Cornerstone3D core
import { utilities } from '@cornerstonejs/core';

// Import state management functions for handling annotations
import { addAnnotation, removeAnnotation } from '../../stateManagement';
import type { ContourSegmentationAnnotation } from '../../types';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';

// Default tool name used for converted contour segmentation annotations
const DEFAULT_CONTOUR_SEG_TOOL_NAME = 'PlanarFreehandContourSegmentationTool';

/**
 * Converts a contour segmentation annotation to a standardized format.
 * This function takes an existing contour segmentation annotation and transforms it
 * into a new annotation with updated metadata and structure, ensuring compatibility
 * with the PlanarFreehandContourSegmentationTool.
 *
 * The conversion process involves:
 * 1. Validating the input annotation's polyline data
 * 2. Removing the original annotation from the system
 * 3. Creating a new annotation with standardized properties
 * 4. Adding the new annotation back to the system
 *
 * @param annotation - The original contour segmentation annotation to convert
 * @returns The newly created converted annotation, or undefined if conversion fails
 */
export default function convertContourSegmentationAnnotation(
  annotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation {
  // Extract the polyline data from the annotation's contour
  const { polyline } = annotation.data?.contour || {};

  // Validate that the polyline exists and has sufficient points
  // A valid contour requires at least 3 points to form a meaningful shape
  if (!polyline || polyline.length < 3) {
    console.warn(
      'Skipping creation of new annotation due to invalid polyline:',
      polyline
    );
    return;
  }

  // Remove the original annotation from both the general annotation system
  // and the specific contour segmentation system
  removeAnnotation(annotation.annotationUID);
  removeContourSegmentationAnnotation(annotation);

  // Extract the start and end points from the polyline for handle creation
  // These points will be used as the primary handles for the new annotation
  const startPointWorld = polyline[0];
  const endPointWorld = polyline[polyline.length - 1];

  // Create a new annotation with standardized structure and properties
  const newAnnotation: ContourSegmentationAnnotation = {
    // Update metadata with new tool information while preserving original tool name
    metadata: {
      ...annotation.metadata,
      toolName: DEFAULT_CONTOUR_SEG_TOOL_NAME, // Set to standardized tool name
      originalToolName:
        annotation.metadata.originalToolName || annotation.metadata.toolName, // Preserve original tool name
    },
    data: {
      // Reset cached statistics as they may no longer be valid
      cachedStats: {},

      // Create handles using start and end points of the polyline
      handles: {
        points: [startPointWorld, endPointWorld],
        // Preserve text box if it exists, otherwise set to undefined
        textBox: annotation.data.handles.textBox
          ? { ...annotation.data.handles.textBox }
          : undefined,
      },

      // Preserve the original contour data
      contour: {
        ...annotation.data.contour,
      },

      // Preserve spline data if it exists
      spline: annotation.data.spline,

      // Preserve segmentation data
      segmentation: {
        ...annotation.data.segmentation,
      },
    },

    // Generate a new unique identifier for the converted annotation
    annotationUID: utilities.uuidv4() as string,

    // Set default states for the new annotation
    highlighted: true, // Make the annotation highlighted by default
    invalidated: true, // Mark as invalidated to trigger re-rendering
    isLocked: false, // Allow editing of the new annotation
    isVisible: undefined, // Use default visibility settings

    // Preserve interpolation properties if they exist
    interpolationUID: annotation.interpolationUID,
    interpolationCompleted: annotation.interpolationCompleted,
  };

  // Add the new annotation to both the general annotation system
  // and the specific contour segmentation system
  addAnnotation(newAnnotation, annotation.metadata.FrameOfReferenceUID);
  addContourSegmentationAnnotation(newAnnotation);

  // Return the newly created annotation
  return newAnnotation;
}
