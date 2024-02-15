import { expose } from 'comlink';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import ICRPolySeg from '@icr/polyseg-wasm';
import { utilities } from '@cornerstonejs/core';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkContourLoopExtraction from '@kitware/vtk.js/Filters/General/ContourLoopExtraction';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';

import { getBoundingBoxAroundShapeWorld } from '../utilities/boundingBox';
import { pointInShapeCallback } from '../utilities';
import {
  containsPoint,
  getAABB,
  isPointInsidePolyline3D,
  projectTo2D,
} from '../utilities/math/polyline';
import { isPlaneIntersectingAABB } from '../utilities/planar';

/**
 * Object containing methods for converting between different representations of
 * segmentations (e.g., contour, labelmap, surface, etc.) These logics
 * are used in a webworker to avoid blocking the main thread. You can
 * search for workerManager.executeTask('polySeg', ...) to see
 * how these methods are used.
 *
 * See also the webworker docs at packages/docs/docs/concepts/cornerstone-core/web-worker.md
 * to learn more about how to use webworkers in the context of Cornerstone.
 */
const polySegConverters = {
  /**
   * The polySeg instance that is used to convert between different representations
   */
  polySeg: null,
  /**
   * Utilities to keep track of the initialization state of the polySeg instance
   * and avoid initializing it multiple times
   */
  polySegInitializing: false,
  polySegInitializingPromise: null,
  /**
   * This method initializes the polySeg instance and sets it to this.polySeg
   */
  async initializePolySeg(progressCallback) {
    if (this.polySegInitializing) {
      await this.polySegInitializingPromise;
      return;
    }

    if (this.polySeg?.instance) {
      return;
    }

    this.polySegInitializing = true;
    this.polySegInitializingPromise = new Promise((resolve) => {
      this.polySeg = new ICRPolySeg();
      this.polySeg
        .initialize({
          updateProgress: progressCallback,
        })
        .then(() => {
          this.polySegInitializing = false;
          resolve();
        });
    });

    await this.polySegInitializingPromise;
  },
  /**
   * Converts a contour to a surface using the PolySeg library.
   * @param {Object} args - The arguments for the conversion.
   * @param {Array} args.polylines - The polylines representing the contour.
   * @param {Array} args.numPointsArray - The number of points in each polyline.
   * @param {...Function} callbacks - Optional callback functions.
   * @returns {Promise} - A promise that resolves to the converted surface.
   */
  async convertContourToSurface(args, ...callbacks) {
    const { polylines, numPointsArray } = args;
    const [progressCallback] = callbacks;
    await this.initializePolySeg(progressCallback);
    const results = await this.polySeg.instance.convertContourRoiToSurface(
      polylines,
      numPointsArray
    );

    return results;
  },
  /**
   * Converts a labelmap to a surface using the specified arguments.
   * @param {Object} args - The arguments for the conversion.
   * @param {Array} args.scalarData - The scalar data of the labelmap.
   * @param {Array} args.dimensions - The dimensions of the labelmap.
   * @param {Array} args.spacing - The spacing of the labelmap.
   * @param {Array} args.direction - The direction of the labelmap.
   * @param {Array} args.origin - The origin of the labelmap.
   * @param {number} args.segmentIndex - The segment index of the labelmap.
   * @param {Function} progressCallback - The callback function for progress updates.
   * @returns {Promise} - A promise that resolves with the converted surface results.
   */
  async convertLabelmapToSurface(args, ...callbacks) {
    const [progressCallback] = callbacks;
    await this.initializePolySeg(progressCallback);

    const results = this.polySeg.instance.convertLabelmapToSurface(
      args.scalarData,
      args.dimensions,
      args.spacing,
      args.direction,
      args.origin,
      [args.segmentIndex]
    );
    return results;
  },
  /**
   * Converts a contour to a volume labelmap.
   * @param {Object} args - The arguments for the conversion.
   * @param {Array} args.segmentIndices - The indices of the segments.
   * @param {Array} args.scalarData - The scalar data.
   * @param {Map} args.annotationUIDsInSegmentMap - The map of annotation UIDs in segment.
   * @param {Array} args.dimensions - The dimensions of the image data.
   * @param {Array} args.origin - The origin of the image data.
   * @param {Array} args.direction - The direction of the image data.
   * @param {Array} args.spacing - The spacing of the image data.
   * @param {...Function} callbacks - Optional callbacks.
   * @param {Function} callbacks[0] - The progress callback.
   * @returns {Array} - The scalar data of the segmentation voxel manager.
   */
  async convertContourToVolumeLabelmap(args, ...callbacks) {
    const [progressCallback] = callbacks;
    const polySeg = await new ICRPolySeg();
    await polySeg.initialize({
      updateProgress: progressCallback,
    });

    const {
      segmentIndices,
      scalarData,
      annotationUIDsInSegmentMap,
      dimensions,
      origin,
      direction,
      spacing,
    } = args;

    const segmentationVoxelManager =
      utilities.VoxelManager.createVolumeVoxelManager(dimensions, scalarData);

    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(dimensions);
    imageData.setOrigin(origin);
    imageData.setDirection(direction);
    imageData.setSpacing(spacing);

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: scalarData,
    });

    imageData.getPointData().setScalars(scalarArray);

    imageData.modified();

    for (const index of segmentIndices) {
      const annotations = annotationUIDsInSegmentMap.get(index);

      for (const annotation of annotations) {
        if (!annotation.polyline) {
          continue;
        }

        const { polyline, holesPolyline } = annotation;
        const bounds = getBoundingBoxAroundShapeWorld(polyline);

        const [iMin, jMin, kMin] = utilities.transformWorldToIndex(imageData, [
          bounds[0][0],
          bounds[1][0],
          bounds[2][0],
        ]);

        const [iMax, jMax, kMax] = utilities.transformWorldToIndex(imageData, [
          bounds[0][1],
          bounds[1][1],
          bounds[2][1],
        ]);

        const { projectedPolyline, sharedDimensionIndex } =
          projectTo2D(polyline);

        const holes = holesPolyline?.map((hole) => {
          const { projectedPolyline: projectedHole } = projectTo2D(hole);
          return projectedHole;
        });

        const firstDim = (sharedDimensionIndex + 1) % 3;
        const secondDim = (sharedDimensionIndex + 2) % 3;

        // Run the pointInShapeCallback for the combined bounding box
        pointInShapeCallback(
          imageData,
          (pointLPS) => {
            const point2D = [pointLPS[firstDim], pointLPS[secondDim]];

            // Check if the point is inside any of the polylines for this segment
            const isInside = containsPoint(projectedPolyline, point2D, {
              holes,
            });

            return isInside;
          },
          ({ pointIJK }) => {
            segmentationVoxelManager.setAtIJKPoint(pointIJK, index);
          },
          [
            [iMin, iMax],
            [jMin, jMax],
            [kMin, kMax],
          ]
        );
      }
    }

    return segmentationVoxelManager.scalarData;
  },
  /**
   * Converts a contour to a stack labelmap.
   * @param {Object} args - The arguments for the conversion.
   * @param {Array} callbacks - Optional callbacks for progress updates.
   * @returns {Promise<Object>} - The converted segmentations information.
   */
  async convertContourToStackLabelmap(args, ...callbacks) {
    const [progressCallback] = callbacks;
    const polySeg = await new ICRPolySeg();
    await polySeg.initialize({
      updateProgress: progressCallback,
    });

    const { segmentationsInfo, annotationUIDsInSegmentMap, segmentIndices } =
      args;

    const segmentationVoxelManagers = new Map();

    segmentationsInfo.forEach((segmentationInfo, referencedImageId) => {
      const { dimensions, scalarData, direction, spacing, origin } =
        segmentationInfo;
      const manager = utilities.VoxelManager.createVolumeVoxelManager(
        dimensions,
        scalarData
      );

      const imageData = vtkImageData.newInstance();
      imageData.setDimensions(dimensions);
      imageData.setOrigin(origin);
      imageData.setDirection(direction);
      imageData.setSpacing(spacing);

      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: scalarData,
      });

      imageData.getPointData().setScalars(scalarArray);

      imageData.modified();

      segmentationVoxelManagers.set(referencedImageId, { manager, imageData });
    });

    for (const index of segmentIndices) {
      const annotations = annotationUIDsInSegmentMap.get(index);

      for (const annotation of annotations) {
        if (!annotation.polyline) {
          continue;
        }

        const { polyline, holesPolyline, referencedImageId } = annotation;
        const bounds = getBoundingBoxAroundShapeWorld(polyline);

        const { manager: segmentationVoxelManager, imageData } =
          segmentationVoxelManagers.get(referencedImageId);

        const [iMin, jMin, kMin] = utilities.transformWorldToIndex(imageData, [
          bounds[0][0],
          bounds[1][0],
          bounds[2][0],
        ]);

        const [iMax, jMax, kMax] = utilities.transformWorldToIndex(imageData, [
          bounds[0][1],
          bounds[1][1],
          bounds[2][1],
        ]);

        const { projectedPolyline, sharedDimensionIndex } =
          projectTo2D(polyline);

        const holes = holesPolyline?.map((hole) => {
          const { projectedPolyline: projectedHole } = projectTo2D(hole);
          return projectedHole;
        });

        const firstDim = (sharedDimensionIndex + 1) % 3;
        const secondDim = (sharedDimensionIndex + 2) % 3;

        // Run the pointInShapeCallback for the combined bounding box
        pointInShapeCallback(
          imageData,
          (pointLPS) => {
            const point2D = [pointLPS[firstDim], pointLPS[secondDim]];

            // Check if the point is inside any of the polylines for this segment
            const isInside = containsPoint(projectedPolyline, point2D, {
              holes,
            });

            return isInside;
          },
          ({ pointIJK }) => {
            segmentationVoxelManager.setAtIJKPoint(pointIJK, index);
          },
          [
            [iMin, iMax],
            [jMin, jMax],
            [kMin, kMax],
          ]
        );
      }
    }

    segmentationsInfo.forEach((segmentationInfo, referencedImageId) => {
      const { manager: segmentationVoxelManager } =
        segmentationVoxelManagers.get(referencedImageId);

      segmentationInfo.scalarData = segmentationVoxelManager.scalarData;
    });
    return segmentationsInfo;
  },
  /**
   * Converts a surface to a volume labelmap.
   *
   * @param {Object} args - The arguments for the conversion.
   * @param {Array} args.points - The points defining the surface.
   * @param {Array} args.polys - The polygons defining the surface.
   * @param {Array} args.dimensions - The dimensions of the volume.
   * @param {Array} args.spacing - The spacing between voxels in the volume.
   * @param {Array} args.direction - The direction of the volume.
   * @param {Array} args.origin - The origin of the volume.
   * @param {Function} progressCallback - The callback function for reporting progress.
   * @returns {Promise} - A promise that resolves with the converted labelmap.
   */
  async convertSurfaceToVolumeLabelmap(args, ...callbacks) {
    const [progressCallback] = callbacks;
    await this.initializePolySeg(progressCallback);

    const results = this.polySeg.instance.convertSurfaceToLabelmap(
      args.points,
      args.polys,
      args.dimensions,
      args.spacing,
      args.direction,
      args.origin
    );

    return results;
  },
  /**
   * Converts surfaces to a volume labelmap.
   * @param {Object} args - The arguments for the conversion.
   * @param {Map} args.segmentsInfo - A map containing information about the segments.
   * @param {Function} progressCallback - A callback function for reporting progress.
   * @returns {Uint8Array} - The resulting volume labelmap.
   */
  async convertSurfacesToVolumeLabelmap(args, ...callbacks) {
    const [progressCallback] = callbacks;
    await this.initializePolySeg(progressCallback);

    const { segmentsInfo } = args;

    const promises = Array.from(segmentsInfo.keys()).map((segmentIndex) => {
      const { points, polys } = segmentsInfo.get(segmentIndex);
      const result = this.polySeg.instance.convertSurfaceToLabelmap(
        points,
        polys,
        args.dimensions,
        args.spacing,
        args.direction,
        args.origin
      );

      return {
        ...result,
        segmentIndex,
      };
    });

    const results = await Promise.all(promises);

    const targetImageData = vtkImageData.newInstance();
    targetImageData.setDimensions(args.dimensions);
    targetImageData.setOrigin(args.origin);
    targetImageData.setSpacing(args.spacing);
    targetImageData.setDirection(args.direction);

    const totalSize =
      args.dimensions[0] * args.dimensions[1] * args.dimensions[2];

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: new Uint8Array(totalSize),
    });

    targetImageData.getPointData().setScalars(scalarArray);
    targetImageData.modified();

    // we need to then consolidate the results into a single volume
    // by looping into each voxel with pointInShapeCallback
    // and check if the voxel is inside any of the reconstructed
    // labelmaps

    const segmentationVoxelManager =
      utilities.VoxelManager.createVolumeVoxelManager(
        args.dimensions,
        targetImageData.getPointData().getScalars().getData()
      );

    const outputVolumesInfo = results.map((result) => {
      const { data, dimensions, direction, origin, spacing } = result;
      const volume = vtkImageData.newInstance();
      volume.setDimensions(dimensions);
      volume.setOrigin(origin);
      volume.setSpacing(spacing);
      volume.setDirection(direction);

      const scalarArray = vtkDataArray.newInstance({
        name: 'Pixels',
        numberOfComponents: 1,
        values: data,
      });

      volume.getPointData().setScalars(scalarArray);

      volume.modified();

      const voxelManager = utilities.VoxelManager.createVolumeVoxelManager(
        dimensions,
        data
      );

      const extent = volume.getExtent(); // e.g., [0, 176, 0, 268, 0, 337] for dimensions of [177, 269, 338]

      return {
        volume,
        voxelManager,
        extent,
        scalarData: data,
        segmentIndex: result.segmentIndex,
      };
    });

    pointInShapeCallback(
      targetImageData,
      () => true, // we want to loop into all voxels
      ({ pointIJK, pointLPS }) => {
        // Check if the point is inside any of the reconstructed labelmaps
        // Todo: we can optimize this by returning early if the bounding box
        // of the point is outside the bounding box of the labelmap

        try {
          for (const volumeInfo of outputVolumesInfo) {
            const { volume, extent, voxelManager, segmentIndex } = volumeInfo;

            const index = volume.worldToIndex(pointLPS);

            // check if the ijk point is inside the volume
            if (
              index[0] < extent[0] ||
              index[0] > extent[1] ||
              index[1] < extent[2] ||
              index[1] > extent[3] ||
              index[2] < extent[4] ||
              index[2] > extent[5]
            ) {
              continue;
            }

            const roundedIndex = index.map(Math.round);
            const value = voxelManager.getAtIJK(...roundedIndex);
            if (value > 0) {
              segmentationVoxelManager.setAtIJKPoint(pointIJK, segmentIndex);
              break;
            }
          }
        } catch (error) {
          // right now there is weird error if the point is outside the volume
        }
      }
    );

    return segmentationVoxelManager.scalarData;
  },
  getSurfacesAABBs({ surfacesInfo }) {
    const aabbs = new Map();
    for (const { points, id } of surfacesInfo) {
      const aabb = getAABB(points, { numDimensions: 3 });
      aabbs.set(id, aabb);
    }
    return aabbs;
  },
  /**
   * Cuts the surfaces into planes.
   *
   * @param {Object} options - The options object.
   * @param {Array} options.planesInfo - The information about the planes.
   * @param {Array} options.surfacesInfo - The information about the surfaces.
   * @param {Function} progressCallback - The callback function for progress updates.
   * @param {Function} updateCacheCallback - The callback function for updating the cache.
   */
  cutSurfacesIntoPlanes(
    { planesInfo, surfacesInfo, surfacesAABB = new Map() },
    progressCallback,
    updateCacheCallback
  ) {
    const numberOfPlanes = planesInfo.length;
    const cutter = vtkCutter.newInstance();

    const plane1 = vtkPlane.newInstance();

    cutter.setCutFunction(plane1);

    const surfacePolyData = vtkPolyData.newInstance();

    try {
      for (const [index, planeInfo] of planesInfo.entries()) {
        const { sliceIndex, planes } = planeInfo;

        const polyDataResults = new Map();
        for (const polyDataInfo of surfacesInfo) {
          const { points, polys, id } = polyDataInfo;

          const aabb3 =
            surfacesAABB.get(id) || getAABB(points, { numDimensions: 3 });

          if (!surfacesAABB.has(id)) {
            surfacesAABB.set(id, aabb3);
          }

          const { minX, minY, minZ, maxX, maxY, maxZ } = aabb3;

          const { origin, normal } = planes[0];

          // Check if the plane intersects the AABB
          if (
            !isPlaneIntersectingAABB(
              origin,
              normal,
              minX,
              minY,
              minZ,
              maxX,
              maxY,
              maxZ
            )
          ) {
            continue;
          }

          surfacePolyData.getPoints().setData(points, 3);
          surfacePolyData.getPolys().setData(polys, 3);
          surfacePolyData.modified();

          cutter.setInputData(surfacePolyData);
          plane1.setOrigin(origin);
          plane1.setNormal(normal);

          try {
            cutter.update();
          } catch (e) {
            console.warn('Error during clipping', e);
            continue;
          }

          const polyData = cutter.getOutputData();

          const cutterOutput = polyData;
          cutterOutput.buildLinks();
          const loopExtraction = vtkContourLoopExtraction.newInstance();
          loopExtraction.setInputData(cutterOutput);

          const loopOutput = loopExtraction.getOutputData();
          if (polyData) {
            polyDataResults.set(id, {
              points: loopOutput.getPoints().getData(),
              lines: loopOutput.getLines().getData(),
              numberOfCells: loopOutput.getLines().getNumberOfCells(),
            });
          }
        }

        progressCallback({ progress: (index + 1) / numberOfPlanes });

        updateCacheCallback({ sliceIndex, polyDataResults });
      }
    } catch (e) {
      console.warn('Error during processing', e);
    } finally {
      // Cleanup on completion
      surfacesInfo = null;
      plane1.delete();
    }
  },
};

expose(polySegConverters);
