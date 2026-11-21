import { drawTextBox } from '../../drawingSvg';
import { getAnnotations } from '../../stateManagement/annotation/annotationState';
import AngleTool from './AngleTool';
import CobbAngleTool from './CobbAngleTool';

jest.mock('../../stateManagement/annotation/annotationState', () => ({
  ...jest.requireActual('../../stateManagement/annotation/annotationState'),
  getAnnotations: jest.fn(),
}));

jest.mock('../../stateManagement/annotation/annotationVisibility', () => ({
  ...jest.requireActual(
    '../../stateManagement/annotation/annotationVisibility'
  ),
  isAnnotationVisible: jest.fn(() => true),
}));

jest.mock('../../drawingSvg', () => ({
  ...jest.requireActual('../../drawingSvg'),
  drawHandles: jest.fn(),
  drawLine: jest.fn(),
  drawPath: jest.fn(),
  drawTextBox: jest.fn(),
}));

const targetId = 'imageId:test';

function createEnabledElement() {
  const viewport = {
    id: 'viewport-1',
    element: document.createElement('div'),
    getRenderingEngine: () => ({}),
    worldToCanvas: ([x, y]) => [x, y],
    canvasToWorld: ([x, y]) => [x, y, 0],
  };
  return { viewport } as never;
}

type RenderTestTool = {
  renderAnnotation: (enabledElement, svgDrawingHelper) => boolean;
  filterInteractableAnnotationsForElement: (element, annotations) => unknown;
  getTargetId: () => string;
  getAnnotationStyle: () => Record<string, unknown>;
  renderLinkedTextBoxAnnotation: (options) => boolean;
};

/**
 * Renders a single annotation whose stats are already cached and returns the
 * mock that stands in for the linked text box.
 */
function renderWithCachedAngle(tool, annotation) {
  const testTool = tool as unknown as RenderTestTool;
  (getAnnotations as jest.Mock).mockReturnValue([annotation]);
  jest
    .spyOn(testTool, 'filterInteractableAnnotationsForElement')
    .mockImplementation((_element, annotations) => annotations);
  jest.spyOn(testTool, 'getTargetId').mockReturnValue(targetId);
  jest
    .spyOn(testTool, 'getAnnotationStyle')
    .mockReturnValue({ color: 'red', lineWidth: 1, lineDash: '' });
  const renderTextBox = jest
    .spyOn(testTool, 'renderLinkedTextBoxAnnotation')
    .mockReturnValue(true);

  testTool.renderAnnotation(createEnabledElement(), {});

  return renderTextBox;
}

describe('angle tools render the text box for a measured angle of 0', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('CobbAngleTool', () => {
    function createCobbAnnotation(angle) {
      return {
        annotationUID: 'cobb-1',
        invalidated: false,
        metadata: { toolName: CobbAngleTool.toolName },
        data: {
          handles: {
            // Two parallel horizontal lines: a Cobb angle of exactly 0
            points: [
              [0, 0, 0],
              [10, 0, 0],
              [0, 5, 0],
              [10, 5, 0],
            ],
            activeHandleIndex: null,
            textBox: {},
          },
          cachedStats: {
            [targetId]: {
              angle,
              arc1Angle: 90,
              arc2Angle: 90,
              points: {
                canvas: {
                  arc1Start: [0, 0],
                  arc1End: [10, 0],
                  arc2Start: [0, 5],
                  arc2End: [10, 5],
                },
                world: {},
              },
            },
          },
        },
      };
    }

    it('renders the text box for an angle of 0', () => {
      const renderTextBox = renderWithCachedAngle(
        new CobbAngleTool(),
        createCobbAnnotation(0)
      );

      expect(renderTextBox).toHaveBeenCalledTimes(1);
      expect(renderTextBox.mock.calls[0][0].textLines).toEqual(['0.00 °']);
    });

    it('still skips the text box for an angle of NaN (zero-length line)', () => {
      const renderTextBox = renderWithCachedAngle(
        new CobbAngleTool(),
        createCobbAnnotation(NaN)
      );

      expect(renderTextBox).not.toHaveBeenCalled();
    });

    it('renders the text box for a non-zero angle', () => {
      const renderTextBox = renderWithCachedAngle(
        new CobbAngleTool(),
        createCobbAnnotation(12.5)
      );

      expect(renderTextBox).toHaveBeenCalledTimes(1);
      expect(renderTextBox.mock.calls[0][0].textLines).toEqual(['12.50 °']);
    });

    it('draws the arc angle labels for an angle of 0 with showArcLines', () => {
      renderWithCachedAngle(
        new CobbAngleTool({ configuration: { showArcLines: true } }),
        createCobbAnnotation(0)
      );

      const arcLabels = (drawTextBox as jest.Mock).mock.calls.map(
        ([, , textBoxUID, textLines]) => [textBoxUID, textLines]
      );
      expect(arcLabels).toEqual([
        ['arcAngle1', ['90.00 °']],
        ['arcAngle2', ['90.00 °']],
      ]);
    });
  });

  describe('CobbAngleTool stats', () => {
    it('computes exactly 0 for two parallel lines in patient coordinates', () => {
      const tool = new CobbAngleTool();
      const annotation = {
        invalidated: false,
        data: {
          handles: {
            points: [
              [-120.4, 33.7, -48.25],
              [-60.9, 33.7, -48.25],
              [-118.1, 51.3, -48.25],
              [-55.35, 51.3, -48.25],
            ],
          },
          cachedStats: { [targetId]: {} },
        },
      };

      tool._calculateCachedStats(annotation, {}, createEnabledElement());

      expect(annotation.data.cachedStats[targetId].angle).toBe(0);
    });
  });

  describe('AngleTool', () => {
    function createAngleAnnotation(angle) {
      return {
        annotationUID: 'angle-1',
        invalidated: false,
        metadata: { toolName: AngleTool.toolName },
        data: {
          handles: {
            // The third point lies on the first arm: an angle of exactly 0
            points: [
              [0, 0, 0],
              [10, 0, 0],
              [5, 0, 0],
            ],
            activeHandleIndex: null,
            textBox: {},
          },
          cachedStats: {
            [targetId]: { angle },
          },
        },
      };
    }

    it('renders the text box for an angle of 0', () => {
      const renderTextBox = renderWithCachedAngle(
        new AngleTool(),
        createAngleAnnotation(0)
      );

      expect(renderTextBox).toHaveBeenCalledTimes(1);
      expect(renderTextBox.mock.calls[0][0].textLines).toEqual(['0 °']);
    });

    it('renders the text box for an incomplete angle', () => {
      const renderTextBox = renderWithCachedAngle(
        new AngleTool(),
        createAngleAnnotation('Incomplete Angle')
      );

      expect(renderTextBox).toHaveBeenCalledTimes(1);
      expect(renderTextBox.mock.calls[0][0].textLines).toEqual([
        'Incomplete Angle',
      ]);
    });

    it('still skips the text box for an angle of NaN', () => {
      const renderTextBox = renderWithCachedAngle(
        new AngleTool(),
        createAngleAnnotation(NaN)
      );

      expect(renderTextBox).not.toHaveBeenCalled();
    });
  });
});
