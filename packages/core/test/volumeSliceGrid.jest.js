import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import { RENDERING_DEFAULTS } from '../src/constants';
import { OrientationAxis } from '../src/enums';
import { getConfiguration, setConfiguration } from '../src/init';
import { createPlanarVolumeSliceBasis } from '../src/RenderingEngine/Viewports/Planar/planarSliceBasis';
import getSpacingInNormalDirection from '../src/utilities/getSpacingInNormalDirection';
import { getVolumeSlicesClippingPlanes } from '../src/utilities/getVolumeSlicesClippingPlanes';
import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';

/**
 * The slice grid of a volume view (VSN-I-1 to VSN-I-5 of the volume slice
 * navigation specification): the step, the count, the positions, the default
 * slice and the reported index, for views along the volume axes and oblique
 * views.
 */

function createVolume({
  dimensions,
  spacing,
  origin = [0, 0, 0],
  direction = [1, 0, 0, 0, 1, 0, 0, 0, 1],
}) {
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId: 'slice-grid-volume',
    dimensions,
    spacing,
    origin,
    direction,
    imageData,
    imageIds: [],
  };
}

function normalize(vector) {
  return Array.from(vec3.normalize(vec3.create(), vector));
}

/**
 * Orientation vectors for a normal, with a view up at right angles to it.
 */
function orientationFor(viewPlaneNormal) {
  const normal = normalize(viewPlaneNormal);
  const helper = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const viewUp = normalize(vec3.cross(vec3.create(), normal, helper));

  return { viewPlaneNormal: normal, viewUp };
}

