import { expose } from 'comlink';
import { utilities } from '@cornerstonejs/core';
import SegmentStatsCalculator from '../utilities/segmentation/SegmentStatsCalculator';
import { getSegmentLargestBidirectional } from '../utilities/segmentation';
import vtkImageMarchingSquares from '@kitware/vtk.js/Filters/General/ImageMarchingSquares';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getDeduplicatedVTKPolyDataPoints } from '../utilities/contours/getDeduplicatedVTKPolyDataPoints';
import { findContoursFromReducedSet } from '../utilities/contours/contourFinder';

const { VoxelManager } = utilities;

const computeWorker = {
  getArgsFromInfo: (args) => {
    const { segmentationInfo, imageInfo } = args;

    const {
      scalarData: segmentationScalarData,
      dimensions: segmentationDimensions,
      spacing: segmentationSpacing,
      origin: segmentationOrigin,
      direction: segmentationDirection,
    } = segmentationInfo;
    const {
      scalarData: imageScalarData,
      dimensions: imageDimensions,
      spacing: imageSpacing,
      origin: imageOrigin,
      direction: imageDirection,
    } = imageInfo;

    // if dimensions are not the same, for now just throw an error
    if (
      segmentationDimensions[0] !== imageDimensions[0] ||
      segmentationDimensions[1] !== imageDimensions[1] ||
      segmentationDimensions[2] !== imageDimensions[2]
    ) {
      throw new Error(
        'Dimensions do not match to calculate statistics, different dimensions not supported yet'
      );
    }

    // Create VoxelManagers for both segmentation and image data
    const segVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: segmentationDimensions,
      scalarData: segmentationScalarData,
    });

    const imageVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: imageDimensions,
      scalarData: imageScalarData,
    });

    return {
      segmentation: {
        voxelManager: segVoxelManager,
        dimensions: segmentationDimensions,
        spacing: segmentationSpacing,
        origin: segmentationOrigin,
        direction: segmentationDirection,
        scalarData: segmentationScalarData,
      },
      image: {
        voxelManager: imageVoxelManager,
        dimensions: imageDimensions,
        spacing: imageSpacing,
        origin: imageInfo.origin,
        direction: imageInfo.direction,
        scalarData: imageScalarData,
      },
    };
  },
  calculateSegmentsStatisticsVolume: (args) => {
    const { mode, indices } = args;
    const { segmentation, image } = computeWorker.getArgsFromInfo(args);

    const { voxelManager: segVoxelManager, spacing: segmentationSpacing } =
      segmentation;
    const { voxelManager: imageVoxelManager } = image;

    SegmentStatsCalculator.statsInit({ storePointData: false, indices, mode });

    // Use forEach to iterate over all voxels and call statsCallback for those in the segmentation
    segVoxelManager.forEach(
      ({ value, pointIJK, pointLPS, index }) => {
        if (indices.indexOf(value) === -1) {
          return;
        }
        // get the value from the image voxel manager
        const imageValue = imageVoxelManager.getAtIndex(index);

        // Process the voxel for the specific segment index
        SegmentStatsCalculator.statsCallback({
          segmentIndex: value,
          value: imageValue,
          pointIJK,
          pointLPS,
        });
      },
      {
        boundsIJK: imageVoxelManager.getDefaultBounds(),
      }
    );

    // Get statistics based on the mode
    const stats = SegmentStatsCalculator.getStatistics({
      spacing: segmentationSpacing,
      unit: 'mm',
      mode,
    });

    return stats;
  },

  calculateSegmentsStatisticsStack: (args) => {
    const { segmentationInfo, imageInfo, indices, mode } = args;

    // Initialize the SegmentStatsCalculator with the segment indices
    SegmentStatsCalculator.statsInit({ storePointData: true, indices, mode });

    // Create voxel managers for each pair of segmentation and image info
    for (let i = 0; i < segmentationInfo.length; i++) {
      const segInfo = segmentationInfo[i];
      const imgInfo = imageInfo[i];

      const segDimensions = [
        segInfo.dimensions[0],
        segInfo.dimensions[1],
        1, // For a single slice
      ];

      const segVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: segDimensions,
        scalarData: segInfo.scalarData,
      });

      const imageVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: segDimensions,
        scalarData: imgInfo.scalarData,
      });

      // Use forEach to iterate and call statsCallback
      segVoxelManager.forEach(
        ({ value, pointIJK, pointLPS, index }) => {
          if (indices.indexOf(value) === -1) {
            return;
          }

          // get the value from the image voxel manager
          const imageValue = imageVoxelManager.getAtIndex(index);

          // Process the voxel for the specific segment index
          SegmentStatsCalculator.statsCallback({
            segmentIndex: value,
            value: imageValue,
            pointIJK,
            pointLPS,
          });
        },
        {
          boundsIJK: imageVoxelManager.getDefaultBounds(),
        }
      );
    }

    // Pick first one for spacing
    const spacing = segmentationInfo[0].spacing;

    // Get statistics based on the mode
    const stats = SegmentStatsCalculator.getStatistics({
      spacing,
      mode,
    });

    return stats;
  },

  getSegmentLargestBidirectionalInternal: (args) => {
    const { segmentationInfo, indices, mode } = args;
    const { segmentation, image } = computeWorker.getArgsFromInfo(args);
    const contourSets = computeWorker.generateContourSetsFromLabelmap({
      segmentation,
      indices,
    });

    return contourSets;
  },
  generateContourSetsFromLabelmap: (args) => {
    const { segmentation, indices } = args;
    const { voxelManager, dimensions, scalarData, origin, direction, spacing } =
      segmentation;

    const numSlices = dimensions[2];

    const segments = [
      null,
      ...indices.map((index) => ({ segmentIndex: index })),
    ];

    const pixelsPerSlice = dimensions[0] * dimensions[1];

    for (let z = 0; z < numSlices; z++) {
      for (let y = 0; y < dimensions[1]; y++) {
        const index = y * dimensions[0] + z * pixelsPerSlice;
        scalarData[index] = 0;
        scalarData[index + dimensions[0] - 1] = 0;
      }
    }

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(dimensions);
    imageData.setOrigin(origin);
    imageData.setDirection(direction);
    imageData.setSpacing(spacing);

    const ContourSets = [];

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
      });
      for (let sliceIndex = 0; sliceIndex < numSlices; sliceIndex++) {
        // Check if the slice is empty before running marching cube
        if (
          computeWorker.isSliceEmptyForSegmentVolume(
            sliceIndex,
            scalarData,
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
            const value = scalarData[i + frameStart];
            if (value === segIndex) {
              scalars.setValue(i + frameStart, 1);
            } else {
              scalars.setValue(i, 0);
            }
          }

          const mSquares = vtkImageMarchingSquares.newInstance({
            slice: sliceIndex,
          });

          // filter out the scalar data so that only it has background and
          // the current segment index
          const imageDataCopy = vtkImageData.newInstance();

          imageDataCopy.shallowCopy(imageData);
          imageDataCopy.getPointData().setScalars(scalars);

          // Connect pipeline
          mSquares.setInputData(imageDataCopy);
          const cValues = [1];
          mSquares.setContourValues(cValues);
          mSquares.setMergePoints(false);

          // Perform marching squares
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
            });
          }
        } catch (e) {
          console.warn(sliceIndex);
          console.warn(e);
        }
      }

      const ContourSet = {
        sliceContours,
        segment,
      };

      ContourSets.push(ContourSet);
    }

    return ContourSets;
  },
  isSliceEmptyForSegmentVolume: (
    sliceIndex,
    segData,
    pixelsPerSlice,
    segIndex
  ) => {
    const startIdx = sliceIndex * pixelsPerSlice;
    const endIdx = startIdx + pixelsPerSlice;

    for (let i = startIdx; i < endIdx; i++) {
      if (segData[i] === segIndex) {
        return false;
      }
    }

    return true;
  },
};

expose(computeWorker);
