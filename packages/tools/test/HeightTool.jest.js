import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getEnabledElement, utilities } from '@cornerstonejs/core';
import HeightTool from '../src/tools/annotation/HeightTool';
import { Events } from '../src/enums';
import { addTool, removeTool } from '../src/store/addTool';
import * as ToolGroupManager from '../src/store/ToolGroupManager';
import {
  addAnnotation,
  getAnnotation,
  removeAllAnnotations,
} from '../src/stateManagement/annotation/annotationState';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: jest.fn(),
}));
jest.mock('../src/drawingSvg', () => ({
  drawHandles: jest.fn(),
  drawHeight: jest.fn(),
}));
jest.mock('../src/utilities/viewportFilters', () => ({
  getViewportIdsWithToolToRender: () => [],
}));
jest.mock('../src/cursors/elementCursor', () => ({
  resetElementCursor: jest.fn(),
  hideElementCursor: jest.fn(),
}));

const FrameOfReferenceUID = 'height-tool-frame-of-reference';
const viewPlaneNormal = [0, 0, 1];
const targetId = 'imageId:height-tool-test';
const dimensions = [64, 48, 1];
const spacing = [0.7, 0.8, 2.5];
const imageData = vtkImageData.newInstance();
imageData.setDimensions(dimensions);
imageData.setOrigin([-120.5, 35.25, -402.75]);
imageData.setSpacing(spacing);
const toWorld = (index) => [...imageData.indexToWorld(index)];

// Handle positions in index space
const start = [10, 10, 0];
const insideEnd = [10, 30, 0];
const outsideEnd = [10, 50, 0];
const inside = [start, insideEnd];
const outside = [start, outsideEnd];

let tool;
let element;
let enabledElement;

// The default configuration when none is given
function setUp(configuration) {
  const toolGroup = ToolGroupManager.createToolGroup('height-tool-group');
  toolGroup.addTool(HeightTool.toolName, configuration);

  tool = toolGroup.getToolInstance(HeightTool.toolName);
  tool.getTargetId = () => targetId;
  tool.getTargetImageData = () => ({
    imageData,
    dimensions,
    spacing,
    hasPixelSpacing: true,
  });
  tool.filterInteractableAnnotationsForElement = (_, annotations) =>
    annotations;
  tool.renderLinkedTextBoxAnnotation = () => true;

  element = document.createElement('div');
  enabledElement = {
    viewportId: 'height-tool-viewport',
    FrameOfReferenceUID,
    renderingEngine: { id: 'height-tool-rendering-engine' },
    viewport: {
      element,
      getViewReference: () => ({ FrameOfReferenceUID, viewPlaneNormal }),
      getRenderingEngine: () => ({}),
      worldToCanvas: ([x, y]) => [x, y],
    },
  };
  getEnabledElement.mockReturnValue(enabledElement);
}

const render = () => tool.renderAnnotation(enabledElement, {});

function dispatch(type, detail) {
  element.dispatchEvent(
    new CustomEvent(type, { detail: { element, ...detail } })
  );
}

const moveTo = (index, type = Events.MOUSE_DRAG) =>
  dispatch(type, { currentPoints: { world: toWorld(index) } });
const moveBy = (world) =>
  dispatch(Events.MOUSE_DRAG, { deltaPoints: { world } });
const release = () => dispatch(Events.MOUSE_UP);

const interaction = (index = start) => ({
  detail: { element, currentPoints: { world: toWorld(index) } },
  preventDefault() {},
});

function startDrawing(index = start) {
  const annotation = tool.addNewAnnotation(interaction(index));
  render();
  return annotation;
}

function draw([first, second]) {
  const annotation = startDrawing(first);
  moveTo(second);
  render();
  release();
  return annotation;
}

function load(indexPoints) {
  const annotation = {
    annotationUID: utilities.uuidv4(),
    metadata: {
      toolName: HeightTool.toolName,
      FrameOfReferenceUID,
      viewPlaneNormal,
    },
    data: {
      handles: {
        points: indexPoints.map(toWorld),
        textBox: { worldPosition: toWorld(start) },
      },
      cachedStats: {},
    },
  };
  addAnnotation(annotation, element);
  render();
  return annotation;
}

const select = (annotation) =>
  tool.toolSelectedCallback(interaction(), annotation);
const selectHandle = (annotation, handle) =>
  tool.handleSelectedCallback(interaction(), annotation, handle);

