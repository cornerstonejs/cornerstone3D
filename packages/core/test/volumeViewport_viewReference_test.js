import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader } = cornerstone3D;

const viewportId = 'VIEWPORT';

/** A volume over the same 60 mm as the others, its slices `sliceSpacing` mm apart. */
function createVolume(volumeId, sliceSpacing) {
  const slices = 60 / sliceSpacing + 1;
  return volumeLoader.createLocalVolume(volumeId, {
    dimensions: [16, 16, slices],
    spacing: [1, 1, sliceSpacing],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    scalarData: new Float32Array(16 * 16 * slices),
    metadata: {
      FrameOfReferenceUID: 'Volume_Frame_Of_Reference',
      Modality: 'CT',
      PhotometricInterpretation: 'MONOCHROME2',
      voiLut: [{ windowWidth: 400, windowCenter: 40 }],
    },
  });
}

/** The height of the camera's focal point, along z. */
function heightOf(viewport) {
  return viewport.getCamera().focalPoint[2];
}

/** Moves the camera along z so that its focal point is at the given height. */
function moveTo(viewport, z) {
  const { focalPoint, position } = viewport.getCamera();
  const dz = z - focalPoint[2];
  viewport.setCamera({
    focalPoint: [focalPoint[0], focalPoint[1], z],
    position: [position[0], position[1], position[2] + dz],
  });
}

/**
 * Turns the camera around its focal point to look along another normal, as
 * far from the focal point as it was.
 */
function lookAlong(viewport, viewPlaneNormal, viewUp) {
  const { focalPoint, position } = viewport.getCamera();
  const distance = Math.hypot(
    position[0] - focalPoint[0],
    position[1] - focalPoint[1],
    position[2] - focalPoint[2]
  );
  viewport.setCamera({
    viewPlaneNormal,
    viewUp,
    focalPoint,
    position: focalPoint.map((v, i) => v + viewPlaneNormal[i] * distance),
  });
}

// getSliceIndex counts the slices of the volume of the smallest spacing
// along the normal. The first volume of a fusion, which getVolumeId names,
// can have larger ones: here 3 mm, the second 2 mm.
describe('Volume Viewport view reference with volumes of different slice spacing --', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      viewportIds: [viewportId],
    });
    renderingEngine = testEnv.renderingEngine;
    createVolume('coarse', 3);
    createVolume('fine', 2);
    createVolume('label', 2);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngine.id,
      toolGroupIds: ['default'],
    });
  });

  async function axialViewportOnHeight20() {
    testUtils.createViewports(renderingEngine, {
      viewportId,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportType: Enums.ViewportType.ORTHOGRAPHIC,
    });
    const viewport = renderingEngine.getViewport(viewportId);
    await viewport.setVolumes([{ volumeId: 'coarse' }, { volumeId: 'fine' }]);
    // A slice of the 2 mm volume, between two of the 3 mm one
    moveTo(viewport, 20);
    return viewport;
  }

  it('comes back to its slice from its own view reference', async () => {
    const viewport = await axialViewportOnHeight20();
    const sliceIndex = viewport.getSliceIndex();

    viewport.setViewReference(viewport.getViewReference());

    expect(heightOf(viewport)).toBeCloseTo(20, 6);
    expect(viewport.getSliceIndex()).toBe(sliceIndex);
  });

  it('stays on its slice when a volume is added', async () => {
    const viewport = await axialViewportOnHeight20();

    await viewport.addVolumes([{ volumeId: 'label' }]);

    expect(heightOf(viewport)).toBeCloseTo(20, 6);
  });

  it('gives the focal point of a slice as getSliceIndex counts it', async () => {
    const viewport = await axialViewportOnHeight20();
    const sliceIndex = viewport.getSliceIndex();
    moveTo(viewport, 40);

    const { cameraFocalPoint } = viewport.getViewReference({ sliceIndex });

    expect(cameraFocalPoint[2]).toBeCloseTo(20, 6);
  });

  it('comes back to its slice from a view reference of the opposite orientation', async () => {
    const viewport = await axialViewportOnHeight20();
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    lookAlong(
      viewport,
      viewPlaneNormal.map((v) => -v),
      viewUp
    );
    const fromBehind = viewport.getViewReference();
    lookAlong(viewport, viewPlaneNormal, viewUp);
    moveTo(viewport, 40);
    viewport.setViewReference(fromBehind);

    expect(heightOf(viewport)).toBeCloseTo(20, 6);
  });

  it('comes back to the first and the last slice, and stops there', async () => {
    const viewport = await axialViewportOnHeight20();

    for (const height of [0, 60]) {
      moveTo(viewport, height);
      const viewReference = viewport.getViewReference();
      moveTo(viewport, 20);
      viewport.setViewReference(viewReference);

      expect(heightOf(viewport)).toBeCloseTo(height, 6);
    }

    const viewReference = viewport.getViewReference();
    const lastSliceIndex = viewport.getNumberOfSlices() - 1;
    viewport.setViewReference({ ...viewReference, sliceIndex: -5 });
    expect(viewport.getSliceIndex()).toBe(0);
    viewport.setViewReference({ ...viewReference, sliceIndex: 1000 });
    expect(viewport.getSliceIndex()).toBe(lastSliceIndex);
  });

  it('counts slices and not slabs', async () => {
    const viewport = await axialViewportOnHeight20();
    viewport.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
    viewport.setSlabThickness(10);

    viewport.setViewReference(viewport.getViewReference());

    expect(heightOf(viewport)).toBeCloseTo(20, 6);
  });

  it('stays where it is for a slice index that is not a number', async () => {
    const viewport = await axialViewportOnHeight20();

    viewport.setViewReference({
      ...viewport.getViewReference(),
      sliceIndex: NaN,
    });

    expect(heightOf(viewport)).toBeCloseTo(20, 6);
  });

  // The range of an oblique view is not a whole number of slice spacings
  it('keeps its slice in an oblique view, from one view reference to the next', async () => {
    const viewport = await axialViewportOnHeight20();
    const angle = (25 * Math.PI) / 180;
    lookAlong(
      viewport,
      [0, Math.sin(angle), -Math.cos(angle)],
      [0, Math.cos(angle), Math.sin(angle)]
    );
    // Towards the end of the range
    moveTo(viewport, 8);
    const sliceIndex = viewport.getSliceIndex();

    viewport.setViewReference(viewport.getViewReference());
    const height = heightOf(viewport);
    for (let i = 0; i < 3; i++) {
      viewport.setViewReference(viewport.getViewReference());
    }

    expect(viewport.getSliceIndex()).toBe(sliceIndex);
    expect(heightOf(viewport)).toBeCloseTo(height, 3);
  });
});
