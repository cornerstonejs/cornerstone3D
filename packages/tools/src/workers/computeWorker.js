import { expose } from 'comlink';
import { utilities } from '@cornerstonejs/core';
import SegmentStatsCalculator from '../utilities/segmentation/SegmentStatsCalculator';
import { getSegmentLargestBidirectional } from '../utilities/segmentation';
import vtkImageMarchingSquares from '@kitware/vtk.js/Filters/General/ImageMarchingSquares';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getDeduplicatedVTKPolyDataPoints } from '../utilities/contours/getDeduplicatedVTKPolyDataPoints';
import { findContoursFromReducedSet } from '../utilities/contours/contourFinder';
import { createBidirectionalForSlice } from '../utilities/segmentation/findLargestBidirectional';
import { createIsInSegmentMetadata } from '../utilities/segmentation/isLineInSegment';

const { VoxelManager } = utilities;

const computeWorker = {
  getArgsFromInfo: (args) => {
    const { segmentationInfo, imageInfo } = args;

    // Create segmentation data
    const getSegmentationData = () => {
      const {
        scalarData: segmentationScalarData,
        dimensions: segmentationDimensions,
        spacing: segmentationSpacing,
        origin: segmentationOrigin,
        direction: segmentationDirection,
      } = segmentationInfo;

      const segVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: segmentationDimensions,
        scalarData: segmentationScalarData,
      });

      return {
        voxelManager: segVoxelManager,
        dimensions: segmentationDimensions,
        spacing: segmentationSpacing,
        origin: segmentationOrigin,
        direction: segmentationDirection,
        scalarData: segmentationScalarData,
      };
    };

    // Create image data
    const getImageData = () => {
      const {
        scalarData: imageScalarData,
        dimensions: imageDimensions,
        spacing: imageSpacing,
        origin: imageOrigin,
        direction: imageDirection,
      } = imageInfo;

      const imageVoxelManager = VoxelManager.createScalarVolumeVoxelManager({
        dimensions: imageDimensions,
        scalarData: imageScalarData,
      });

      return {
        voxelManager: imageVoxelManager,
        dimensions: imageDimensions,
        spacing: imageSpacing,
        origin: imageOrigin,
        direction: imageDirection,
        scalarData: imageScalarData,
      };
    };

    return {
      segmentation: segmentationInfo && getSegmentationData(),
      image: imageInfo && getImageData(),
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
    const { segmentationInfo, imageInfo, indices, mode, isStack } = args;

    let segmentation;
    if (!isStack) {
      ({ segmentation } = computeWorker.getArgsFromInfo(args));
    } else {
      ({ segmentation } = computeWorker.getArgsFromInfo({
        segmentationInfo: segmentationInfo[0],
      }));
    }

    const { voxelManager, dimensions, origin, direction, spacing } =
      segmentation;

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(
      isStack ? [dimensions[0], dimensions[1], 2] : dimensions
    );
    imageData.setOrigin(origin);
    imageData.setDirection(direction);
    imageData.setSpacing(isStack ? [spacing[0], spacing[1], 1] : spacing);

    let contourSets;
    if (!isStack) {
      contourSets = computeWorker.generateContourSetsFromLabelmapVolume({
        segmentation,
        indices,
        imageData,
      });
    } else {
      contourSets = computeWorker.generateContourSetsFromLabelmapStack({
        segmentationInfo,
        indices,
      });
    }

    const bidirectionalData = [];

    for (let i = 0; i < contourSets.length; i++) {
      const contourSet = contourSets[i];
      const { segmentIndex } = contourSet.segment;
      const contours = contourSet.sliceContours;

      let maxBidirectional;
      const isInSegment = createIsInSegmentMetadata({
        dimensions,
        imageData,
        voxelManager,
        segmentIndex,
      });

      for (const sliceContour of contours) {
        const bidirectional = createBidirectionalForSlice(
          sliceContour,
          isInSegment,
          maxBidirectional
        );
        if (!bidirectional) {
          continue;
        }
        maxBidirectional = bidirectional;
      }

      bidirectionalData.push({
        segmentIndex,
        ...maxBidirectional,
      });
    }
    return bidirectionalData;
  },
  generateContourSetsFromLabelmapVolume: (args) => {
    const { segmentation, indices, imageData } = args;
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
  generateContourSetsFromLabelmapStack: (args) => {
    const { segmentationInfo, imageInfo, indices, mode } = args;

    if (segmentationInfo.length > 1) {
      throw new Error(
        'Segment Bidirectional Stack mode only supports one image at the moment'
      );
    }

    let ContourSets = [];

    // Create voxel managers for each pair of segmentation and image info
    for (let i = 0; i < segmentationInfo.length; i++) {
      const segInfo = segmentationInfo[i];

      const dimensions = segInfo.dimensions;
      const segScalarData = segInfo.scalarData;
      const { spacing, direction, origin } = segInfo;
      const segDimensions = [
        dimensions[0],
        dimensions[1],
        1, // For a single slice
      ];

      const segments = [
        null,
        ...indices.map((index) => ({ segmentIndex: index })),
      ];

      const pixelsPerSlice = dimensions[0] * dimensions[1];
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
          size: pixelsPerSlice,
          dataType: 'Uint8Array',
        });

        // Check if the slice is empty before running marching cube

        // Filter the segScalarData to only include the current segment
        const filteredData = new Uint8Array(segScalarData.length);
        for (let i = 0; i < segScalarData.length; i++) {
          if (segScalarData[i] === segIndex) {
            filteredData[i] = 1;
          } else {
            filteredData[i] = 0;
          }
        }

        const scalarArray = vtkDataArray.newInstance({
          name: 'Pixels',
          numberOfComponents: 1,
          values: filteredData,
        });

        const imageData = vtkImageData.newInstance();
        imageData.setDimensions(dimensions);
        imageData.setSpacing([spacing[0], spacing[1], 1]);
        imageData.setDirection(direction);
        imageData.setOrigin(origin);
        imageData.getPointData().setScalars(scalarArray);

        try {
          const mSquares = vtkImageMarchingSquares.newInstance({
            slicingMode: 2, // Z axis
            mergePoints: false,
            contourValues: [1],
          });

          // Connect pipeline
          mSquares.setInputData(imageData);

          // Perform marching squares
          const msOutput = mSquares.getOutputData();

          // Clean up output from marching squares
          const reducedSet = getDeduplicatedVTKPolyDataPoints(msOutput);
          if (reducedSet.points?.length) {
            const contours = findContoursFromReducedSet(reducedSet.lines);

            sliceContours.push({
              contours,
              polyData: reducedSet,
            });
          }
        } catch (e) {
          console.warn(e);
        }

        const ContourSet = {
          sliceContours,
          segment,
        };

        ContourSets.push(ContourSet);
      }
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
