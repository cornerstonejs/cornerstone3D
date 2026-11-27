import * as metaData from '../src/metaData';
import { OrientationAxis } from '../src/enums';
import {
  getPlanarAcquisitionOrientation,
  normalizePlanarOrientation,
} from '../src/RenderingEngine/GenericViewport/Planar/planarRenderPathSelector';

const tilt = (13 * Math.PI) / 180;
const IOP = {
  sagittal: [0, 1, 0, 0, 0, -1],
  obliqueSagittal: [Math.sin(tilt), Math.cos(tilt), 0, 0, 0, -1],
  // The normal stays [-1, 0, 0]; the in-plane axes turn by 13 degrees.
  rotatedSagittal: [
    0,
    Math.cos(tilt),
    -Math.sin(tilt),
    0,
    -Math.sin(tilt),
    -Math.cos(tilt),
  ],
  mirroredSagittal: [0, -1, 0, 0, 0, -1],
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
    const acquisition = getPlanarAcquisitionOrientation(['sagittal']);

    expect(acquisition).toBe(OrientationAxis.SAGITTAL);
    expect(
      normalizePlanarOrientation(OrientationAxis.SAGITTAL, acquisition)
    ).toBe(OrientationAxis.ACQUISITION);
  });

  it('does not equate a 13 degree oblique series with the standard orientation', () => {
    const acquisition = getPlanarAcquisitionOrientation(['obliqueSagittal']);

    expect(acquisition).toBeUndefined();
    expect(
      normalizePlanarOrientation(OrientationAxis.SAGITTAL, acquisition)
    ).toBe(OrientationAxis.SAGITTAL);
  });

  it('does not equate a series with a 13 degree in-plane rotation or a mirror', () => {
    expect(
      getPlanarAcquisitionOrientation(['rotatedSagittal'])
    ).toBeUndefined();
    expect(
      getPlanarAcquisitionOrientation(['mirroredSagittal'])
    ).toBeUndefined();
  });
});