function openSlice(imageVolume, orientation, imageIdIndex, viewState) {
  return createPlanarVolumeSliceBasis({
    canvasWidth: 256,
    canvasHeight: 256,
    imageVolume,
    orientation,
    imageIdIndex,
    viewState,
  });
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function voxelCentres(imageVolume) {
  const [dx, dy, dz] = imageVolume.dimensions;
  const centres = [];

  for (let k = 0; k < dz; k++) {
    for (let j = 0; j < dy; j++) {
      for (let i = 0; i < dx; i++) {
        centres.push(imageVolume.imageData.indexToWorld([i, j, k]));
      }
    }
  }

  return centres;
}

function centreRange(imageVolume, normal) {
  const projections = voxelCentres(imageVolume).map((centre) =>
    dot(centre, normal)
  );

  return { min: Math.min(...projections), max: Math.max(...projections) };
}

/**
 * The projection on the normal of every slice of a one-step traversal of
 * the view, from the first slice to the last.
 */
function slicePositions(imageVolume, orientation) {
  const { maxImageIdIndex, sliceBasis } = openSlice(imageVolume, orientation);
  const normal = sliceBasis.viewPlaneNormal;

  return Array.from({ length: maxImageIdIndex + 1 }, (_, index) =>
    dot(
      openSlice(imageVolume, orientation, index).sliceBasis.sliceCenterWorld,
      normal
    )
  );
}

const OBLIQUE_NORMALS = [
  [0.3, -0.4, 0.866],
  [1, 1, 0],
  [0.2, 0.9, 0.4],
  [-0.7, 0.1, 0.7],
];

function withMeasure(measure, run) {
  const configuration = getConfiguration();

  setConfiguration({
    ...configuration,
    rendering: { ...configuration.rendering, sliceStepMeasure: measure },
  });

  try {
    return run();
  } finally {
    setConfiguration(configuration);
  }
}

describe('the slice grid of a volume view', () => {
  it('steps by the thickness of one voxel along the normal by default', () => {
    expect(getConfiguration().rendering.sliceStepMeasure).toBe('l1');

    const imageVolume = createVolume({
      dimensions: [7, 6, 5],
      spacing: [1, 1.5, 2],
    });
    const orientation = orientationFor(OBLIQUE_NORMALS[0]);
    const positions = slicePositions(imageVolume, orientation);

    expect(positions[1] - positions[0]).toBeCloseTo(
      getVoxelThicknessAlongNormal(imageVolume, orientation.viewPlaneNormal),
      5
    );
  });

  it.each([
    [5, 1],
    [5, -1],
    [6, 1],
    [6, -1],
  ])(
    'keeps the positions and the count of a view along the volume axis (%i slices, normal %i)',
    (numberOfSlices, sign) => {
      const imageVolume = createVolume({
        dimensions: [4, 3, numberOfSlices],
        spacing: [1, 1, 2.5],
        origin: [10, 20, 30],
      });
      const orientation = {
        viewPlaneNormal: [0, 0, sign],
        viewUp: [0, -1, 0],
      };
      const { maxImageIdIndex, currentImageIdIndex, sliceBasis } = openSlice(
        imageVolume,
        orientation
      );
      const zOfIndex = (index) =>
        30 + (sign > 0 ? index : numberOfSlices - 1 - index) * 2.5;

      expect(maxImageIdIndex).toBe(numberOfSlices - 1);
      slicePositions(imageVolume, orientation).forEach((position, index) => {
        expect(position * sign).toBeCloseTo(zOfIndex(index), 5);
      });
      expect(currentImageIdIndex).toBe(Math.floor(numberOfSlices / 2));
      expect(sliceBasis.sliceCenterWorld[2]).toBeCloseTo(
        zOfIndex(Math.floor(numberOfSlices / 2)),
        5
      );
    }
  );

  it.each(OBLIQUE_NORMALS)(
    'centres the slices of an oblique view on the volume (normal %p, %p, %p)',
    (...viewPlaneNormal) => {
      const imageVolume = createVolume({
        dimensions: [7, 6, 5],
        spacing: [1, 1.5, 2],
        origin: [-3, 4, 11],
      });
      const orientation = orientationFor(viewPlaneNormal);
      const normal = orientation.viewPlaneNormal;
      const step = getVoxelThicknessAlongNormal(imageVolume, normal);
      const { min, max } = centreRange(imageVolume, normal);
      const count = Math.round((max - min) / step) + 1;
      const positions = slicePositions(imageVolume, orientation);

      expect(positions).toHaveLength(count);
      expect(positions[0] - min).toBeCloseTo(
        max - positions[positions.length - 1],
        5
      );
      expect(Math.abs(positions[0] - min)).toBeLessThanOrEqual(step / 4);
      positions.forEach((position, index) => {
        expect(position).toBeCloseTo(positions[0] + index * step, 5);
      });
    }
  );

  it('gives an oblique view fewer slices than the l2 step of 5.x', () => {
    const imageVolume = createVolume({
      dimensions: [7, 6, 5],
      spacing: [1, 1.5, 2],
    });
    const orientation = orientationFor(OBLIQUE_NORMALS[1]);
    const l1Count = slicePositions(imageVolume, orientation).length;
    const l2Count = withMeasure(
      'l2',
      () => slicePositions(imageVolume, orientation).length
    );

    expect(l1Count).toBeLessThan(l2Count);
  });

  describe('VSN-U-1: a one-step traversal shows each voxel on exactly one slice', () => {
    /**
     * The slices that show a voxel: those whose plane cuts the voxel, that is
     * whose distance from the centre of the voxel along the normal is in
     * [-t / 2, t / 2), with t the thickness of the voxel along the normal.
     */
    function slicesShowingEachVoxel(imageVolume, orientation) {
      const normal = orientation.viewPlaneNormal;
      const thickness = getVoxelThicknessAlongNormal(imageVolume, normal);
      const tolerance = thickness * 1e-9;
      const positions = slicePositions(imageVolume, orientation);

      return voxelCentres(imageVolume).map((centre) => {
        const depth = dot(centre, normal);

        return positions.filter((position) => {
          const offset = depth - position;

          return (
            offset >= -thickness / 2 - tolerance &&
            offset < thickness / 2 - tolerance
          );
        }).length;
      });
    }

    it.each([[0, 0, 1], [1, 0, 0], ...OBLIQUE_NORMALS])(
      'in the orientation with the normal %p, %p, %p',
      (...viewPlaneNormal) => {
        const imageVolume = createVolume({
          dimensions: [7, 6, 5],
          spacing: [1, 1.5, 2],
          origin: [-3, 4, 11],
        });
        const counts = slicesShowingEachVoxel(
          imageVolume,
          orientationFor(viewPlaneNormal)
        );

        expect(new Set(counts)).toEqual(new Set([1]));
      }
    );

    it('fails with the l2 step, which shows some voxels on two slices', () => {
      const imageVolume = createVolume({
        dimensions: [7, 6, 5],
        spacing: [1, 1.5, 2],
      });
      const orientation = orientationFor(OBLIQUE_NORMALS[1]);
      const counts = withMeasure('l2', () =>
        slicesShowingEachVoxel(imageVolume, orientation)
      );

      expect(
        getSpacingInNormalDirection(imageVolume, orientation.viewPlaneNormal)
      ).toBeLessThan(
        getVoxelThicknessAlongNormal(imageVolume, orientation.viewPlaneNormal)
      );
      expect(Math.max(...counts)).toBe(2);
    });
  });

  it('reports the nearest slice of the grid for a point between two slices', () => {
    const imageVolume = createVolume({
      dimensions: [7, 6, 5],
      spacing: [1, 1.5, 2],
    });
    const orientation = orientationFor(OBLIQUE_NORMALS[2]);
    const normal = orientation.viewPlaneNormal;
    const step = getVoxelThicknessAlongNormal(imageVolume, normal);
    const sliceTwo = openSlice(imageVolume, orientation, 2).sliceBasis
      .sliceCenterWorld;
    const indexAt = (offset) =>
      openSlice(imageVolume, orientation, undefined, {
        slice: {
          kind: 'volumePoint',
          sliceWorldPoint: Array.from(
            vec3.scaleAndAdd(vec3.create(), sliceTwo, normal, offset * step)
          ),
        },
      }).currentImageIdIndex;

    expect(indexAt(0)).toBe(2);
    expect(indexAt(0.4)).toBe(2);
    expect(indexAt(-0.4)).toBe(2);
    expect(indexAt(0.6)).toBe(3);
    expect(indexAt(-0.6)).toBe(1);
  });

  it('gives the cut of a surface at the slices of the view', () => {
    const imageVolume = createVolume({
      dimensions: [7, 6, 5],
      spacing: [1, 1.5, 2],
      origin: [-3, 4, 11],
    });
    const orientation = orientationFor(OBLIQUE_NORMALS[0]);
    const normal = orientation.viewPlaneNormal;
    const positions = slicePositions(imageVolume, orientation);
    const focalPoint = openSlice(imageVolume, orientation, 2).sliceBasis
      .sliceCenterWorld;
    const entries = getVolumeSlicesClippingPlanes(imageVolume, {
      focalPoint,
      position: Array.from(
        vec3.scaleAndAdd(vec3.create(), focalPoint, normal, 100)
      ),
      viewPlaneNormal: normal,
    });

    expect(entries.map(({ sliceIndex }) => sliceIndex)).toEqual(
      positions.map((_, index) => index)
    );
    entries.forEach(({ sliceIndex, planes }) => {
      expect(
        dot(planes[0].origin, normal) +
          RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
      ).toBeCloseTo(positions[sliceIndex], 5);
    });
  });

  describe('the panes of a 512 x 512 x 135 CT and its 128 x 128 x 135 PET', () => {
    const ct = () =>
      createVolume({
        dimensions: [512, 512, 135],
        spacing: [0.976562, 0.976562, 3.27],
        origin: [-250, -250, -360.18],
      });
    const pet = () =>
      createVolume({
        dimensions: [128, 128, 135],
        spacing: [4.6875, 4.6875, 3.2703],
        origin: [-297.65625, -297.65625, -360.2],
      });

    it.each([
      [OrientationAxis.AXIAL, 2, 135, 67, -141.09],
      [OrientationAxis.SAGITTAL, 0, 512, 256, -250 + 256 * 0.976562],
      [OrientationAxis.CORONAL, 1, 512, 256, -250 + 255 * 0.976562],
    ])(
      'opens the CT %s pane on the middle slice in view order',
      (orientation, axis, numberOfSlices, index, position) => {
        const { maxImageIdIndex, currentImageIdIndex, sliceBasis } = openSlice(
          ct(),
          orientation
        );

        expect(maxImageIdIndex + 1).toBe(numberOfSlices);
        expect(currentImageIdIndex).toBe(index);
        expect(sliceBasis.sliceCenterWorld[axis]).toBeCloseTo(position, 5);
      }
    );

    it.each([
      [OrientationAxis.SAGITTAL, 0, 64, -297.65625 + 64 * 4.6875],
      [OrientationAxis.CORONAL, 1, 64, -297.65625 + 63 * 4.6875],
    ])(
      'opens the PET %s pane on the middle slice in view order',
      (orientation, axis, index, position) => {
        const { maxImageIdIndex, currentImageIdIndex, sliceBasis } = openSlice(
          pet(),
          orientation
        );

        expect(maxImageIdIndex + 1).toBe(128);
        expect(currentImageIdIndex).toBe(index);
        expect(sliceBasis.sliceCenterWorld[axis]).toBeCloseTo(position, 5);
      }
    );

    it.each([
      [OrientationAxis.SAGITTAL, [0, -0.488, -141.09], 256],
      [OrientationAxis.CORONAL, [-0.488, 0, -141.09], 255],
      [OrientationAxis.SAGITTAL, [2.34375, -0.488, -141.09], 258],
      [OrientationAxis.CORONAL, [-0.488, 2.34375, -141.09], 253],
    ])(
      'reports the index of the CT %s pane at the point %p',
      (orientation, sliceWorldPoint, index) => {
        expect(
          openSlice(ct(), orientation, undefined, {
            slice: { kind: 'volumePoint', sliceWorldPoint },
          }).currentImageIdIndex
        ).toBe(index);
      }
    );
  });
});
