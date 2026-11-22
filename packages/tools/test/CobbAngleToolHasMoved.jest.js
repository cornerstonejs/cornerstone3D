jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: () => ({ renderingEngine: {}, viewport: {} }),
}));
jest.mock('../src/stateManagement/annotation/annotationState', () => ({
  ...jest.requireActual('../src/stateManagement/annotation/annotationState'),
  addAnnotation: jest.fn(),
  getAnnotations: jest.fn(),
  removeAnnotation: jest.fn(),
}));
jest.mock('../src/stateManagement/annotation/helpers/state', () => ({
  ...jest.requireActual('../src/stateManagement/annotation/helpers/state'),
  triggerAnnotationCompleted: jest.fn(),
  triggerAnnotationModified: jest.fn(),
}));
jest.mock('../src/utilities/viewportFilters', () => ({
  getViewportIdsWithToolToRender: () => [],
}));
jest.mock('../src/utilities/triggerAnnotationRenderForViewportIds', () =>
  jest.fn()
);
jest.mock('../src/stateManagement/annotation/annotationVisibility', () => ({
  ...jest.requireActual(
    '../src/stateManagement/annotation/annotationVisibility'
  ),
  isAnnotationVisible: () => true,
}));
jest.mock('../src/drawingSvg', () => ({
  ...jest.requireActual('../src/drawingSvg'),
  drawHandles: jest.fn(),
  drawLine: jest.fn(),
  drawTextBox: jest.fn(),
}));
jest.mock('../src/cursors/elementCursor', () => ({
  resetElementCursor: jest.fn(),
  hideElementCursor: jest.fn(),
}));

import { Events } from '../src/enums';
import CobbAngleTool from '../src/tools/annotation/CobbAngleTool';
import { state } from '../src/store/state';
import {
  getAnnotations,
  removeAnnotation,
} from '../src/stateManagement/annotation/annotationState';
import { triggerAnnotationCompleted } from '../src/stateManagement/annotation/helpers/state';

// A point in patient coordinates (mm) and the two in-plane directions
const PLANES = {
  axial: { origin: [-120.5, -88.25, 37.5], u: [1, 0, 0], v: [0, 1, 0] },
  sagittal: { origin: [12.75, -88.25, 37.5], u: [0, 1, 0], v: [0, 0, 1] },
  coronal: { origin: [-120.5, 20.25, 37.5], u: [1, 0, 0], v: [0, 0, 1] },
};

// One move along each world axis, with z tested on both planes where it is
// in-plane
const AXIS_MOVES = [
  ['x', 'axial', [23.4375, 0]],
  ['y', 'axial', [0, 23.4375]],
  ['z', 'sagittal', [0, 23.4375]],
  ['z', 'coronal', [0, 23.4375]],
];

const toWorld = ({ origin, u, v }, [a, b]) =>
  origin.map((value, i) => value + a * u[i] + b * v[i]);

