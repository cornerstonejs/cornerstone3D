import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as cornerstone3D from '../src/index';
import VolumeViewport3DLegacyAdapter from '../src/RenderingEngine/GenericViewport/Volume3D/VolumeViewport3DLegacyAdapter';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';

const { utilities, Enums, CONSTANTS } = cornerstone3D;
const { Events, OrientationAxis } = Enums;

const WIDTH = 400;
const HEIGHT = 300;

/**
 * Makes a 3D legacy adapter on a stand-in rendering engine with a vtk.js
 * renderer. Actors, bounds and the camera need no WebGL.
 */
function createAdapter(defaultOptions = {}) {
  const element = document.createElement('div');
  const canvas = document.createElement('canvas');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  document.body.appendChild(element);

  const renderer = vtkRenderer.newInstance();
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new VolumeViewport3DLegacyAdapter({
    id: 'volume3D',
    element,
    renderingEngineId: renderingEngine.id,
    canvas,
    sWidth: WIDTH,
    sHeight: HEIGHT,
    defaultOptions,
  });

  return { renderingEngine, renderer, viewport };
}

/** Expects each coordinate close to the expected one. */
function expectClose(actual, expected) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], 6)
  );
}

/** A vtk.js sphere actor entry. */
function createSphere(uid, center = [0, 0, 0], radius = 100) {
  const source = vtkSphereSource.newInstance({
    center,
    radius,
    phiResolution: 10,
    thetaResolution: 10,
  });
  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  mapper.setInputConnection(source.getOutputPort());
  actor.setMapper(mapper);

  return { uid, actor };
}

/**
 * The parallel scale of the legacy fit of bounds seen along a view plane
 * normal with a view up: half the extent along the view up, or half the
 * extent along the view right scaled to the canvas when that is wider.
 */
function legacyFitParallelScale(bounds, viewUp, viewRight) {
  const corners = [];

  for (const x of [bounds[0], bounds[1]]) {
    for (const y of [bounds[2], bounds[3]]) {
      for (const z of [bounds[4], bounds[5]]) {
        corners.push([x, y, z]);
      }
    }
  }

  const extent = (axis) => {
    const values = corners.map(
      (corner) =>
        corner[0] * axis[0] + corner[1] * axis[1] + corner[2] * axis[2]
    );

    return Math.max(...values) - Math.min(...values);
  };
  const heightWorld = extent(viewUp);
  const widthWorld = extent(viewRight);
  const scaleFactor = widthWorld / heightWorld / (WIDTH / HEIGHT);

  return scaleFactor < 1 ? heightWorld / 2 : (heightWorld * scaleFactor) / 2;
}

