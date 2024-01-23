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
  async initializePolySeg(progressCallback) {
    if (!this.polySeg) {
      this.polySeg = await new ICRPolySeg();
      await this.polySeg.initialize({
        updateProgress: progressCallback,
      });
    }
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
};

expose(obj);
