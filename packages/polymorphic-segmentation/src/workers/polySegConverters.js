import { expose } from 'comlink';
import { utilities } from '@cornerstonejs/core';
import { utilities as ToolsUtilities } from '@cornerstonejs/tools';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.polySegLog.getLogger(
  'workers.polySegConverters'
);

const {
  math: {
    polyline: { containsPoint, getAABB, projectTo2D },
  },
  geometricSurfaceUtils: { checkStandardBasis, rotatePoints },
  boundingBox: { getBoundingBoxAroundShapeWorld },
} = ToolsUtilities;

async function peerImport(moduleId) {
  try {
    if (moduleId === '@icr/polyseg-wasm') {
      return import('@icr/polyseg-wasm');
    }
  } catch (error) {
    cs3dLogger.warn('Error importing module:', error);
    return null;
  }
}

/**
 * Object containing methods for converting between different representations of
 * segmentations (e.g., contour, labelmap, surface, etc.) These logics
 * are used in a webworker to avoid blocking the main thread. You can
 * search for workerManager.executeTask('polySeg', ...) to see
 * how these methods are used.
 *
 * See also the webworker docs at packages/docs/docs/concepts/cornerstone-core/web-worker.md
 * to learn more about how to use web-workers in the context of Cornerstone.
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
    let ICRPolySeg;
    try {
      ICRPolySeg = (await peerImport('@icr/polyseg-wasm')).default;
    } catch (error) {
      cs3dLogger.error(error);
      cs3dLogger.debug(
        "Warning: '@icr/polyseg-wasm' module not found. Please install it separately."
      );
      return;
    }

    if (this.polySegInitializing) {
      await this.polySegInitializingPromise;
      return;
    }

    if (this.polySeg?.instance) {
      return;
    }

    this.polySegInitializing = true;
    // A failed initialize rejects every waiting task, and the next task tries again.
    this.polySegInitializingPromise = (async () => {
      try {
        this.polySeg = new ICRPolySeg();
        await this.polySeg.initialize({ updateProgress: progressCallback });
      } catch (error) {
        this.polySeg = null;
        throw error;
      } finally {
        this.polySegInitializing = false;
      }
    })();

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

    let results;
    try {
      results = this.polySeg.instance.convertLabelmapToSurface(
        args.scalarData,
        args.dimensions,
        args.spacing,
        args.direction,
        args.origin,
        [args.segmentIndex]
      );
    } catch (error) {
      // An abort (for example out of heap) leaves the wasm module unusable, so
      // the next call initializes a new one.
      this.polySeg = null;
      throw error;
    }
    const rotationInfo = checkStandardBasis(args.direction);
    if (!rotationInfo.isStandard) {
      const rotatedPoints = rotatePoints(
        rotationInfo.rotationMatrix,
        args.origin,
        results.points
      );
      results.points = [...rotatedPoints];
    }
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
    await this.initializePolySeg(progressCallback);

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
      utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData,
      });

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

        const voxels = utilities.VoxelManager.createScalarVolumeVoxelManager({
          dimensions,
          scalarData,
        });

        voxels.forEach(
          ({ pointIJK }) => {
            segmentationVoxelManager.setAtIJKPoint(pointIJK, index);
          },
          {
            imageData,
            isInObject: (pointLPS) => {
              const point2D = [pointLPS[firstDim], pointLPS[secondDim]];

              // Check if the point is inside any of the polylines for this segment
              const isInside = containsPoint(projectedPolyline, point2D, {
                holes,
              });

              return isInside;
            },
            boundsIJK: [
              [iMin, iMax],
              [jMin, jMax],
              [kMin, kMax],
            ],
          }
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
    await this.initializePolySeg(progressCallback);

    const { segmentationsInfo, annotationUIDsInSegmentMap, segmentIndices } =
      args;

    const segmentationVoxelManagers = new Map();

    segmentationsInfo.forEach((segmentationInfo, referencedImageId) => {
      const { dimensions, scalarData, direction, spacing, origin } =
        segmentationInfo;
      const manager = utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData,
      });

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
        const voxels = utilities.VoxelManager.createImageVoxelManager({
          width: imageData.getDimensions()[0],
          height: imageData.getDimensions()[1],
          scalarData: imageData.getPointData().getScalars().getData(),
        });

        voxels.forEach(
          ({ pointIJK }) => {
            segmentationVoxelManager.setAtIJKPoint(pointIJK, index);
          },
          {
            imageData,
            isInObject: (pointLPS) => {
              const point2D = [pointLPS[firstDim], pointLPS[secondDim]];

              // Check if the point is inside any of the polylines for this segment
              const isInside = containsPoint(projectedPolyline, point2D, {
                holes,
              });

              return isInside;
            },
            boundsIJK: [
              [iMin, iMax],
              [jMin, jMax],
              [kMin, kMax],
            ],
          }
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
    // by looping into each voxel with voxelmanager for each
    // and check if the voxel is inside any of the reconstructed
    // labelmaps
    const { dimensions } = args;
    const scalarData = targetImageData.getPointData().getScalars().getData();
    const segmentationVoxelManager =
      utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData,
      });

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

      const voxelManager =
        utilities.VoxelManager.createScalarVolumeVoxelManager({
          dimensions,
          scalarData: data,
        });

      const extent = volume.getExtent(); // e.g., [0, 176, 0, 268, 0, 337] for dimensions of [177, 269, 338]

      return {
        volume,
        voxelManager,
        extent,
        scalarData: data,
        segmentIndex: result.segmentIndex,
      };
    });

    const voxels = utilities.VoxelManager.createScalarVolumeVoxelManager({
      dimensions: targetImageData.getDimensions(),
      scalarData: targetImageData.getPointData().getScalars().getData(),
    });

    voxels.forEach(
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
      },
      { imageData: targetImageData }
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
   * Cuts the surfaces with the first plane of each slice. The planes of one
   * normal are cut in one pass over the triangles of each surface
   * (`cutSurfaceWithParallelPlanes`), so the cost grows with the number of
   * triangles and not with the number of planes times the triangles.
   *
   * The callbacks are proxies, each with its own message channel, so the
   * result of the task can reach the caller before the last cache updates.
   * The task therefore resolves only when every cache update has run, and
   * the caller then finds the contours of every slice in its cache. A slice
   * that cuts no surface gets no update.
   *
   * @param {Object} options - The options object.
   * @param {Array} options.planesInfo - The information about the planes.
   * @param {Array} options.surfacesInfo - The information about the surfaces.
   * @param {Map} options.surfacesAABB - The bounding box of each surface by
   * its id; a surface whose box no plane crosses is not read.
   * @param {Function} progressCallback - The callback function for progress updates.
   * @param {Function} updateCacheCallback - The callback function for updating the cache.
   */
  async cutSurfacesIntoPlanes(
    { planesInfo, surfacesInfo, surfacesAABB = new Map() },
    progressCallback,
    updateCacheCallback
  ) {
    const resultsBySlice = new Map();
    const groups = groupPlanesByNormal(planesInfo);
    const steps = groups.length * surfacesInfo.length;
    let step = 0;
    let reported = 0;

    for (const { normal, offsets, sliceIndices } of groups) {
      for (const { points, polys, id, segmentIndex } of surfacesInfo) {
        step++;

        try {
          const aabb =
            surfacesAABB.get(id) || getAABB(points, { numDimensions: 3 });

          if (!isAnyOffsetInBox(normal, offsets, aabb)) {
            continue;
          }

          cutSurfaceWithParallelPlanes(points, polys, normal, offsets).forEach(
            (result, planeIndex) => {
              const sliceIndex = sliceIndices[planeIndex];

              if (!resultsBySlice.has(sliceIndex)) {
                resultsBySlice.set(sliceIndex, new Map());
              }
              resultsBySlice
                .get(sliceIndex)
                .set(segmentIndex, { ...result, segmentIndex });
            }
          );
        } catch (e) {
          cs3dLogger.warn('Error during clipping', e);
        }

        if (step / steps - reported >= 0.05 || step === steps) {
          reported = step / steps;
          progressCallback({ progress: reported });
        }
      }
    }

    const cacheUpdates = [];
    resultsBySlice.forEach((polyDataResults, sliceIndex) => {
      cacheUpdates.push(updateCacheCallback({ sliceIndex, polyDataResults }));
    });

    await Promise.allSettled(cacheUpdates);
  },
};