const interactionsWithoutMovedHandles = {
  'a click on the line': (annotation) => {
    select(annotation);
    release();
  },
  'a click on a handle': (annotation) => {
    selectHandle(annotation, annotation.data.handles.points[1]);
    release();
  },
  'a text box move': (annotation) => {
    selectHandle(annotation, annotation.data.handles.textBox);
    moveBy([2, 2, 0]);
    render();
    release();
  },
};

const isKept = (annotation) =>
  getAnnotation(annotation.annotationUID) !== undefined;

describe('HeightTool preventHandleOutsideImage', () => {
  beforeAll(() => addTool(HeightTool));
  afterAll(() => removeTool(HeightTool));

  // Control the 100 ms throttle of the stats
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    removeAllAnnotations();
    ToolGroupManager.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('when enabled', () => {
    beforeEach(() => setUp({ preventHandleOutsideImage: true }));

    it.each([
      ['both handles inside', inside, true],
      [
        'the first and last voxel',
        [
          [0, 0, 0],
          [63, 47, 0],
        ],
        true,
      ],
      ['the first handle outside', [[-3, 10, 0], insideEnd], false],
      ['the second handle outside', outside, false],
      ['both handles outside', [[-3, 10, 0], outsideEnd], false],
    ])('handles drawing with %s', (_, points, kept) => {
      expect(isKept(draw(points))).toBe(kept);
    });

    it('waits for the second click when drawing by two clicks', () => {
      const annotation = startDrawing();
      release();
      expect(isKept(annotation)).toBe(true);

      moveTo(outsideEnd, Events.MOUSE_MOVE);
      dispatch(Events.MOUSE_CLICK);
      expect(isKept(annotation)).toBe(false);
    });

    it('keeps a moved annotation without an image to check against', () => {
      const annotation = load(inside);
      load(outside);
      select(annotation);
      moveBy([1, 1, 0]);
      tool.getTargetImageData = () => undefined;
      release();
      expect(isKept(annotation)).toBe(true);
    });

    it.each([
      ['outside', insideEnd, outsideEnd, false],
      ['inside', outsideEnd, insideEnd, true],
    ])(
      'uses the position %s when released before the throttle fires',
      (_, previous, last, kept) => {
        const annotation = startDrawing();
        moveTo(previous);
        render();
        moveTo(last);
        render();
        release();
        expect(isKept(annotation)).toBe(kept);
      }
    );

    describe.each(Object.entries(interactionsWithoutMovedHandles))(
      'on %s',
      (_, interact) => {
        it('keeps an inside annotation', () => {
          const annotation = load(inside);
          interact(annotation);
          expect(isKept(annotation)).toBe(true);
        });

        it('keeps a loaded outside annotation', () => {
          const annotation = load(outside);
          interact(annotation);
          expect(isKept(annotation)).toBe(true);
        });

        it('keeps an inside one after an outside one was drawn', () => {
          const annotation = load(inside);
          draw(outside);
          interact(annotation);
          expect(isKept(annotation)).toBe(true);
        });
      }
    );

    it.each([
      ['out of', inside, outsideEnd, false],
      ['into', outside, insideEnd, true],
    ])('handles a handle moved %s the image', (_, points, end, kept) => {
      const annotation = load(points);
      selectHandle(annotation, annotation.data.handles.points[1]);
      moveTo(end);
      release();
      expect(isKept(annotation)).toBe(kept);
    });

    it('removes an annotation moved out of the image as a whole', () => {
      const annotation = load(inside);
      select(annotation);
      moveBy([-20, 0, 0]);
      release();
      expect(isKept(annotation)).toBe(false);
    });

    it('decides from the moved annotation, not the last one rendered', () => {
      const annotation = load(inside);
      selectHandle(annotation, annotation.data.handles.points[1]);
      moveTo([12, 32, 0]);
      render();
      load(outside);
      release();
      expect(isKept(annotation)).toBe(true);
    });
  });

  describe('by default (disabled)', () => {
    beforeEach(() => setUp(undefined));

    it.each([
      ['inside', inside],
      ['outside', outside],
    ])('keeps an annotation drawn %s', (__, points) => {
      expect(isKept(draw(points))).toBe(true);
    });

    it('keeps an annotation with a handle moved out of the image', () => {
      const annotation = load(inside);
      selectHandle(annotation, annotation.data.handles.points[1]);
      moveTo(outsideEnd);
      release();
      expect(isKept(annotation)).toBe(true);
    });
  });
});
