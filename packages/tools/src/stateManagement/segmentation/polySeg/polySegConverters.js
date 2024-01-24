import { expose } from 'comlink';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import ICRPolySeg from '@icr/polyseg-wasm';
import { utilities } from '@cornerstonejs/core';
import { getBoundingBoxAroundShapeWorld } from '../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../utilities';
import { isPointInsidePolyline3D } from '../../../utilities/math/polyline';

const obj = {
  polySeg: null,
  polySegInitializing: false,
  polySegInitializingPromise: null,
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
  async convertContourToLabelmap(args, ...callbacks) {
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

      // Combine bounding boxes for all annotations in the segment
      const combinedBoundingBox = [
        [Infinity, -Infinity],
        [Infinity, -Infinity],
        [Infinity, -Infinity],
      ];

      Array.from(annotations).forEach((annotation) => {
        const bounds = getBoundingBoxAroundShapeWorld(
          annotation.data.contour.polyline
        );

        // Update combined bounding box
        for (let dim = 0; dim < 3; dim++) {
          combinedBoundingBox[dim][0] = Math.min(
            combinedBoundingBox[dim][0],
            bounds[dim][0]
          );
          combinedBoundingBox[dim][1] = Math.max(
            combinedBoundingBox[dim][1],
            bounds[dim][1]
          );
        }

        return annotation;
      });

      const [iMin, jMin, kMin] = utilities.transformWorldToIndex(imageData, [
        combinedBoundingBox[0][0],
        combinedBoundingBox[1][0],
        combinedBoundingBox[2][0],
      ]);

      const [iMax, jMax, kMax] = utilities.transformWorldToIndex(imageData, [
        combinedBoundingBox[0][1],
        combinedBoundingBox[1][1],
        combinedBoundingBox[2][1],
      ]);

      // Run the pointInShapeCallback for the combined bounding box
      pointInShapeCallback(
        imageData,
        (pointLPS) => {
          // Check if the point is inside any of the polylines for this segment
          return annotations.some((annotation) =>
            isPointInsidePolyline3D(pointLPS, annotation.data.contour.polyline)
          );
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

    return imageData.getPointData().getScalars().getData();
  },
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
};

expose(obj);
