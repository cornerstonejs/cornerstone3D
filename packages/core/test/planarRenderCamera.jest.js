jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));

import { OrientationAxis } from '../src/enums';
import { RENDERING_DEFAULTS } from '../src/constants';
import { PlanarVolumeResolvedView } from '../src/RenderingEngine/GenericViewport/Planar';
import {
  applyPlanarICameraToActor,
  applyPlanarICameraToRenderer,
  createPlanarPresentationScaleMatrix,
  derivePlanarPresentation,
  projectAnchorWorldToCurrentPlane,
  resolvePlanarICamera,
  setPlanarVolumeCameraClippingRange,
  updatePlanarVolumeClippingPlanes,
} from '../src/RenderingEngine/GenericViewport/Planar/planarRenderCamera';
import setVtkCameraClippingRange from '../src/RenderingEngine/GenericViewport/setVtkCameraClippingRange';

function expectPoint2Close(actual, expected, precision = 5) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
}

function expectPoint3Close(actual, expected, precision = 5) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
}

// Independent re-derivation of Rodrigues' rotation formula for a vector `v`
// that is perpendicular to a unit `axis`. Used to compute an expected
// rotated viewUp without reusing the source's own rotatePlanarViewUp/mat4
// helpers, so the test is not just re-running the implementation.
function rotatePerpendicular(v, axis, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cross = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];

  return [
    v[0] * cos + cross[0] * sin,
    v[1] * cos + cross[1] * sin,
    v[2] * cos + cross[2] * sin,
  ];
}

