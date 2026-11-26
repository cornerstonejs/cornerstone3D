import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import * as metaData from '../src/metaData';
import { OrientationAxis } from '../src/enums';
import {
  getPlanarAcquisitionOrientation,
  normalizePlanarOrientation,
} from '../src/RenderingEngine/Viewports/Planar/planarRenderPathSelector';

const tilt = (13 * Math.PI) / 180;

/**
 * The tilt that moves the plane of a 256 x 256 frame of 1 mm pixels by half
 * of its 3 mm slice across its half diagonal: sin(t) * 181.02 = 1.5, about
 * 0.4748 degrees.
 */
const halfSliceTilt = Math.asin(1.5 / (Math.hypot(256, 256) / 2));

function tiltedSagittal(angle) {
  return [Math.sin(angle), Math.cos(angle), 0, 0, 0, -1];
}

function tiltedAxial(angle) {
  return [1, 0, 0, 0, Math.cos(angle), Math.sin(angle)];
}

const IOP = {
  sagittal: [0, 1, 0, 0, 0, -1],
  obliqueSagittal: [Math.sin(tilt), Math.cos(tilt), 0, 0, 0, -1],
  justUnderHalfSlice: tiltedSagittal(halfSliceTilt * 0.95),
  justOverHalfSlice: tiltedSagittal(halfSliceTilt * 1.05),
  axialUnderHalfSlice: tiltedAxial(halfSliceTilt * 0.95),
};

describe('getPlanarAcquisitionOrientation', () => {
  const provider = (type, imageId) =>
    type === 'imagePlaneModule'
      ? {
          imageOrientationPatient: IOP[imageId],
          rows: 256,
          columns: 256,
          rowPixelSpacing: 1,
          columnPixelSpacing: 1,
          sliceThickness: 3,
        }
      : undefined;

  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  it('reports the standard orientation of an axis-aligned series', () => {
    const acquisition = getPlanarAcquisitionOrientation(['sagittal'], true);

    expect(acquisition).toBe(OrientationAxis.SAGITTAL);
    expect(
      normalizePlanarOrientation(OrientationAxis.SAGITTAL, acquisition)
    ).toBe(OrientationAxis.ACQUISITION);
  });

  it('does not equate a 13 degree oblique series with the standard orientation', () => {
    const acquisition = getPlanarAcquisitionOrientation(
      ['obliqueSagittal'],
      true
    );

    expect(acquisition).toBeUndefined();
    expect(
      normalizePlanarOrientation(OrientationAxis.SAGITTAL, acquisition)
    ).toBe(OrientationAxis.SAGITTAL);
  });

  it('reports the standard orientation of a series tilted by just under half a slice', () => {
    expect(getPlanarAcquisitionOrientation(['justUnderHalfSlice'], true)).toBe(
      OrientationAxis.SAGITTAL
    );
  });

  it('does not report the standard orientation of a series tilted by just over half a slice', () => {
    expect(
      getPlanarAcquisitionOrientation(['justOverHalfSlice'], true)
    ).toBeUndefined();
  });

  it('keeps the nearest orientation for an oblique stack that cannot be a volume', () => {
    const acquisition = getPlanarAcquisitionOrientation(['obliqueSagittal']);

    expect(acquisition).toBe(OrientationAxis.SAGITTAL);
    expect(
      normalizePlanarOrientation(OrientationAxis.SAGITTAL, acquisition)
    ).toBe(OrientationAxis.ACQUISITION);
  });

  describe('on the volume path', () => {
    function createTiltedAxialVolume(angle) {
      const [rx, ry, rz, cx, cy, cz] = tiltedAxial(angle);
      const direction = [
        rx,
        ry,
        rz,
        cx,
        cy,
        cz,
        ry * cz - rz * cy,
        rz * cx - rx * cz,
        rx * cy - ry * cx,
      ];
      const dimensions = [256, 256, 40];
      const spacing = [1, 1, 3];
      const imageData = vtkImageData.newInstance({
        spacing,
        origin: [0, 0, 0],
        direction,
      });

      imageData.setDimensions(dimensions);

      return { dimensions, spacing, direction, imageData };
    }

    it('shows the acquired plane for an axial request on a series tilted by less than half a slice', () => {
      const acquisition = getPlanarAcquisitionOrientation(
        ['axialUnderHalfSlice'],
        true
      );

      expect(acquisition).toBe(OrientationAxis.AXIAL);
      expect(
        normalizePlanarOrientation(
          OrientationAxis.AXIAL,
          acquisition,
          createTiltedAxialVolume(halfSliceTilt * 0.95)
        )
      ).toBe(OrientationAxis.ACQUISITION);
    });

    it('reformats an axial request on a volume tilted by more than half a slice', () => {
      expect(
        normalizePlanarOrientation(
          OrientationAxis.AXIAL,
          OrientationAxis.AXIAL,
          createTiltedAxialVolume(halfSliceTilt * 1.05)
        )
      ).toBe(OrientationAxis.AXIAL);
    });
  });
});
