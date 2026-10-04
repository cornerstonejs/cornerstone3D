import UltrasoundDirectionalTool from '../src/tools/annotation/UltrasoundDirectionalTool';
import renderingEngineCache from '../../core/src/RenderingEngine/renderingEngineCache';

describe('Ultrasound Directional measurements', () => {
  it('uses continuous indices for calibrated endpoint values', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:test';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 100,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 100,
            physicalUnitsXDirection: 4,
            physicalUnitsYDirection: 7,
            physicalDeltaX: 2,
            physicalDeltaY: 3,
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [0.2, 0.3, 0],
            [10.7, 4.8, 0],
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;

    tool._calculateCachedStats(annotation, {}, { viewport });

    const { xValues, yValues, isHorizontal, units, isUnitless } =
      annotation.data.cachedStats[targetId];

    expect(xValues[0]).toBeCloseTo(0.4);
    expect(xValues[1]).toBeCloseTo(21.4);
    expect(yValues[0]).toBeCloseTo(0.9);
    expect(yValues[1]).toBeCloseTo(14.4);
    expect(isHorizontal).toBe(true);
    expect(units).toEqual(['seconds', 'cm/sec']);
    expect(isUnitless).toBe(false);
  });

  it('measures ECG waveform with ms and mV units', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:ecgTest';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 5000,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 65535,
            referencePixelX0: 0,
            referencePixelY0: 32768,
            physicalUnitsXDirection: 4, // seconds -> converted to ms
            physicalUnitsYDirection: -1, // mV
            physicalDeltaX: 0.001, // 1 ms/sample (0.001 s)
            physicalDeltaY: 0.005, // 0.005 mV/unit
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y + 32768, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [100, 100, 0],
            [300, 500, 0],
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;

    tool._calculateCachedStats(annotation, {}, { viewport });

    const { xValues, yValues, isHorizontal, units, isUnitless } =
      annotation.data.cachedStats[targetId];

    // Point 1: indexX = 100, deltaX = 100 * 0.001 * 1000 = 100 ms
    // Point 2: indexX = 300, deltaX = 300 * 0.001 * 1000 = 300 ms
    expect(xValues[0]).toBeCloseTo(100);
    expect(xValues[1]).toBeCloseTo(300);

    // Point 1: indexY = 100 + 32768, yVal = 100 * 0.005 = 0.5 mV
    // Point 2: indexY = 500 + 32768, yVal = 500 * 0.005 = 2.5 mV
    expect(yValues[0]).toBeCloseTo(0.5);
    expect(yValues[1]).toBeCloseTo(2.5);

    expect(units).toEqual(['ms', 'mV']);
    expect(isUnitless).toBe(false);
  });

  it('measures vertical ECG amplitude and formats text lines', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:ecgTest';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 5000,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 65535,
            referencePixelX0: 0,
            referencePixelY0: 32768,
            physicalUnitsXDirection: 4,
            physicalUnitsYDirection: -1,
            physicalDeltaX: 0.001,
            physicalDeltaY: 0.005,
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y + 32768, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [100, 100, 0],
            [100, 700, 0], // strictly vertical
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;
    tool._calculateCachedStats(annotation, {}, { viewport });

    const stats = annotation.data.cachedStats[targetId];
    expect(stats.isHorizontal).toBe(false);

    // Delta Y = 600 units * 0.005 mV/unit = 3.0 mV -> formatted as 3.00 mV
    const textLines = tool.configuration.getTextLines(
      annotation.data,
      targetId,
      tool.configuration
    );
    expect(textLines).toEqual(['3.00 mV']);
  });

  it('displays both horizontal (ms) and vertical (mV) distances when configured', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:ecgTest';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 5000,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 65535,
            referencePixelX0: 0,
            referencePixelY0: 32768,
            physicalUnitsXDirection: 4,
            physicalUnitsYDirection: -1,
            physicalDeltaX: 0.001,
            physicalDeltaY: 0.005,
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y + 32768, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [100, 100, 0],
            [200, 300, 0],
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;
    tool._calculateCachedStats(annotation, {}, { viewport });

    const textLines = tool.configuration.getTextLines(
      annotation.data,
      targetId,
      { ...tool.configuration, displayBothAxesDistances: true }
    );
    // Delta X = 100 ms, Delta Y = 1 mV -> formatted as 100 ms, 1.00 mV
    expect(textLines).toEqual(['100 ms', '1.00 mV']);
  });

  // Negative flows
  it('falls back to unitless pixels when endpoints have mismatched units', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:mismatchTest';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 100,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 100,
            physicalUnitsXDirection: 4,
            physicalUnitsYDirection: 7,
            physicalDeltaX: 1,
            physicalDeltaY: 1,
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [50, 50, 0], // inside region (seconds, cm/sec)
            [500, 500, 0], // outside region (raw fallback)
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;
    tool._calculateCachedStats(annotation, {}, { viewport });

    const stats = annotation.data.cachedStats[targetId];
    expect(stats.isUnitless).toBe(true);
    expect(stats.units).toEqual(['px']);

    const textLines = tool.configuration.getTextLines(
      annotation.data,
      targetId,
      tool.configuration
    );
    expect(textLines[0]).toMatch(/\d+ px/);
  });

  it('safely bails out when handles have less than 2 points', () => {
    const tool = new UltrasoundDirectionalTool();
    const annotation = {
      data: {
        cachedStats: {},
        handles: { points: [[0, 0, 0]] },
      },
    };
    const result = tool._calculateCachedStats(annotation, {}, { viewport: {} });
    expect(result).toBeUndefined();
  });

  it('safely skips when target image data is not found', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:missing';
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [0, 0, 0],
            [10, 10, 0],
          ],
        },
      },
    };
    tool.getTargetImageData = () => null;
    const result = tool._calculateCachedStats(annotation, {}, { viewport: {} });
    expect(result[targetId]).toEqual({});
  });

  it('rejects adding annotation on unsupported viewport', () => {
    const tool = new UltrasoundDirectionalTool();
    const element = document.createElement('div');
    const mockEngineId = 'testUnsupportedEngine';
    const mockViewportId = 'unsupportedViewport';

    element.dataset.viewportUid = mockViewportId;
    element.dataset.renderingEngineUid = mockEngineId;

    const fakeUnsupportedViewport = {
      id: mockViewportId,
      element,
      // does not implement viewportSupportsImageSlices or viewportSupportsWaveform
    };

    renderingEngineCache.set({
      id: mockEngineId,
      getViewports: () => [fakeUnsupportedViewport],
      getViewport: (id) =>
        id === mockViewportId ? fakeUnsupportedViewport : null,
    });

    const evt = {
      detail: {
        currentPoints: { world: [0, 0, 0] },
        element,
      },
      preventDefault: jest.fn(),
    };

    try {
      expect(() => tool.addNewAnnotation(evt)).toThrow(
        /UltrasoundDirectionalTool can only be used on a viewport that supports image slices.*or waveform data/
      );
    } finally {
      renderingEngineCache.delete(mockEngineId);
    }
  });
});