function distance3(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/**
 * A hand-authored PlanarSliceBasis used to unit-test planarRenderCamera in
 * isolation from planarSliceBasis.ts. Chosen so the canvas aspect ratio
 * (200x100 => 2:1) exactly matches the slice aspect ratio (200x100 world
 * units => 2:1), which keeps fitParallelScale/worldWidth/worldHeight
 * arithmetic free of aspect-correction terms:
 *   fitParallelScale = 50  => worldHeight at zoom=1 is 100, worldWidth is 200
 *   sliceCenterWorld = [10, 20, 30]
 *   viewPlaneNormal = [0, 0, 1] (already unit, "looking" from +z)
 *   viewUp = [0, -1, 0] (already unit)
 *   cameraDistance = 500
 */
function createSliceBasisA() {
  return {
    sliceCenterWorld: [10, 20, 30],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
    fitParallelScale: 50,
    sliceWidthWorld: 200,
    sliceHeightWorld: 100,
    cameraDistance: 500,
  };
}

const CANVAS_A = { canvasWidth: 200, canvasHeight: 100 };

describe('setVtkCameraClippingRange', () => {
  it('sets a symmetric clipping range for parallel projection', () => {
    const camera = {
      getParallelProjection: jest.fn(() => true),
      setClippingRange: jest.fn(),
    };

    setVtkCameraClippingRange(camera);

    expect(camera.setClippingRange).toHaveBeenCalledTimes(1);
    const [near, far] = camera.setClippingRange.mock.calls[0];

    expect(near).toBeCloseTo(-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, 5);
    expect(far).toBeCloseTo(RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, 5);
  });

  it('sets a near-plane clipping range for perspective projection', () => {
    const camera = {
      getParallelProjection: jest.fn(() => false),
      setClippingRange: jest.fn(),
    };

    setVtkCameraClippingRange(camera);

    expect(camera.setClippingRange).toHaveBeenCalledTimes(1);
    const [near, far] = camera.setClippingRange.mock.calls[0];

    expect(near).toBeCloseTo(RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS, 5);
    expect(far).toBeCloseTo(RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, 5);
  });
});

describe('projectAnchorWorldToCurrentPlane', () => {
  it('projects a point onto a plane defined by point + unit normal', () => {
    // anchor = [5,5,5], plane through origin with normal [0,0,1] (the XY
    // plane). distance = dot([5,5,5],[0,0,1]) = 5, so the projection
    // subtracts 5 along the normal, landing at [5,5,0].
    const result = projectAnchorWorldToCurrentPlane(
      [5, 5, 5],
      [0, 0, 0],
      [0, 0, 1]
    );

    expectPoint3Close(result, [5, 5, 0]);
  });

  it('normalizes a non-unit plane normal before projecting', () => {
    // Same geometry as above but the normal is supplied as [0,0,2]; the
    // function must normalize it internally before computing distance.
    const result = projectAnchorWorldToCurrentPlane(
      [5, 5, 5],
      [0, 0, 0],
      [0, 0, 2]
    );

    expectPoint3Close(result, [5, 5, 0]);
  });

  it('returns the anchor unchanged when it already lies on the plane', () => {
    const result = projectAnchorWorldToCurrentPlane(
      [3, 4, 0],
      [0, 0, 0],
      [0, 0, 1]
    );

    expectPoint3Close(result, [3, 4, 0]);
  });
});

describe('derivePlanarPresentation', () => {
  it('resolves default pan/zoom/rotation for an undefined camera', () => {
    const presentation = derivePlanarPresentation({
      sliceBasis: createSliceBasisA(),
      camera: undefined,
      ...CANVAS_A,
    });

    expectPoint2Close(presentation.pan, [0, 0]);
    expect(presentation.zoom).toBeCloseTo(1, 10);
    expect(presentation.rotation).toBe(0);
    expect(presentation.flipHorizontal).toBe(false);
    expect(presentation.flipVertical).toBe(false);
    expectPoint2Close(presentation.scale, [1, 1]);
  });

  it('derives pan from anchorCanvas relative to the canvas center', () => {
    // anchorCanvas [0.6, 0.3] on a 200x100 canvas shifts by
    // (0.6-0.5)*200 = 20 horizontally and (0.3-0.5)*100 = -20 vertically.
    // anchorWorld is not set, so panFromAnchorWorld is zero.
    const presentation = derivePlanarPresentation({
      sliceBasis: createSliceBasisA(),
      camera: { anchorCanvas: [0.6, 0.3] },
      ...CANVAS_A,
    });

    expectPoint2Close(presentation.pan, [20, -20]);
  });

  it('normalizes rotation into [0, 360)', () => {
    const basis = createSliceBasisA();

    expect(
      derivePlanarPresentation({
        sliceBasis: basis,
        camera: undefined,
        ...CANVAS_A,
      }).rotation
    ).toBe(0);
    expect(
      derivePlanarPresentation({
        sliceBasis: basis,
        camera: { rotation: 450 },
        ...CANVAS_A,
      }).rotation
    ).toBeCloseTo(90, 10);
    expect(
      derivePlanarPresentation({
        sliceBasis: basis,
        camera: { rotation: -90 },
        ...CANVAS_A,
      }).rotation
    ).toBeCloseTo(270, 10);
  });

  it('only treats a strict boolean true as an active flip flag', () => {
    // flipHorizontal is compared with `=== true`, so a truthy non-boolean
    // value must resolve to false.
    const presentation = derivePlanarPresentation({
      sliceBasis: createSliceBasisA(),
      camera: { flipHorizontal: 'yes' },
      ...CANVAS_A,
    });

    expect(presentation.flipHorizontal).toBe(false);
  });

  it('produces finite values for a degenerate (zero-size) canvas', () => {
    const presentation = derivePlanarPresentation({
      sliceBasis: createSliceBasisA(),
      camera: { anchorCanvas: [0.75, 0.5] },
      canvasWidth: 0,
      canvasHeight: 0,
    });

    expect(Number.isFinite(presentation.pan[0])).toBe(true);
    expect(Number.isFinite(presentation.pan[1])).toBe(true);
    expect(Number.isFinite(presentation.zoom)).toBe(true);
  });

  describe('displayArea overrides', () => {
    // getSliceCanvasDimensionsAtFit for sliceBasisA on the 200x100 canvas:
    //   worldHeightAtFit = fitParallelScale*2 = 100
    //   worldWidthAtFit = 100 * (200/100) = 200
    //   imageWidthAtFit = (sliceWidthWorld/worldWidthAtFit)*canvasWidth
    //                   = (200/200)*200 = 200
    //   imageHeightAtFit = (sliceHeightWorld/worldHeightAtFit)*canvasHeight
    //                    = (100/100)*100 = 100
    // i.e. imageWidthAtFit/imageHeightAtFit exactly match the canvas here,
    // which keeps the derivations below simple.

    it('type SCALE uses the explicit scale and zero pan without imageCanvasPoint', () => {
      const presentation = derivePlanarPresentation({
        sliceBasis: createSliceBasisA(),
        camera: { displayArea: { type: 'SCALE', scale: [3, 4] } },
        ...CANVAS_A,
      });

      expectPoint2Close(presentation.scale, [3, 4]);
      expect(presentation.zoom).toBeCloseTo(4, 10);
      expectPoint2Close(presentation.pan, [0, 0]);
    });

    it('type FIT with imageArea + fitWidth scaleMode + imageCanvasPoint derives scale and pan', () => {
      // safeAreaX=0.5, safeAreaY=1
      // fitScaleX = canvasWidth / (areaX*imageWidthAtFit) = 200/(0.5*200) = 2
      // fitScaleY = canvasHeight / (areaY*imageHeightAtFit) = 100/(1*100) = 1
      // scaleMode 'fitWidth' -> uniformFitScale = fitScaleX = 2
      // resolvedScale = [2*scale.x, 2*scale.y] = [2, 2] (scale defaults to [1,1])
      //
      // pan.x = resolvedScale.x*imageWidthAtFit*(0.5-imageX) + canvasWidth*(canvasX-0.5)
      //       = 2*200*(0.5-0.2) + 200*(0.3-0.5) = 120 - 40 = 80
      // pan.y = resolvedScale.y*imageHeightAtFit*(0.5-imageY) + canvasHeight*(canvasY-0.5)
      //       = 2*100*(0.5-0.8) + 100*(0.4-0.5) = -60 - 10 = -70
      const presentation = derivePlanarPresentation({
        sliceBasis: createSliceBasisA(),
        camera: {
          displayArea: {
            type: 'FIT',
            imageArea: [0.5, 1],
            scaleMode: 'fitWidth',
            imageCanvasPoint: {
              imagePoint: [0.2, 0.8],
              canvasPoint: [0.3, 0.4],
            },
          },
        },
        ...CANVAS_A,
      });

      expectPoint2Close(presentation.scale, [2, 2]);
      expect(presentation.zoom).toBeCloseTo(2, 10);
      expectPoint2Close(presentation.pan, [80, -70]);
    });

    it.each([
      // fitScaleX = 2, fitScaleY = 1 (as derived above)
      ['absolute', [2, 3], [4, 3]],
      ['fitHeight', [1, 1], [1, 1]],
      ['fitAspect', [1, 1], [1, 1]], // min(fitScaleX, fitScaleY) = 1
      ['bogus-mode', [1, 1], [1, 1]], // falls back to fitAspect behavior
    ])(
      'scaleMode %s resolves the expected non-uniform/uniform scale',
      (scaleMode, inputScale, expectedScale) => {
        const presentation = derivePlanarPresentation({
          sliceBasis: createSliceBasisA(),
          camera: {
            scale: inputScale,
            displayArea: {
              type: 'FIT',
              imageArea: [0.5, 1],
              scaleMode,
            },
          },
          ...CANVAS_A,
        });

        expectPoint2Close(presentation.scale, expectedScale);
      }
    );
  });
});

describe('resolvePlanarICamera', () => {
  it('resolves focalPoint/position/viewUp/viewPlaneNormal/parallelScale for the default camera', () => {
    // With no pan (anchorCanvas centered, no anchorWorld) the focalPoint is
    // exactly sliceCenterWorld, and position = focalPoint + normal*cameraDistance.
    const resolved = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: undefined,
      ...CANVAS_A,
    });

    expectPoint3Close(resolved.focalPoint, [10, 20, 30]);
    expectPoint3Close(resolved.position, [10, 20, 530]);
    expectPoint3Close(resolved.viewUp, [0, -1, 0]);
    expectPoint3Close(resolved.viewPlaneNormal, [0, 0, 1]);
    expect(resolved.parallelScale).toBeCloseTo(50, 10);
    expect(resolved.parallelProjection).toBe(true);
    expect(resolved.scaleMode).toBe('fit');
  });

  it('halves parallelScale when zoom (scale.y) doubles, without moving focalPoint/position', () => {
    // parallelScale = fitParallelScale / scale.y = 50/2 = 25. Pan stays zero
    // regardless of scale because there is no anchor offset, so the camera
    // position is unaffected by zoom -- only parallelScale changes.
    const resolved = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { scale: 2 },
      ...CANVAS_A,
    });

    expect(resolved.parallelScale).toBeCloseTo(25, 10);
    expectPoint3Close(resolved.focalPoint, [10, 20, 30]);
    expectPoint3Close(resolved.position, [10, 20, 530]);
  });

  it('rotates viewUp by 90 degrees about the view plane normal without moving the camera', () => {
    // Rodrigues rotation of viewUp=[0,-1,0] about axis=[0,0,1] by 90 deg:
    // k x v = [1,0,0] (k.v = 0 since v is already perpendicular to k), so
    // v_rot = v*cos(90) + (k x v)*sin(90) = [1, 0, 0].
    const resolved = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 90 },
      ...CANVAS_A,
    });

    expectPoint3Close(resolved.viewUp, [1, 0, 0]);
    expectPoint3Close(resolved.focalPoint, [10, 20, 30]);
    expectPoint3Close(resolved.position, [10, 20, 530]);
  });

  it('rotates viewUp by an arbitrary angle consistently with independent Rodrigues formula', () => {
    const expectedViewUp = rotatePerpendicular([0, -1, 0], [0, 0, 1], 37);
    const resolved = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 37 },
      ...CANVAS_A,
    });

    expectPoint3Close(resolved.viewUp, expectedViewUp, 6);
  });

  it('produces the same viewUp for a rotation and its 360-wrapped equivalent', () => {
    const base = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 90 },
      ...CANVAS_A,
    });
    const wrapped = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 450 },
      ...CANVAS_A,
    });

    expectPoint3Close(wrapped.viewUp, base.viewUp);
  });

  describe('flip combinations', () => {
    // shouldFlipNormal = flipHorizontal XOR flipVertical; viewUp is negated
    // only when flipVertical is true (independent of flipHorizontal).
    it('flipHorizontal alone negates viewPlaneNormal but leaves viewUp untouched', () => {
      const resolved = resolvePlanarICamera({
        sliceBasis: createSliceBasisA(),
        camera: { flipHorizontal: true },
        ...CANVAS_A,
      });

      expectPoint3Close(resolved.viewPlaneNormal, [0, 0, -1]);
      expectPoint3Close(resolved.viewUp, [0, -1, 0]);
      expectPoint3Close(resolved.position, [10, 20, -470]);
      expect(resolved.flipHorizontal).toBe(true);
      expect(resolved.flipVertical).toBe(false);
    });

    it('flipVertical alone negates both viewPlaneNormal and viewUp', () => {
      const resolved = resolvePlanarICamera({
        sliceBasis: createSliceBasisA(),
        camera: { flipVertical: true },
        ...CANVAS_A,
      });

      expectPoint3Close(resolved.viewPlaneNormal, [0, 0, -1]);
      expectPoint3Close(resolved.viewUp, [0, 1, 0]);
      expectPoint3Close(resolved.position, [10, 20, -470]);
    });

    it('flipping both horizontal and vertical leaves viewPlaneNormal unchanged but negates viewUp', () => {
      const resolved = resolvePlanarICamera({
        sliceBasis: createSliceBasisA(),
        camera: { flipHorizontal: true, flipVertical: true },
        ...CANVAS_A,
      });

      expectPoint3Close(resolved.viewPlaneNormal, [0, 0, 1]);
      expectPoint3Close(resolved.viewUp, [0, 1, 0]);
      expectPoint3Close(resolved.position, [10, 20, 530]);
    });
  });

  it('normalizes a non-unit sliceBasis viewPlaneNormal/viewUp before use', () => {
    const nonUnitBasis = {
      ...createSliceBasisA(),
      viewPlaneNormal: [0, 0, 5],
      viewUp: [0, -2, 0],
    };
    const resolved = resolvePlanarICamera({
      sliceBasis: nonUnitBasis,
      camera: undefined,
      ...CANVAS_A,
    });

    expectPoint3Close(resolved.viewPlaneNormal, [0, 0, 1]);
    expectPoint3Close(resolved.viewUp, [0, -1, 0]);
    expectPoint3Close(resolved.position, [10, 20, 530]);
  });

  it('composes rotation (pre-flip frame) with a horizontal flip and an off-plane anchorWorld', () => {
    // rotation=90 about normal=[0,0,1]: rotatedViewUp = [1,0,0] (as above).
    // flipHorizontal=true (flipVertical=false) => shouldFlipNormal = true
    // (true !== false), so viewPlaneNormal negates to [0,0,-1]; viewUp is
    // NOT negated (that only happens when flipVertical is true), so
    // flippedViewUp stays [1,0,0].
    //
    // right = cross(flippedViewUp=[1,0,0], flippedNormal=[0,0,-1]) = [0,1,0]
    //
    // anchorWorld=[10,25,30] is already on the slice plane (z=30 matches
    // sliceCenterWorld.z and the plane normal is along z), so
    // effectiveAnchorWorld === anchorWorld.
    //
    // deltaWorld = sliceCenterWorld - effectiveAnchorWorld = [0,-5,0]
    // panFromAnchorWorld.x = dot(deltaWorld,right)*canvasWidth/effectiveWorldWidth
    //                      = dot([0,-5,0],[0,1,0])*200/200 = -5
    // panFromAnchorWorld.y = -dot(deltaWorld,flippedViewUp)*canvasHeight/worldHeight
    //                      = -dot([0,-5,0],[1,0,0])*100/100 = 0
    // => presentation.pan = [-5, 0]
    //
    // Because anchorCanvas is centered and scale is 1, resolving that pan
    // back into world space is the exact inverse of the above, so the
    // resolved focalPoint must land back on effectiveAnchorWorld -- this is
    // the "zoom/pan to anchor" invariant.
    const presentation = derivePlanarPresentation({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 90, flipHorizontal: true, anchorWorld: [10, 25, 30] },
      ...CANVAS_A,
    });

    expectPoint2Close(presentation.pan, [-5, 0]);

    const resolved = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: { rotation: 90, flipHorizontal: true, anchorWorld: [10, 25, 30] },
      ...CANVAS_A,
    });

    expectPoint3Close(resolved.focalPoint, [10, 25, 30]);
    expectPoint3Close(resolved.viewUp, [1, 0, 0]);
    expectPoint3Close(resolved.viewPlaneNormal, [0, 0, -1]);
    expectPoint3Close(resolved.position, [10, 25, -470]);
  });

  it('falls back to a [1,0,0] in-plane right vector when viewUp is parallel to viewPlaneNormal, and the anchor invariant still holds', () => {
    // Degenerate basis: viewUp colinear with viewPlaneNormal means
    // cross(viewUp, viewPlaneNormal) is the zero vector, which triggers the
    // hard-coded [1,0,0] fallback for `right` inside both
    // derivePlanarPresentation and getResolvedPanOffset. Since both call
    // sites recompute the same fallback, the anchor invariant (focalPoint
    // lands on the projected anchorWorld when anchorCanvas is centered and
    // scale is 1) must still hold, and no NaNs should appear.
    const degenerateBasis = {
      ...createSliceBasisA(),
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 0, 1],
    };
    const resolved = resolvePlanarICamera({
      sliceBasis: degenerateBasis,
      camera: { anchorWorld: [15, 20, 30] },
      ...CANVAS_A,
    });

    expect(Number.isFinite(resolved.focalPoint[0])).toBe(true);
    expectPoint3Close(resolved.focalPoint, [15, 20, 30]);
  });
});

