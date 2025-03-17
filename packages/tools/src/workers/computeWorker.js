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
  createVoxelManager: (dimensions, scalarData) => {
    return VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData,
    });
  },
  createDataStructure: (info) => {
    const { scalarData, dimensions, spacing, origin, direction } = info;

    const voxelManager = computeWorker.createVoxelManager(
      dimensions,
      scalarData
    );

    return {
      voxelManager,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
    };
  },
  createVTKImageData: (dimensions, origin, direction, spacing) => {
    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(dimensions);
    imageData.setOrigin(origin);
    imageData.setDirection(direction);
    imageData.setSpacing(spacing);
    return imageData;
  },
  processSegmentStatistics: (
    segVoxelManager,
    imageVoxelManager,
    indices,
    bounds
  ) => {
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
        boundsIJK: bounds || imageVoxelManager.getDefaultBounds(),
      }
    );
  },
  performMarchingSquares: (
    imageData,
    sliceIndex = null,
    slicingMode = null
  ) => {
    const options = {};

    if (sliceIndex !== null) {
      options.slice = sliceIndex;
    }

    if (slicingMode !== null) {
      options.slicingMode = slicingMode;
    }

    const mSquares = vtkImageMarchingSquares.newInstance(options);

    // Connect pipeline
    mSquares.setInputData(imageData);
    mSquares.setContourValues([1]);
    mSquares.setMergePoints(false);

    // Perform marching squares
    return mSquares.getOutputData();
  },
  createContoursFromPolyData: (msOutput, sliceIndex = null) => {
    // Clean up output from marching squares
    const reducedSet = getDeduplicatedVTKPolyDataPoints(msOutput);
    if (reducedSet.points?.length) {
      const contours = findContoursFromReducedSet(reducedSet.lines);

      return {
        contours,
        polyData: reducedSet,
      };
    }
    return null;
  },
  createSegmentsFromIndices: (indices) => {
    return [null, ...indices.map((index) => ({ segmentIndex: index }))];
  },
  getArgsFromInfo: (args) => {
    const { segmentationInfo, imageInfo } = args;

    // Create segmentation data
    const getSegmentationData = () => {
      return computeWorker.createDataStructure(segmentationInfo);
    };

    // Create image data
    const getImageData = () => {
      return computeWorker.createDataStructure(imageInfo);
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

    // Process segment statistics
    computeWorker.processSegmentStatistics(
      segVoxelManager,
      imageVoxelManager,
      indices
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

      const segVoxelManager = computeWorker.createVoxelManager(
        segDimensions,
        segInfo.scalarData
      );
      const imageVoxelManager = computeWorker.createVoxelManager(
        segDimensions,
        imgInfo.scalarData
      );

      // Process segment statistics
      computeWorker.processSegmentStatistics(
        segVoxelManager,
        imageVoxelManager,
        indices
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

    // Create VTK image data
    const stackDimensions = isStack
      ? [dimensions[0], dimensions[1], 2]
      : dimensions;
    const stackSpacing = isStack ? [spacing[0], spacing[1], 1] : spacing;
    const imageData = computeWorker.createVTKImageData(
      stackDimensions,
      origin,
      direction,
      stackSpacing
    );

    let contourSets;
    if (!isStack) {
      contourSets = computeWorker.generateContourSetsFromLabelmapVolume({
        segmentation,
        indices,
        imageData,
        mode,
      });
    } else {
      contourSets = computeWorker.generateContourSetsFromLabelmapStack({
        segmentationInfo,
        indices,
        mode,
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

      if (maxBidirectional) {
        bidirectionalData.push({
          segmentIndex,
          majorAxis: maxBidirectional.majorAxis,
          minorAxis: maxBidirectional.minorAxis,
          maxMajor: maxBidirectional.maxMajor,
          maxMinor: maxBidirectional.maxMinor,
        });
      }
    }
    return bidirectionalData;
  },
  generateContourSetsFromLabelmapVolume: (args) => {
    const { segmentation, indices, imageData } = args;
    const { voxelManager, dimensions, scalarData, origin, direction, spacing } =
      segmentation;

    const numSlices = dimensions[2];
    const pixelsPerSlice = dimensions[0] * dimensions[1];

    // Create segments from indices
    const segments = computeWorker.createSegmentsFromIndices(indices);

    // Clear the border of each slice to avoid edge artifacts
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

      const segmentIndex = segment.segmentIndex;

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
            segmentIndex
          )
        ) {
          continue;
        }

        const frameStart = sliceIndex * pixelsPerSlice;

        try {
          // Modify segData for this specific segment directly
          for (let i = 0; i < pixelsPerSlice; i++) {
            const value = scalarData[i + frameStart];
            if (value === segmentIndex) {
              scalars.setValue(i + frameStart, 1);
            } else {
              scalars.setValue(i, 0);
            }
          }

          // Create a copy of image data with segment-specific scalars
          const imageDataCopy = vtkImageData.newInstance();
          imageDataCopy.shallowCopy(imageData);
          imageDataCopy.getPointData().setScalars(scalars);

          // Perform marching squares
          const msOutput = computeWorker.performMarchingSquares(
            imageDataCopy,
            sliceIndex
          );

          // Process contours
          const contourData = computeWorker.createContoursFromPolyData(
            msOutput,
            sliceIndex
          );
          if (contourData) {
            sliceContours.push(contourData);
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
    const { segmentationInfo, indices } = args;

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

      // Create segments from indices
      const segments = computeWorker.createSegmentsFromIndices(indices);

      const pixelsPerSlice = dimensions[0] * dimensions[1];
      // Iterate through all segments in current segmentation set
      const numSegments = segments.length;
      for (let segIndex = 0; segIndex < numSegments; segIndex++) {
        const segment = segments[segIndex];

        // Skip empty segments
        if (!segment) {
          continue;
        }

        const segmentIndex = segment.segmentIndex;

        const sliceContours = [];

        // Filter the segScalarData to only include the current segment
        const filteredData = new Uint8Array(segScalarData.length);
        for (let i = 0; i < segScalarData.length; i++) {
          if (segScalarData[i] === segmentIndex) {
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

        // Create VTK image data
        const imageData = computeWorker.createVTKImageData(
          dimensions,
          origin,
          direction,
          [spacing[0], spacing[1], 1]
        );
        imageData.getPointData().setScalars(scalarArray);

        try {
          // Perform marching squares with Z-axis slicing mode
          const msOutput = computeWorker.performMarchingSquares(
            imageData,
            null,
            2
          );

          // Process contours
          const contourData =
            computeWorker.createContoursFromPolyData(msOutput);
          if (contourData) {
            sliceContours.push(contourData);
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