describe('CobbAngleTool click handling while drawing', () => {
  let tool;
  let element;
  let annotation;

  const createEvent = (type, world) =>
    new CustomEvent(type, {
      detail: { element, currentPoints: { world: [...world] } },
    });

  // Events go through the listeners that the tool binds on the element
  const send = (type, world) => element.dispatchEvent(createEvent(type, world));
  const start = (world) =>
    tool.addNewAnnotation(createEvent(Events.MOUSE_DOWN_ACTIVATE, world));
  const release = (world) => send(Events.MOUSE_UP, world);
  const move = (world) => send(Events.MOUSE_MOVE, world);
  const click = (world) => {
    send(Events.MOUSE_DOWN, world);
    send(Events.MOUSE_CLICK, world);
  };
  const tapEvents = (world) => {
    send(Events.TOUCH_START, world);
    send(Events.TOUCH_END, world);
    send(Events.TOUCH_TAP, world);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    element = document.createElement('div');
    tool = new CobbAngleTool();
    tool.createAnnotation = jest.fn((evt, points) => {
      annotation = {
        annotationUID: 'cobb',
        data: { handles: { points }, cachedStats: {} },
      };
      return annotation;
    });
    tool.createMemo = jest.fn();
    tool.doneEditMemo = jest.fn();
  });

  afterEach(() => {
    tool._deactivateDraw(element);
  });

  const expectCompleted = (expected) => {
    expect(annotation.data.handles.points).toEqual(expected);
    expect(triggerAnnotationCompleted).toHaveBeenCalledTimes(1);
    expect(tool.editData).toBeNull();
    expect(tool.angleStartedNotYetCompleted).toBe(false);
    expect(state.isInteractingWithTool).toBe(false);
  };

  describe.each(Object.entries(PLANES))('%s plane', (_name, plane) => {
    const a = toWorld(plane, [0, 0]);
    const b = toWorld(plane, [31.25, 7.8125]);
    const c = toWorld(plane, [3.90625, 46.875]);
    const d = toWorld(plane, [39.0625, 54.6875]);

    it.each([
      ['a click', click],
      ['tap events', tapEvents],
    ])(
      'keeps the first segment open on %s on its start point',
      (_style, press) => {
        start(a);
        release(a);
        press(a);

        expect(tool.editData.handleIndex).toBe(1);

        press(b);
        press(c);
        press(d);

        expectCompleted([a, b, c, d]);
      }
    );

    it.each([
      ['a click', click],
      ['tap events', tapEvents],
    ])(
      'keeps the second segment open on %s on its start point',
      (_style, press) => {
        start(a);
        release(a);
        press(b);
        press(c);
        press(c);

        expect(triggerAnnotationCompleted).not.toHaveBeenCalled();
        expect(tool.editData.handleIndex).toBe(3);
        expect(state.isInteractingWithTool).toBe(true);

        press(d);

        expectCompleted([a, b, c, d]);
      }
    );

    it('keeps a segment open when the mouse returns to its start point before the click', () => {
      start(a);
      release(a);
      move(b);
      move(a);
      click(a);

      expect(tool.editData.handleIndex).toBe(1);
    });

    it('can be completed by dragging after a click on each start point', () => {
      start(a);
      release(a);
      click(a);
      send(Events.MOUSE_DOWN, a);
      send(Events.MOUSE_DRAG, b);
      release(b);
      click(c);
      click(c);
      send(Events.MOUSE_DOWN, c);
      send(Events.MOUSE_DRAG, d);
      release(d);

      expectCompleted([a, b, c, d]);
    });

    it('can be cancelled after a click on the first start point', () => {
      start(a);
      release(a);
      click(a);

      tool.cancel(element);

      expect(removeAnnotation).toHaveBeenCalledWith('cobb');
      expect(tool.editData).toBeNull();
      expect(state.isInteractingWithTool).toBe(false);
    });

    it('can be cancelled after a click on the second start point', () => {
      start(a);
      release(a);
      click(b);
      click(c);
      click(c);

      expect(tool.cancel(element)).toBe('cobb');
      expect(removeAnnotation).not.toHaveBeenCalled();
      expect(annotation.data.handles.points).toEqual([a, b, c, c]);
      expect(tool.editData).toBeNull();
      expect(tool.angleStartedNotYetCompleted).toBe(false);
      expect(state.isInteractingWithTool).toBe(false);
    });
  });

  describe.each(AXIS_MOVES)(
    'segments along %s (%s plane)',
    (_axis, name, offset) => {
      const a = toWorld(PLANES[name], [0, 0]);
      const b = toWorld(PLANES[name], offset);
      const c = toWorld(PLANES[name], [5.859375, 50.78125]);
      const d = toWorld(PLANES[name], [
        5.859375 + offset[0],
        50.78125 + offset[1],
      ]);

      it('completes with clicks alone', () => {
        start(a);
        release(a);
        click(b);
        click(c);
        click(d);

        expectCompleted([a, b, c, d]);
      });

      it('completes with click-move-click', () => {
        start(a);
        release(a);
        move(b);
        click(b);
        move(c);
        click(c);
        move(d);
        click(d);

        expectCompleted([a, b, c, d]);
      });
    }
  );

  it('completes with press-drag-release', () => {
    const [a, b, c, d] = [
      [0, 0],
      [0, 20],
      [10, 40],
      [10, 60],
    ].map((point) => toWorld(PLANES.sagittal, point));

    start(a);
    send(Events.MOUSE_DRAG, b);
    release(b);
    send(Events.MOUSE_DOWN, c);
    send(Events.MOUSE_DRAG, d);
    release(d);

    expectCompleted([a, b, c, d]);
  });

  it.each([
    ['one click', 1],
    ['a repeated click', 2],
  ])(
    'refreshes the angle for a last click without a move, after %s on the second start point and a render',
    (_name, clicks) => {
      const [a, b, c, d] = [
        [0, 0],
        [40, 0],
        [0, 50],
        [30, 80],
      ].map((point) => toWorld(PLANES.axial, point));
      const viewport = {
        element,
        getRenderingEngine: () => ({}),
        worldToCanvas: ([x, y]) => [x, y],
        canvasToWorld: ([x, y]) => [x, y, a[2]],
      };
      tool.filterInteractableAnnotationsForElement = (_, list) => list;
      tool.getTargetId = () => 'target';
      tool.getAnnotationStyle = () => ({});
      tool.renderLinkedTextBoxAnnotation = jest.fn(() => true);
      const render = () => tool.renderAnnotation({ viewport }, {});

      start(a);
      release(a);
      getAnnotations.mockReturnValue([annotation]);
      click(b);
      for (let i = 0; i < clicks; i++) {
        click(c);
      }
      render(); // caches NaN, as the second segment has no length yet
      click(d);
      render();

      expectCompleted([a, b, c, d]);
      expect(annotation.data.cachedStats.target.angle).toBeCloseTo(45);
      expect(tool.renderLinkedTextBoxAnnotation).toHaveBeenLastCalledWith(
        expect.objectContaining({ textLines: ['45.00 °'] })
      );
    }
  );

  it.each([
    ['axial, y only', [30, 80, -12.5], [30, 30, -12.5]],
    ['sagittal, z only', [20, 20, -50], [20, 20, 10]],
    ['coronal, z only', [-15, -15, 40], [-15, -15, 90]],
  ])(
    'commits a moved segment whose end y equals its start x (%s)',
    (_name, from, to) => {
      start(from);
      release(from);
      click(to);

      expect(tool.editData.handleIndex).toBe(2);

      click(from);
      click(to);

      expectCompleted([from, to, from, to]);
    }
  );
});