/**
 * The first plane of each slice, in groups of one normal: the offset of each
 * plane along the normal, in ascending order, and the slice of each offset.
 * The slices of a volume share one normal; the images of a stack may not.
 *
 * @param {Array} planesInfo - The planes of each slice.
 * @returns {Array} The groups `{ normal, offsets, sliceIndices }`.
 */
function groupPlanesByNormal(planesInfo) {
  const groups = new Map();

  for (const { sliceIndex, planes } of planesInfo) {
    const { origin, normal } = planes[0];
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    const unit = [normal[0] / length, normal[1] / length, normal[2] / length];
    const key = unit.map((value) => Math.round(value * 1e6)).join(',');

    if (!groups.has(key)) {
      groups.set(key, { normal: unit, planes: [] });
    }
    groups.get(key).planes.push({
      sliceIndex,
      offset: unit[0] * origin[0] + unit[1] * origin[1] + unit[2] * origin[2],
    });
  }

  return [...groups.values()].map(({ normal, planes }) => {
    planes.sort((a, b) => a.offset - b.offset);

    return {
      normal,
      offsets: Float64Array.from(planes, ({ offset }) => offset),
      sliceIndices: planes.map(({ sliceIndex }) => sliceIndex),
    };
  });
}

/**
 * Whether a plane of the offsets crosses a box, from the projection of its
 * corners on the normal.
 */