describe('3D legacy adapter', () => {
  let renderingEngine;
  let renderer;
  let viewport;

  beforeEach(() => {
    ({ renderingEngine, renderer, viewport } = createAdapter({
      orientation: OrientationAxis.SAGITTAL,
    }));
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(renderingEngine.id);
    document.body.innerHTML = '';
  });

  it('looks along the orientation of its options before it shows anything, as the legacy viewport', () => {
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    expectClose(
      viewPlaneNormal,
      CONSTANTS.MPR_CAMERA_VALUES.sagittal.viewPlaneNormal
    );
    expectClose(viewUp, CONSTANTS.MPR_CAMERA_VALUES.sagittal.viewUp);
  });

  it('adds, lists, finds and removes actors, with ACTORS_CHANGED', () => {
    const events = [];

    viewport.element.addEventListener(Events.ACTORS_CHANGED, (evt) => {
      events.push({
        added: evt.detail.addedActors.map(({ uid }) => uid),
        removed: evt.detail.removedActors.map(({ uid }) => uid),
        current: evt.detail.currentActors.map(({ uid }) => uid),
      });
    });

    const first = createSphere('first');
    const second = createSphere('second', [50, 0, 0]);

    viewport.addActor(first);
    viewport.addActor(second);
    viewport.addActor(createSphere('first'));

    expect(viewport.getActors().map(({ uid }) => uid)).toEqual([
      'first',
      'second',
    ]);
    expect(viewport.getActor('second').actor).toBe(second.actor);
    expect(renderer.getActors()).toEqual([first.actor, second.actor]);
    expect(viewport.getImageActor()).toBeNull();

    viewport.removeActors(['first', 'unknown']);

    expect(viewport.getActors().map(({ uid }) => uid)).toEqual(['second']);
    expect(renderer.getActors()).toEqual([second.actor]);
    expect(events).toEqual([
      { added: ['first'], removed: [], current: ['first'] },
      { added: ['second'], removed: [], current: ['first', 'second'] },
      { added: [], removed: ['first'], current: ['second'] },
    ]);
    expect(() => viewport.addActor({ uid: 'noActor' })).toThrow();
  });

  it('replaces what it shows on setActors and fits the actors as the legacy viewport', () => {
    viewport.addActor(createSphere('old'));
    viewport.setActors([createSphere('sphere')]);

    const camera = viewport.getCamera();
    const bounds = renderer.computeVisiblePropBounds();
    const viewRight = [
      camera.viewUp[1] * camera.viewPlaneNormal[2] -
        camera.viewUp[2] * camera.viewPlaneNormal[1],
      camera.viewUp[2] * camera.viewPlaneNormal[0] -
        camera.viewUp[0] * camera.viewPlaneNormal[2],
      camera.viewUp[0] * camera.viewPlaneNormal[1] -
        camera.viewUp[1] * camera.viewPlaneNormal[0],
    ];
    const center = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2,
    ];

    expect(viewport.getActors().map(({ uid }) => uid)).toEqual(['sphere']);
    expect(camera.parallelScale).toBeCloseTo(
      legacyFitParallelScale(bounds, camera.viewUp, viewRight),
      6
    );
    expectClose(camera.focalPoint, center);
    expectClose(
      camera.viewPlaneNormal,
      CONSTANTS.MPR_CAMERA_VALUES.sagittal.viewPlaneNormal
    );
    expect(viewport.getZoom()).toBe(1);
  });

  it('keeps the zoom on resetCamera with resetZoom false, and stores the initial camera', () => {
    viewport.setActors([createSphere('sphere')]);

    const fitScale = viewport.getCamera().parallelScale;

    viewport.setZoom(2);
    expect(viewport.getCamera().parallelScale).toBeCloseTo(fitScale / 2, 6);
    expect(viewport.getZoom()).toBeCloseTo(2, 6);

    viewport.resetCamera({ resetZoom: false });
    expect(viewport.getCamera().parallelScale).toBeCloseTo(fitScale / 2, 6);
    expect(viewport.getZoom()).toBeCloseTo(1, 6);

    viewport.resetCamera();
    expect(viewport.getCamera().parallelScale).toBeCloseTo(fitScale, 6);

    viewport.setZoom(4, true);
    expect(viewport.getZoom()).toBeCloseTo(1, 6);
    expect(viewport.getCamera().parallelScale).toBeCloseTo(fitScale / 4, 6);
  });

  it('turns to an orientation on setOrientation and fits again', () => {
    viewport.setActors([createSphere('sphere')]);
    viewport.setZoom(3);
    viewport.setOrientation(OrientationAxis.AXIAL);

    const camera = viewport.getCamera();

    expectClose(
      camera.viewPlaneNormal,
      CONSTANTS.MPR_CAMERA_VALUES.axial.viewPlaneNormal
    );
    expectClose(camera.viewUp, CONSTANTS.MPR_CAMERA_VALUES.axial.viewUp);
    expect(viewport.getZoom()).toBeCloseTo(1, 6);
  });

  it('moves the focal point along the normal on setViewReference, as the legacy viewport', () => {
    viewport.setActors([createSphere('sphere')]);

    const { focalPoint, position, viewPlaneNormal } = viewport.getCamera();

    viewport.setViewReference({
      cameraFocalPoint: [
        focalPoint[0] + 10 * viewPlaneNormal[0] + 5,
        focalPoint[1] + 10 * viewPlaneNormal[1] + 5,
        focalPoint[2] + 10 * viewPlaneNormal[2] + 5,
      ],
      viewPlaneNormal,
    });

    const camera = viewport.getCamera();

    const alongNormal = 10 + 5 * viewPlaneNormal.reduce((sum, v) => sum + v, 0);

    expectClose(
      camera.focalPoint,
      focalPoint.map((v, index) => v + alongNormal * viewPlaneNormal[index])
    );
    expectClose(
      camera.position,
      position.map((v, index) => v + alongNormal * viewPlaneNormal[index])
    );
    expect(() =>
      viewport.setViewReference({
        FrameOfReferenceUID: 'another',
        cameraFocalPoint: focalPoint,
      })
    ).toThrow();
  });

  it('turns the camera to the normal of a view reference', () => {
    viewport.setActors([createSphere('sphere')]);

    const { viewPlaneNormal, viewUp } = CONSTANTS.MPR_CAMERA_VALUES.coronal;

    viewport.setViewReference({ viewPlaneNormal, viewUp });

    expectClose(viewport.getCamera().viewPlaneNormal, viewPlaneNormal);
    expectClose(viewport.getCamera().viewUp, viewUp);
  });

  it('gives the options, the state and the slice answers of the legacy 3D viewport', () => {
    expect(viewport.isDisabled).toBe(false);
    expect(viewport.options).toEqual({
      orientation: OrientationAxis.SAGITTAL,
    });
    expect(viewport.options).not.toBe(viewport.defaultOptions);

    viewport.setOptions({ orientation: OrientationAxis.AXIAL });
    expect(viewport.options).toEqual({ orientation: OrientationAxis.AXIAL });

    viewport.reset();
    expect(viewport.options).toEqual(viewport.defaultOptions);

    expect(viewport.getNumberOfSlices()).toBe(1);
    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    expect(viewport.getCurrentImageId()).toBeNull();
    expect(viewport.getSliceIndex()).toBeNull();
    expect(viewport.isInAcquisitionPlane()).toBe(false);
    expect(viewport.getRotation()).toBe(0);
    expect(viewport.isOrientationChangeable()).toBe(true);
    expect(viewport.useCPURendering).toBe(false);
    expect(viewport.getSlabThickness()).toBe(
      CONSTANTS.RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    );
    expect(viewport.getAllVolumeIds()).toEqual([]);
    expect(viewport.hasImageURI('anything')).toBe(false);
    expect(viewport.getIntensityFromWorld([0, 0, 0])).toBeUndefined();
  });

  it('gives the bounds of what it shows, as the legacy viewport', () => {
    viewport.setActors([createSphere('sphere', [10, 20, 30], 5)]);

    expect(viewport.getBounds()).toEqual(renderer.computeVisiblePropBounds());
    expect(viewport.getBounds()[0]).toBeLessThan(10);
    expect(viewport.getBounds()[1]).toBeGreaterThan(10);
  });

  it('keeps default properties as the legacy viewport', () => {
    viewport.setDefaultProperties({ invert: true });
    viewport.setDefaultProperties({ invert: false }, 'volume-a');

    expect(viewport.getDefaultProperties()).toEqual({ invert: true });
    expect(viewport.getDefaultProperties('volume-a')).toEqual({
      invert: false,
    });
    expect(viewport.getDefaultProperties('volume-b')).toEqual({
      invert: true,
    });

    viewport.clearDefaultProperties('volume-a');
    expect(viewport.getDefaultProperties('volume-a')).toEqual({
      invert: true,
    });

    viewport.clearDefaultProperties();
    expect(viewport.getDefaultProperties()).toEqual({});
  });
});
