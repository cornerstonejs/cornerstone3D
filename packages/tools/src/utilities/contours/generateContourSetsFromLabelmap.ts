import { cache as cornerstoneCache, type Types } from '@cornerstonejs/core';
import vtkImageMarchingSquares from '@kitware/vtk.js/Filters/General/ImageMarchingSquares';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import { getDeduplicatedVTKPolyDataPoints } from './getDeduplicatedVTKPolyDataPoints';
import { findContoursFromReducedSet } from './contourFinder';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';

const { Labelmap } = SegmentationRepresentations;

function generateContourSetsFromLabelmap({ segmentations }) {
  const { representationData, segments = [0, 1] } = segmentations;
  const { volumeId: segVolumeId } = representationData[Labelmap];

  // Get segmentation volume
  const vol = cornerstoneCache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  const numSlices = vol.dimensions[2];

  // NOTE: Workaround for marching squares not finding closed contours at
  // boundary of image volume, clear pixels along x-y border of volume
  const voxelManager = vol.voxelManager as Types.IVoxelManager<number>;
  const pixelsPerSlice = vol.dimensions[0] * vol.dimensions[1];

  for (let z = 0; z < numSlices; z++) {
    for (let y = 0; y < vol.dimensions[1]; y++) {
      const index = y * vol.dimensions[0] + z * pixelsPerSlice;
      voxelManager.setAtIndex(index, 0);
      voxelManager.setAtIndex(index + vol.dimensions[0] - 1, 0);
    }
  }

  // end workaround
  //
  //
  const ContourSets = [];

  const { FrameOfReferenceUID } = vol.metadata;
  // Iterate through all segments in current segmentation set
  const numSegments = segments.length;
  for (let segIndex = 0; segIndex < numSegments; segIndex++) {
    const segment = segments[segIndex];

    // Skip empty segments
    if (!segment) {
      continue;
    }

    const sliceContours = [];
    const scalars = vtkDataArray.newInstance({
      name: 'Scalars',
      numberOfComponents: 1,
      size: pixelsPerSlice * numSlices,
      dataType: 'Uint8Array',
    }) as vtkDataArray;

    const { containedSegmentIndices } = segment;
    for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
      // Check if the slice is empty before running marching cube
      if (
        isSliceEmptyForSegment(
          sliceIndex,
          voxelManager,
          pixelsPerSlice,
          segIndex
        )
      ) {
        continue;
      }
      const frameStart = sliceIndex * pixelsPerSlice;

      try {
        // Modify segData for this specific segment directly
        for (let i = 0; i < pixelsPerSlice; i++) {
          const value = voxelManager.getAtIndex(i + frameStart);
          if (value === segIndex || containedSegmentIndices?.has(value)) {
            // @ts-expect-error vtk has wrong types
            scalars.setValue(i + frameStart, 1);
          } else {
            // @ts-expect-error vtk has wrong types
            scalars.setValue(i, 0);
          }
        }

        const mSquares = vtkImageMarchingSquares.newInstance({
          slice: sliceIndex,
        });

        // filter out the scalar data so that only it has background and
        // the current segment index
        const imageDataCopy = vtkImageData.newInstance();

        imageDataCopy.shallowCopy(vol.imageData);
        imageDataCopy.getPointData().setScalars(scalars);

        // Connect pipeline
        // @ts-ignore
        mSquares.setInputData(imageDataCopy);
        const cValues = [1];
        // @ts-ignore
        mSquares.setContourValues(cValues);
        // @ts-ignore
        mSquares.setMergePoints(false);

        // Perform marching squares
        // @ts-ignore
        const msOutput = mSquares.getOutputData();

        // Clean up output from marching squares
        const reducedSet = getDeduplicatedVTKPolyDataPoints(msOutput);
        if (reducedSet.points?.length) {
          const contours = findContoursFromReducedSet(reducedSet.lines);

          sliceContours.push({
            contours,
            polyData: reducedSet,
            FrameNumber: sliceIndex + 1,
            sliceIndex,
            FrameOfReferenceUID,
          });
        }
      } catch (e) {
        console.warn(sliceIndex);
        console.warn(e);
      }
    }

    const metadata = {
      FrameOfReferenceUID,
    };

    const ContourSet = {
      label: segment.label,
      color: segment.color,
      metadata,
      sliceContours,
    };

    ContourSets.push(ContourSet);
  }

  return ContourSets;
}

function isSliceEmptyForSegment(
  sliceIndex,
  voxelManager,
  pixelsPerSlice,
  segIndex
) {
  const startIdx = sliceIndex * pixelsPerSlice;
  const endIdx = startIdx + pixelsPerSlice;

  for (let i = startIdx; i < endIdx; i++) {
    if (voxelManager.getAtIndex(i) === segIndex) {
      return false;
    }
  }

  return true;
}

export { generateContourSetsFromLabelmap };
