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
  createVTKImageData: (dimensions, origin, direction, spacing, scalarData) => {
    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(dimensions);
    imageData.setOrigin(origin);
    imageData.setDirection(direction);
    imageData.setSpacing(spacing);

    if (!scalarData) {
      return imageData;
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Scalars',
      numberOfComponents: 1,
      values: scalarData,
    });

    imageData.getPointData().setScalars(scalarArray);

    return imageData;
  },
  processSegmentStatistics: ({
    segVoxelManager,
    imageVoxelManager,
    indices,
    bounds,
    imageData,
  }) => {
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
        imageData,
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

    const imageData = computeWorker.createVTKImageData(
      segmentation.dimensions,
      segmentation.origin,
      segmentation.direction,
      segmentation.spacing
    );

    SegmentStatsCalculator.statsInit({ storePointData: false, indices, mode });

    // Process segment statistics
    computeWorker.processSegmentStatistics({
      segVoxelManager,
      imageVoxelManager,
      indices,
      imageData,
    });

    // Get statistics based on the mode
    const stats = SegmentStatsCalculator.getStatistics({
      spacing: segmentationSpacing,
      unit: 'mm',
      mode,
    });

    return stats;
  },
  computeMetabolicStats({ segmentationInfo, imageInfo }) {
    const { scalarData, dimensions, spacing, origin, direction } =
      segmentationInfo;

    const {
      spacing: imageSpacing,
      dimensions: imageDimensions,
      direction: imageDirection,
      origin: imageOrigin,
      scalarData: imageScalarData,
    } = imageInfo;

    const segVoxelManager = computeWorker.createVoxelManager(
      segmentationInfo.dimensions,
      segmentationInfo.scalarData
    );

    const refVoxelManager = computeWorker.createVoxelManager(
      imageDimensions,
      imageScalarData
    );

    let suv = 0;
    let numVoxels = 0;
    const scalarDataLength = segVoxelManager.getScalarDataLength();

    // Single pass through the data
    for (let i = 0; i < scalarDataLength; i++) {
      // if not background
      if (segVoxelManager.getAtIndex(i) !== 0) {
        suv += refVoxelManager.getAtIndex(i);
        numVoxels++;
      }
    }

    // Calculate TMTV (total metabolic tumor volume)
    const tmtv = 1e-3 * numVoxels * spacing[0] * spacing[1] * spacing[2];

    // Average SUV for the merged labelmap
    const averageSuv = numVoxels > 0 ? suv / numVoxels : 0;

    // total Lesion Glycolysis [suv * ml]
    const tlg =
      averageSuv *
      numVoxels *
      imageSpacing[0] *
      imageSpacing[1] *
      imageSpacing[2] *
      1e-3;

    return {
      tmtv,
      tlg,
    };
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

      const imageData = computeWorker.createVTKImageData(
        segDimensions,
        segInfo.origin,
        segInfo.direction,
        segInfo.spacing
      );

      // Process segment statistics
      computeWorker.processSegmentStatistics({
        segVoxelManager,
        imageVoxelManager,
        indices,
        imageData,
      });
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

    return isStack
      ? computeWorker.calculateBidirectionalStack({
          segmentationInfo,
          indices,
          mode,
        })
      : computeWorker.calculateVolumetricBidirectional({
          segmentation,
          indices,
          mode,
        });
  },
  findLargestBidirectionalFromContours: (
    contours,
    isInSegment,
    segmentIndex
  ) => {
    let maxBidirectional;

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
      return {
        segmentIndex,
        majorAxis: maxBidirectional.majorAxis,
        minorAxis: maxBidirectional.minorAxis,
        maxMajor: maxBidirectional.maxMajor,
        maxMinor: maxBidirectional.maxMinor,
      };
    }

    return null;
  },
  calculateBidirectionalStack: ({ segmentationInfo, indices, mode }) => {
    const segments = computeWorker.createSegmentsFromIndices(indices);
    let bidirectionalResults = [];

    // Process each slice in the stack
    for (let i = 0; i < segmentationInfo.length; i++) {
      const segInfo = segmentationInfo[i];
      const dimensions = segInfo.dimensions;
      const segScalarData = segInfo.scalarData;
      const { spacing, direction, origin } = segInfo;

      const voxelManager = computeWorker.createVoxelManager(
        dimensions,
        segScalarData
      );

      const pixelsPerSlice = dimensions[0] * dimensions[1];

      // Process each segment index
      for (let segIndex = 1; segIndex < segments.length; segIndex++) {
        const segment = segments[segIndex];

        if (!segment) {
          continue;
        }

        const segmentIndex = segment.segmentIndex;

        // Skip empty slices
        if (
          computeWorker.isSliceEmptyForSegmentVolume(
            0,
            segScalarData,
            pixelsPerSlice,
            segmentIndex
          )
        ) {
          continue;
        }

        // Generate contours for this segment on this slice
        const sliceContours = [];

        // Filter data for current segment
        const filteredData = new Uint8Array(segScalarData.length);
        for (let i = 0; i < segScalarData.length; i++) {
          filteredData[i] = segScalarData[i] === segmentIndex ? 1 : 0;
        }

        // Create VTK image data
        const scalarArray = vtkDataArray.newInstance({
          name: 'Pixels',
          numberOfComponents: 1,
          values: filteredData,
        });

        const imageData = computeWorker.createVTKImageData(
          dimensions,
          origin,
          direction,
          [spacing[0], spacing[1], 1]
        );

        imageData.getPointData().setScalars(scalarArray);

        try {
          // Perform marching squares
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

        // Create isInSegment helper
        const isInSegment = createIsInSegmentMetadata({
          dimensions,
          imageData,
          voxelManager,
          segmentIndex,
        });

        // Find largest bidirectional using shared function
        const bidirectionalResult =
          computeWorker.findLargestBidirectionalFromContours(
            sliceContours,
            isInSegment,
            segmentIndex
          );

        if (bidirectionalResult) {
          bidirectionalResults.push(bidirectionalResult);
        }
      }
    }

    return bidirectionalResults;
  },
  calculateVolumetricBidirectional: ({ segmentation, indices, mode }) => {
    const { voxelManager, dimensions, origin, direction, spacing } =
      segmentation;
    const imageData = computeWorker.createVTKImageData(
      dimensions,
      origin,
      direction,
      spacing
    );

    // Generate contour sets from 3D volume
    const contourSets = computeWorker.generateContourSetsFromLabelmapVolume({
      segmentation,
      indices,
      imageData,
      mode,
    });

    const bidirectionalResults = [];

    // Process each contour set
    for (let i = 0; i < contourSets.length; i++) {
      const contourSet = contourSets[i];
      const { segmentIndex } = contourSet.segment;
      const contours = contourSet.sliceContours;

      // Create isInSegment helper
      const isInSegment = createIsInSegmentMetadata({
        dimensions,
        imageData,
        voxelManager,
        segmentIndex,
      });

      // Find largest bidirectional using shared function
      const bidirectionalResult =
        computeWorker.findLargestBidirectionalFromContours(
          contours,
          isInSegment,
          segmentIndex
        );

      if (bidirectionalResult) {
        bidirectionalResults.push(bidirectionalResult);
      }
    }

    return bidirectionalResults;
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