describe('applyPlanarICameraToRenderer', () => {
  function createFakeRenderer() {
    const camera = {
      setParallelProjection: jest.fn(),
      setDirectionOfProjection: jest.fn(),
      setParallelScale: jest.fn(),
      setFocalPoint: jest.fn(),
      setPosition: jest.fn(),
      setViewUp: jest.fn(),
    };
    const renderer = { getActiveCamera: () => camera };

    return { renderer, camera };
  }

  it('pushes the resolved ICamera fields onto the vtk camera setters', () => {
    const { renderer, camera } = createFakeRenderer();
    const resolvedICamera = resolvePlanarICamera({
      sliceBasis: createSliceBasisA(),
      camera: undefined,
      ...CANVAS_A,
    });

    const returned = applyPlanarICameraToRenderer({
      renderer,
      activeSourceICamera: resolvedICamera,
    });

    expect(returned).toBe(resolvedICamera);
    expect(camera.setParallelProjection).toHaveBeenCalledWith(true);

    const [dopX, dopY, dopZ] = camera.setDirectionOfProjection.mock.calls[0];
    // direction of projection is the negated view plane normal [0,0,1] -> [0,0,-1]
    expect(dopX).toBeCloseTo(0, 10);
    expect(dopY).toBeCloseTo(0, 10);
    expect(dopZ).toBeCloseTo(-1, 10);

    const [pScale] = camera.setParallelScale.mock.calls[0];
    expect(pScale).toBeCloseTo(50, 10);

    const [fx, fy, fz] = camera.setFocalPoint.mock.calls[0];
    expect(fx).toBeCloseTo(10, 10);
    expect(fy).toBeCloseTo(20, 10);
    expect(fz).toBeCloseTo(30, 10);

    const [px, py, pz] = camera.setPosition.mock.calls[0];
    expect(px).toBeCloseTo(10, 10);
    expect(py).toBeCloseTo(20, 10);
    expect(pz).toBeCloseTo(530, 10);

    const [ux, uy, uz] = camera.setViewUp.mock.calls[0];
    expect(ux).toBeCloseTo(0, 10);
    expect(uy).toBeCloseTo(-1, 10);
    expect(uz).toBeCloseTo(0, 10);
  });

  const completeCamera = {
    focalPoint: [0, 0, 0],
    position: [0, 0, 1],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, 1, 0],
    parallelScale: 10,
  };

  it.each([
    ['an undefined camera', undefined],
    ['a missing focalPoint', { ...completeCamera, focalPoint: undefined }],
    ['a missing position', { ...completeCamera, position: undefined }],
    [
      'a missing viewPlaneNormal',
      { ...completeCamera, viewPlaneNormal: undefined },
    ],
    ['a missing viewUp', { ...completeCamera, viewUp: undefined }],
    [
      'a non-numeric parallelScale',
      { ...completeCamera, parallelScale: undefined },
    ],
  ])(
    'returns undefined and never touches the renderer camera for %s',
    (_label, cam) => {
      const { renderer, camera } = createFakeRenderer();

      const result = applyPlanarICameraToRenderer({
        renderer,
        activeSourceICamera: cam,
      });

      expect(result).toBeUndefined();
      expect(camera.setFocalPoint).not.toHaveBeenCalled();
      expect(camera.setPosition).not.toHaveBeenCalled();
    }
  );
});