function isAnyOffsetInBox(
  normal,
  offsets,
  { minX, minY, minZ, maxX, maxY, maxZ }
) {
  const center =
    normal[0] * (minX + maxX) * 0.5 +
    normal[1] * (minY + maxY) * 0.5 +
    normal[2] * (minZ + maxZ) * 0.5;
  const radius =
    Math.abs(normal[0]) * (maxX - minX) * 0.5 +
    Math.abs(normal[1]) * (maxY - minY) * 0.5 +
    Math.abs(normal[2]) * (maxZ - minZ) * 0.5;
  const first = firstOffsetAbove(offsets, center - radius - 1e-9);

  return first < offsets.length && offsets[first] <= center + radius;
}

/** The index of the first offset above a value, or the number of offsets. */
function firstOffsetAbove(offsets, value) {
  let low = 0;
  let high = offsets.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (offsets[middle] > value) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

/**
 * Cuts a closed surface with parallel planes in one pass over its polygons.
 *
 * The points of the surface at one position count as one point, as a
 * surface may repeat a point under another id (where its strips meet), so
 * the cut of each triangle meets the cut of the next one at the same edge.
 * Each polygon is split into a fan of triangles. A triangle meets the planes
 * whose offset lies above its lowest vertex and at or below its highest one;
 * a vertex at the offset of a plane counts as above it, so each crossing lies
 * on two edges and adjacent triangles meet at the same edge points. On each
 * plane the segments are chained by their edges into polylines, in the form
 * of `vtkContourLoopExtraction`: a cell array `[count, ids...]` where a
 * closed loop repeats its first point id.
 *
 * @param {number[]} points - The points of the surface, x y z after one
 * another.
 * @param {number[]} polys - The polygons of the surface as a cell array.
 * @param {number[]} normal - The unit normal of the planes.
 * @param {Float64Array} offsets - The offsets of the planes along the normal,
 * in ascending order.
 * @returns {Map} The contours on each plane that the surface crosses, by the
 * index of the plane: `{ points, lines, numberOfCells }`.
 */
function cutSurfaceWithParallelPlanes(points, polys, normal, offsets) {
  const numberOfPoints = points.length / 3;
  const distances = new Float64Array(numberOfPoints);

  for (let i = 0; i < numberOfPoints; i++) {
    distances[i] =
      normal[0] * points[3 * i] +
      normal[1] * points[3 * i + 1] +
      normal[2] * points[3 * i + 2];
  }

  const pointIds = getPointIdsByPosition(points);
  const edgeKey = (u, v) =>
    u < v ? u * numberOfPoints + v : v * numberOfPoints + u;
  const segmentsByPlane = new Map();

  for (let cell = 0; cell < polys.length; cell += polys[cell] + 1) {
    const count = polys[cell];
    const a = pointIds[polys[cell + 1]];

    for (let corner = 2; corner < count; corner++) {
      const b = pointIds[polys[cell + corner]];
      const c = pointIds[polys[cell + corner + 1]];

      if (a === b || b === c || a === c) {
        continue;
      }

      const da = distances[a];
      const db = distances[b];
      const dc = distances[c];
      const high = Math.max(da, db, dc);

      for (
        let plane = firstOffsetAbove(offsets, Math.min(da, db, dc));
        plane < offsets.length && offsets[plane] <= high;
        plane++
      ) {
        const offset = offsets[plane];
        const belowA = da < offset;
        const belowB = db < offset;
        const belowC = dc < offset;
        let segments = segmentsByPlane.get(plane);

        if (!segments) {
          segments = [];
          segmentsByPlane.set(plane, segments);
        }

        if (belowA !== belowB) {
          segments.push(
            edgeKey(a, b),
            belowB !== belowC ? edgeKey(b, c) : edgeKey(c, a)
          );
        } else {
          segments.push(edgeKey(b, c), edgeKey(c, a));
        }
      }
    }
  }

  const contours = new Map();
  segmentsByPlane.forEach((segments, plane) => {
    contours.set(
      plane,
      chainSegments(segments, points, distances, offsets[plane], numberOfPoints)
    );
  });

  return contours;
}

/**
 * The id of each point of a surface as the first point at its position (to
 * float precision), from a hash table of the bits of its coordinates.
 */
function getPointIdsByPosition(points) {
  const numberOfPoints = points.length / 3;
  const pointIds = new Int32Array(numberOfPoints);
  const bits = new Uint32Array(Float32Array.from(points).buffer);
  let size = 1;

  while (size < numberOfPoints * 2) {
    size *= 2;
  }

  const table = new Int32Array(size).fill(-1);
  const mask = size - 1;

  for (let i = 0; i < numberOfPoints; i++) {
    const x = bits[3 * i];
    const y = bits[3 * i + 1];
    const z = bits[3 * i + 2];
    let slot =
      (Math.imul(x, 0x9e3779b1) ^
        Math.imul(y, 0x85ebca77) ^
        Math.imul(z, 0xc2b2ae3d)) &
      mask;

    while (true) {
      const id = table[slot];

      if (id === -1) {
        table[slot] = i;
        pointIds[i] = i;
        break;
      }

      if (
        bits[3 * id] === x &&
        bits[3 * id + 1] === y &&
        bits[3 * id + 2] === z
      ) {
        pointIds[i] = id;
        break;
      }

      slot = (slot + 1) & mask;
    }
  }

  return pointIds;
}

/**
 * Chains the segments of one plane into polylines. Each segment is given by
 * the keys of its two crossed edges, one after the other in `segments`; the
 * key of an edge is `u * numberOfPoints + v` for its points u < v. Each
 * crossed edge gives one point, at the offset of the plane along it.
 */
function chainSegments(segments, points, distances, offset, numberOfPoints) {
  const numberOfSegments = segments.length / 2;
  const firstSegmentOf = new Map();
  const secondSegmentOf = new Map();

  for (let index = 0; index < segments.length; index++) {
    const segment = index >> 1;
    const key = segments[index];

    if (!firstSegmentOf.has(key)) {
      firstSegmentOf.set(key, segment);
    } else if (!secondSegmentOf.has(key)) {
      secondSegmentOf.set(key, segment);
    }
  }

  const pointIdByKey = new Map();
  const outputPoints = [];
  const pointIdOf = (key) => {
    let pointId = pointIdByKey.get(key);

    if (pointId === undefined) {
      const u = Math.floor(key / numberOfPoints);
      const v = key - u * numberOfPoints;
      const t = (offset - distances[u]) / (distances[v] - distances[u]);

      pointId = outputPoints.length / 3;
      pointIdByKey.set(key, pointId);
      outputPoints.push(
        points[3 * u] + t * (points[3 * v] - points[3 * u]),
        points[3 * u + 1] + t * (points[3 * v + 1] - points[3 * u + 1]),
        points[3 * u + 2] + t * (points[3 * v + 2] - points[3 * u + 2])
      );
    }

    return pointId;
  };

  const visited = new Uint8Array(numberOfSegments);
  const nextSegmentAt = (key) => {
    const first = firstSegmentOf.get(key);

    if (first !== undefined && !visited[first]) {
      return first;
    }

    const second = secondSegmentOf.get(key);

    return second !== undefined && !visited[second] ? second : undefined;
  };
  const walk = (startSegment, startKey) => {
    const keys = [startKey];
    let segment = startSegment;
    let key = startKey;

    while (segment !== undefined) {
      visited[segment] = 1;
      key =
        segments[2 * segment] === key
          ? segments[2 * segment + 1]
          : segments[2 * segment];
      keys.push(key);
      segment = nextSegmentAt(key);
    }

    return keys;
  };

  const lines = [];
  let numberOfCells = 0;

  for (let segment = 0; segment < numberOfSegments; segment++) {
    if (visited[segment]) {
      continue;
    }

    const startKey = segments[2 * segment];
    const forward = walk(segment, startKey);
    const closed = forward[forward.length - 1] === startKey;
    const before = closed
      ? []
      : walk(nextSegmentAt(startKey), startKey).slice(1).reverse();
    const keys = [...before, ...forward];

    lines.push(keys.length);
    keys.forEach((key) => lines.push(pointIdOf(key)));
    numberOfCells++;
  }

  return {
    points: Float32Array.from(outputPoints),
    lines,
    numberOfCells,
  };
}

expose(polySegConverters);