describe('setPlanarVolumeCameraClippingRange', () => {
  it('delegates to setVtkCameraClippingRange using the renderer active camera', () => {
    const vtkCamera = {
      getParallelProjection: jest.fn(() => true),
      setClippingRange: jest.fn(),
    };
    const renderer = { getActiveCamera: () => vtkCamera };

    setPlanarVolumeCameraClippingRange(renderer);

    expect(vtkCamera.setClippingRange).toHaveBeenCalledTimes(1);
    const [near, far] = vtkCamera.setClippingRange.mock.calls[0];

    expect(near).toBeCloseTo(-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, 5);
    expect(far).toBeCloseTo(RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, 5);
  });
});

describe('createPlanarPresentationScaleMatrix / applyPlanarICameraToActor', () => {
  it('returns an identity matrix when presentationScale is uniform (ratio 1)', () => {
    const matrix = createPlanarPresentationScaleMatrix({
      focalPoint: [13.5, 29, 48],
      presentationScale: [1, 1],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    });

    expect(Array.from(matrix)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
  });

  it('returns an identity matrix when the camera is missing required fields', () => {
    expect(Array.from(createPlanarPresentationScaleMatrix(undefined))).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    expect(
      Array.from(
        createPlanarPresentationScaleMatrix({
          presentationScale: [2, 1],
          viewPlaneNormal: [0, 0, -1],
          // viewUp missing
        })
      )
    ).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('builds a non-uniform in-plane scale matrix for an anisotropic presentationScale', () => {
    // presentationScale [2,1] -> ratioX = 2/1 = 2, ratioDelta = 1.
    // right = cross(viewUp=[0,-1,0], viewPlaneNormal=[0,0,-1]) = [1,0,0]
    // (rx,ry,rz) = (1,0,0), so the linear part is a pure scale-by-2 along x:
    //   linear = [2,0,0, 0,1,0, 0,0,1]
    // transformedCenter = linear * focalPoint(13.5,29,48) = (27,29,48)
    // translation = focalPoint - transformedCenter = (-13.5, 0, 0)
    const matrix = createPlanarPresentationScaleMatrix({
      focalPoint: [13.5, 29, 48],
      presentationScale: [2, 1],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    });

    expect(matrix[0]).toBeCloseTo(2, 8);
    expect(matrix[1]).toBeCloseTo(0, 8);
    expect(matrix[2]).toBeCloseTo(0, 8);
    expect(matrix[4]).toBeCloseTo(0, 8);
    expect(matrix[5]).toBeCloseTo(1, 8);
    expect(matrix[6]).toBeCloseTo(0, 8);
    expect(matrix[8]).toBeCloseTo(0, 8);
    expect(matrix[9]).toBeCloseTo(0, 8);
    expect(matrix[10]).toBeCloseTo(1, 8);
    expect(matrix[12]).toBeCloseTo(-13.5, 8);
    expect(matrix[13]).toBeCloseTo(0, 8);
    expect(matrix[14]).toBeCloseTo(0, 8);
    expect(matrix[15]).toBeCloseTo(1, 8);
  });

  it('falls back to a [1,0,0] right vector when viewUp is parallel to viewPlaneNormal', () => {
    // Degenerate axis: cross(viewUp, viewPlaneNormal) is zero when they are
    // colinear, so getPlanarICameraRight falls back to [1,0,0]. With
    // presentationScale [2,1] the resulting linear part is still a pure
    // scale-by-2 along x (same shape as the non-degenerate case above),
    // computed around focalPoint (5,5,5):
    //   transformedCenter = (10,5,5); translation = (5-10,0,0) = (-5,0,0)
    const matrix = createPlanarPresentationScaleMatrix({
      focalPoint: [5, 5, 5],
      presentationScale: [2, 1],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 0, 1],
    });

    expect(matrix[0]).toBeCloseTo(2, 8);
    expect(matrix[5]).toBeCloseTo(1, 8);
    expect(matrix[10]).toBeCloseTo(1, 8);
    expect(matrix[12]).toBeCloseTo(-5, 8);
    expect(matrix[13]).toBeCloseTo(0, 8);
    expect(matrix[14]).toBeCloseTo(0, 8);
  });

  it('applies the computed matrix to an actor exposing setUserMatrix', () => {
    const actor = { setUserMatrix: jest.fn() };
    const activeSourceICamera = {
      focalPoint: [13.5, 29, 48],
      presentationScale: [2, 1],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    };

    applyPlanarICameraToActor({ actor, activeSourceICamera });

    expect(actor.setUserMatrix).toHaveBeenCalledTimes(1);
    const [appliedMatrix] = actor.setUserMatrix.mock.calls[0];

    expect(appliedMatrix[0]).toBeCloseTo(2, 8);
    expect(appliedMatrix[12]).toBeCloseTo(-13.5, 8);
  });

  it('does not throw when the actor has no setUserMatrix', () => {
    expect(() =>
      applyPlanarICameraToActor({ actor: {}, activeSourceICamera: undefined })
    ).not.toThrow();
    expect(() =>
      applyPlanarICameraToActor({
        actor: undefined,
        activeSourceICamera: undefined,
      })
    ).not.toThrow();
  });
});

describe('updatePlanarVolumeClippingPlanes', () => {
  function createFakeMapper(initialPlanes = []) {
    let planes = [...initialPlanes];

    return {
      getClippingPlanes: jest.fn(() => planes),
      addClippingPlane: jest.fn((plane) => {
        planes = [...planes, plane];
      }),
    };
  }

  it('creates two clipping planes when the mapper has fewer than two', () => {
    const mapper = createFakeMapper([]);
    const camera = { focalPoint: [10, 20, 30], viewPlaneNormal: [0, 0, 1] };

    updatePlanarVolumeClippingPlanes({ camera, mapper, slabThickness: 5 });

    expect(mapper.addClippingPlane).toHaveBeenCalledTimes(2);

    const planes = mapper.getClippingPlanes();

    expect(planes).toHaveLength(2);
    // plane 0: normal = viewPlaneNormal, origin = focalPoint - normal*slabThickness
    expectPoint3Close(planes[0].getNormal(), [0, 0, 1]);
    expectPoint3Close(planes[0].getOrigin(), [10, 20, 25]);
    // plane 1: normal = -viewPlaneNormal, origin = focalPoint + normal*slabThickness
    expectPoint3Close(planes[1].getNormal(), [0, 0, -1]);
    expectPoint3Close(planes[1].getOrigin(), [10, 20, 35]);
  });

  it('reuses existing clipping planes instead of creating new ones', () => {
    const existingPlanes = [
      { setNormal: jest.fn(), setOrigin: jest.fn() },
      { setNormal: jest.fn(), setOrigin: jest.fn() },
    ];
    const mapper = createFakeMapper(existingPlanes);
    const camera = { focalPoint: [1, 2, 3], viewPlaneNormal: [1, 0, 0] };

    updatePlanarVolumeClippingPlanes({ camera, mapper, slabThickness: 2 });

    expect(mapper.addClippingPlane).not.toHaveBeenCalled();
    expect(existingPlanes[0].setNormal).toHaveBeenCalledWith(1, 0, 0);
    expect(existingPlanes[0].setOrigin).toHaveBeenCalledWith(-1, 2, 3);
    expect(existingPlanes[1].setNormal).toHaveBeenCalledWith(-1, -0, -0);
    expect(existingPlanes[1].setOrigin).toHaveBeenCalledWith(3, 2, 3);
  });

  it('defaults slabThickness to RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS', () => {
    const existingPlanes = [
      { setNormal: jest.fn(), setOrigin: jest.fn() },
      { setNormal: jest.fn(), setOrigin: jest.fn() },
    ];
    const mapper = createFakeMapper(existingPlanes);
    const camera = { focalPoint: [0, 0, 0], viewPlaneNormal: [0, 1, 0] };

    updatePlanarVolumeClippingPlanes({ camera, mapper });

    const expectedOffset = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
    const [ox, oy, oz] = existingPlanes[0].setOrigin.mock.calls[0];

    expect(ox).toBeCloseTo(0, 10);
    expect(oy).toBeCloseTo(-expectedOffset, 10);
    expect(oz).toBeCloseTo(0, 10);
  });
});

describe('PlanarVolumeResolvedView (parity with PlanarStackResolvedView)', () => {
  // Same volume fixture used by planarComputedCamera.jest.js. dimensions
  // [8,10,12], identity direction, spacing [1,2,3]; indexToWorld([i,j,k]) =
  // [10+i, 20+j*2, 30+k*3]; extentToBounds -> x:[10,17] y:[20,38] z:[30,63].
  function createImageVolume() {
    return {
      dimensions: [8, 10, 12],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [1, 2, 3],
      metadata: {
        FrameOfReferenceUID: 'volume-for',
      },
      imageData: {
        getDimensions: () => [8, 10, 12],
        getDirection: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
        getExtent: () => [0, 7, 0, 9, 0, 11],
        extentToBounds: () => [10, 17, 20, 38, 30, 63],
        indexToWorld: ([i, j, k]) => [10 + i, 20 + j * 2, 30 + k * 3],
      },
    };
  }

  function createVolumeCamera(viewStateOverrides = {}) {
    return new PlanarVolumeResolvedView({
      viewState: {
        orientation: OrientationAxis.AXIAL,
        ...viewStateOverrides,
      },
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 5,
      frameOfReferenceUID: 'volume-for',
      imageVolume: createImageVolume(),
      maxImageIdIndex: 11,
      usePixelGridCenter: false,
    });
  }

  // Geometric derivation for the AXIAL slice basis of this volume on a
  // 256x256 canvas (see also planarSliceBasis.ts):
  //   MPR AXIAL viewPlaneNormal=[0,0,-1], viewUp=[0,-1,0].
  //   sliceAxis (max |dot(axis,normal)|) is the k-axis, exactly aligned, so
  //   the center ijk snaps to [ (8-1)/2, (10-1)/2, floor(12/2) ] = [3.5,4.5,6]
  //   -> indexToWorld -> center = [13.5, 29, 48].
  //   Volume corners project onto normal=[0,0,-1] as -z, z in [30,63], so
  //   min=-63, max=-30 (range 33). spacingInNormalDirection = |spacing.z| = 3.
  //   No explicit slice/imageIdIndex was requested, so sliceCenterWorld stays
  //   at the volume center: [13.5, 29, 48]. cameraDistance = max(33,3,1)=33.
  //   getOrthogonalVolumeSliceGeometry for AXIAL picks columns from the row
  //   axis (dim 8, spacing 1) and rows from the column axis (dim 10, spacing 2):
  //     sliceWidthWorld=8, sliceHeightWorld=20
  //     fitParallelScale = max(rows*rowSpacing, cols*colSpacing/aspect)*0.5
  //                      = max(20, 8)*0.5 = 10   (square canvas, aspect=1)
  const EXPECTED_FOCAL_POINT = [13.5, 29, 48];
  const EXPECTED_POSITION = [13.5, 29, 15]; // focal + [0,0,-1]*33
  const EXPECTED_VIEW_UP = [0, -1, 0];
  const EXPECTED_VIEW_PLANE_NORMAL = [0, 0, -1];
  const EXPECTED_PARALLEL_SCALE = 10;

  it('round-trips canvas -> world -> canvas for center and off-center points', () => {
    const camera = createVolumeCamera();

    for (const canvasPoint of [
      [128, 128],
      [47, 123],
      [0, 0],
      [256, 256],
    ]) {
      const worldPoint = camera.canvasToWorld(canvasPoint);

      expectPoint2Close(camera.worldToCanvas(worldPoint), canvasPoint);
    }
  });

  it('resolves toICamera consistently with a direct resolvePlanarICamera call', () => {
    const camera = createVolumeCamera();
    const resolved = camera.toICamera();

    expectPoint3Close(resolved.focalPoint, EXPECTED_FOCAL_POINT);
    expectPoint3Close(resolved.position, EXPECTED_POSITION);
    expectPoint3Close(resolved.viewUp, EXPECTED_VIEW_UP);
    expectPoint3Close(resolved.viewPlaneNormal, EXPECTED_VIEW_PLANE_NORMAL);
    expect(resolved.parallelScale).toBeCloseTo(EXPECTED_PARALLEL_SCALE, 5);

    const directlyResolved = resolvePlanarICamera({
      sliceBasis: camera.getSliceBasis(),
      camera: camera.state.viewState,
      canvasWidth: camera.state.canvasWidth,
      canvasHeight: camera.state.canvasHeight,
    });

    expectPoint3Close(resolved.focalPoint, directlyResolved.focalPoint);
    expectPoint3Close(resolved.position, directlyResolved.position);
    expectPoint3Close(resolved.viewUp, directlyResolved.viewUp);
    expect(resolved.parallelScale).toBeCloseTo(
      directlyResolved.parallelScale,
      10
    );
  });

  it('withZoom(2) halves the world-per-pixel footprint', () => {
    const camera = createVolumeCamera();
    const beforeA = camera.canvasToWorld([118, 128]);
    const beforeB = camera.canvasToWorld([138, 128]);
    const beforeDistance = distance3(beforeA, beforeB);

    const zoomed = camera.withZoom(2);
    const afterA = zoomed.canvasToWorld([118, 128]);
    const afterB = zoomed.canvasToWorld([138, 128]);
    const afterDistance = distance3(afterA, afterB);

    expect(zoomed.zoom).toBeCloseTo(2, 5);
    expect(afterDistance).toBeCloseTo(beforeDistance / 2, 5);
  });

  it('keeps the zoom anchor stable when zooming at a canvas point', () => {
    const camera = createVolumeCamera();
    const anchorCanvasPoint = [96, 144];
    const anchorWorldPoint = camera.canvasToWorld(anchorCanvasPoint);
    const zoomedCamera = camera.withZoom(2, anchorCanvasPoint);

    expectPoint3Close(
      zoomedCamera.canvasToWorld(anchorCanvasPoint),
      anchorWorldPoint
    );
    expect(zoomedCamera.zoom).toBeCloseTo(2, 5);
  });

  it('updates pan-derived transforms without recomputing ad hoc viewport math', () => {
    const camera = createVolumeCamera();
    const centerWorldPoint = camera.canvasToWorld([128, 128]);
    const pannedCamera = camera.withPan([24, -18]);

    expectPoint2Close(pannedCamera.pan, [24, -18]);
    // Panning is a pure canvas-space translation of the focal point: the
    // point that used to render at [128,128] now renders at
    // [128+24, 128-18] = [152, 110], matching the stack-camera recipe.
    expectPoint2Close(pannedCamera.worldToCanvas(centerWorldPoint), [152, 110]);
  });

  it('mirrors transforms when flipped horizontally or vertically', () => {
    const camera = createVolumeCamera();
    const referencePoint = [196, 84];
    const worldPoint = camera.canvasToWorld(referencePoint);
    const horizontalFlip = camera.flipHorizontal();
    const verticalFlip = camera.flipVertical();

    // Flips mirror around the canvas center (256/2 = 128).
    expectPoint2Close(horizontalFlip.worldToCanvas(worldPoint), [60, 84]);
    expectPoint2Close(verticalFlip.worldToCanvas(worldPoint), [196, 172]);
    expect(horizontalFlip.state.viewState.flipHorizontal).toBe(true);
    expect(verticalFlip.state.viewState.flipVertical).toBe(true);
  });

  it('exposes the volume frame of reference', () => {
    const camera = createVolumeCamera();

    expect(camera.getFrameOfReferenceUID()).toBe('volume-for');
  });

  it('indexToWorld returns undefined when the volume has no imageData', () => {
    const camera = new PlanarVolumeResolvedView({
      viewState: { orientation: OrientationAxis.AXIAL },
      canvasHeight: 256,
      canvasWidth: 256,
      currentImageIdIndex: 0,
      frameOfReferenceUID: 'volume-for',
      imageVolume: {
        dimensions: [1, 1, 1],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        spacing: [1, 1, 1],
      },
      maxImageIdIndex: 0,
      usePixelGridCenter: false,
    });

    expect(camera.indexToWorld([0, 0, 0])).toBeUndefined();
  });
});
