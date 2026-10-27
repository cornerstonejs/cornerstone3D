import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { metaData } from '@cornerstonejs/core';
import dcmjs from 'dcmjs';
import { Cornerstone3DSR } from '../src/adapters/Cornerstone3D';
import {
  readGraphicAnnotationItem,
  graphicObjectToShape,
  compoundGraphicToShape,
} from '../src/adapters/Cornerstone3D/GSPS';

const { GSPS, MeasurementReport } = Cornerstone3DSR;

// Synthetic, made up identifiers. No patient data.
const IMAGE_UID = '2.25.1001';
const OTHER_IMAGE_UID = '2.25.1002';
const MULTIFRAME_UID = '2.25.1003';
const FOR_UID = '2.25.2001';

const sopInstanceUIDToImageIdMap = {
  [`${IMAGE_UID}:1`]: 'synthetic:image',
  [`${OTHER_IMAGE_UID}:1`]: 'synthetic:other',
  [`${MULTIFRAME_UID}:1`]: 'synthetic:mf1',
  [`${MULTIFRAME_UID}:2`]: 'synthetic:mf2',
};

// Axial plane at z = imageIndex, 1 mm pixels, so a PIXEL point (c, r)
// maps to world (c - 0.5, r - 0.5, z), the pixel center being at 0.5.
const zByImageId = {
  'synthetic:image': 0,
  'synthetic:other': 5,
  'synthetic:mf1': 10,
  'synthetic:mf2': 11,
};

function provider(type, imageId) {
  if (!(imageId in zByImageId)) {
    return;
  }
  if (type === 'imagePlaneModule') {
    return {
      frameOfReferenceUID: FOR_UID,
      imagePositionPatient: [0, 0, zByImageId[imageId]],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      rowPixelSpacing: 1,
      columnPixelSpacing: 1,
    };
  }
  if (type === 'imagePixelModule') {
    return { rows: 200, columns: 100 };
  }
}

const world = (column, row, z = 0) => [column - 0.5, row - 0.5, z];

function graphic(GraphicType, GraphicData, extra = {}) {
  return {
    GraphicAnnotationUnits: 'PIXEL',
    GraphicDimensions: 2,
    NumberOfGraphicPoints: GraphicData.length / 2,
    GraphicData,
    GraphicType,
    ...extra,
  };
}

function text(UnformattedTextValue, extra = {}) {
  return { UnformattedTextValue, ...extra };
}

function createGSPS(GraphicAnnotationSequence) {
  return {
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.1',
    SOPInstanceUID: '2.25.3001',
    Modality: 'PR',
    ReferencedSeriesSequence: [
      {
        SeriesInstanceUID: '2.25.4001',
        ReferencedImageSequence: [
          {
            ReferencedSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
            ReferencedSOPInstanceUID: IMAGE_UID,
          },
          {
            ReferencedSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
            ReferencedSOPInstanceUID: OTHER_IMAGE_UID,
          },
        ],
      },
    ],
    GraphicLayerSequence: [{ GraphicLayer: 'LAYER1', GraphicLayerOrder: 1 }],
    GraphicAnnotationSequence,
  };
}

function onImage(uid, rest) {
  return {
    ReferencedImageSequence: [
      {
        ReferencedSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        ReferencedSOPInstanceUID: uid,
      },
    ],
    GraphicLayer: 'LAYER1',
    ...rest,
  };
}

describe('GSPS', () => {
  beforeAll(() => {
    metaData.addProvider(provider, 10000);
  });

  afterAll(() => {
    metaData.removeProvider(provider);
  });

  describe('graphic objects', () => {
    it('maps each graphic type to a tool', () => {
      const toolOf = (g) => graphicObjectToShape(g)?.toolType;
      expect(toolOf(graphic('POINT', [1, 2]))).toBe('Probe');
      expect(toolOf(graphic('POLYLINE', [1, 2, 3, 4]))).toBe('Length');
      expect(toolOf(graphic('POLYLINE', [1, 2, 3, 4, 5, 6]))).toBe(
        'PlanarFreehandROI'
      );
      expect(toolOf(graphic('INTERPOLATED', [1, 2, 3, 4, 5, 6]))).toBe(
        'PlanarFreehandROI'
      );
      expect(toolOf(graphic('CIRCLE', [10, 10, 15, 10]))).toBe('CircleROI');
      expect(toolOf(graphic('ELLIPSE', [0, 5, 20, 5, 10, 2, 10, 8]))).toBe(
        'EllipticalROI'
      );
    });

    it('skips non PIXEL units and wrong point counts', () => {
      expect(
        graphicObjectToShape(
          graphic('POINT', [0.5, 0.5], { GraphicAnnotationUnits: 'DISPLAY' })
        )
      ).toBeUndefined();
      expect(graphicObjectToShape(graphic('CIRCLE', [1, 2]))).toBeUndefined();
      expect(
        graphicObjectToShape(graphic('ELLIPSE', [1, 2, 3, 4]))
      ).toBeUndefined();
      expect(graphicObjectToShape(graphic('SPLINE', [1, 2]))).toBeUndefined();
    });

    it('detects closed polylines and drops the repeated point', () => {
      const shape = graphicObjectToShape(
        graphic('POLYLINE', [0, 0, 10, 0, 10, 10, 0, 0])
      );
      expect(shape.closed).toBe(true);
      expect(shape.points).toEqual([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      const open = graphicObjectToShape(
        graphic('POLYLINE', [0, 0, 10, 0, 10, 10])
      );
      expect(open.closed).toBe(false);
      expect(open.points).toHaveLength(3);
    });
  });

  describe('compound graphics', () => {
    const compound = (CompoundGraphicType, GraphicData, extra = {}) => ({
      CompoundGraphicInstanceID: 1,
      CompoundGraphicUnits: 'PIXEL',
      GraphicDimensions: 2,
      NumberOfGraphicPoints: GraphicData.length / 2,
      GraphicData,
      CompoundGraphicType,
      ...extra,
    });

    it('maps RULER, ARROW, RECTANGLE and ELLIPSE', () => {
      expect(compoundGraphicToShape(compound('RULER', [1, 1, 9, 9]))).toEqual({
        toolType: 'Length',
        points: [
          [1, 1],
          [9, 9],
        ],
      });
      expect(
        compoundGraphicToShape(compound('ARROW', [5, 5, 20, 30])).points
      ).toEqual([
        [5, 5],
        [20, 30],
      ]);
      expect(
        compoundGraphicToShape(compound('RECTANGLE', [10, 20, 30, 40]))
      ).toEqual({
        toolType: 'RectangleROI',
        points: [
          [10, 20],
          [30, 20],
          [10, 40],
          [30, 40],
        ],
      });
      expect(
        compoundGraphicToShape(compound('ELLIPSE', [10, 20, 30, 40]))
      ).toEqual({
        toolType: 'EllipticalROI',
        points: [
          [20, 20],
          [20, 40],
          [10, 30],
          [30, 30],
        ],
      });
    });

    it('falls back for rotated and unsupported compound graphics', () => {
      expect(
        compoundGraphicToShape(
          compound('RECTANGLE', [10, 20, 30, 40], { RotationAngle: 45 })
        )
      ).toBeUndefined();
      expect(
        compoundGraphicToShape(compound('CROSSHAIR', [10, 20]))
      ).toBeUndefined();
      expect(
        compoundGraphicToShape(compound('MULTILINE', [0, 0, 1, 1, 2, 2, 3, 3]))
      ).toBeUndefined();
    });

    it('uses the compound graphic instead of its simple rendering', () => {
      const shapes = readGraphicAnnotationItem({
        GraphicLayer: 'LAYER1',
        CompoundGraphicSequence: [compound('RULER', [10, 10, 50, 10])],
        GraphicObjectSequence: [
          graphic('POLYLINE', [10, 10, 50, 10], {
            CompoundGraphicInstanceID: 1,
          }),
          graphic('POLYLINE', [10, 8, 10, 12], {
            CompoundGraphicInstanceID: 1,
          }),
        ],
        TextObjectSequence: [
          text('40.0 mm', {
            CompoundGraphicInstanceID: 1,
            BoundingBoxAnnotationUnits: 'PIXEL',
            BoundingBoxTopLeftHandCorner: [30, 12],
            BoundingBoxBottomRightHandCorner: [50, 20],
            BoundingBoxTextHorizontalJustification: 'LEFT',
          }),
        ],
      });
      expect(shapes).toHaveLength(1);
      expect(shapes[0]).toMatchObject({
        toolType: 'Length',
        label: '40.0 mm',
        textPosition: [30, 12],
        graphicLayer: 'LAYER1',
      });
    });

    it('reads the simple rendering when the compound type is not mapped', () => {
      const shapes = readGraphicAnnotationItem({
        GraphicLayer: 'LAYER1',
        CompoundGraphicSequence: [compound('CROSSHAIR', [10, 10])],
        GraphicObjectSequence: [
          graphic('POLYLINE', [0, 10, 20, 10], {
            CompoundGraphicInstanceID: 1,
          }),
          graphic('POLYLINE', [10, 0, 10, 20], {
            CompoundGraphicInstanceID: 1,
          }),
        ],
      });
      expect(shapes.map((s) => s.toolType)).toEqual(['Length', 'Length']);
    });
  });

  describe('text objects', () => {
    it('uses the text of a single graphic as its label', () => {
      const shapes = readGraphicAnnotationItem({
        GraphicObjectSequence: [
          graphic('ELLIPSE', [0, 5, 20, 5, 10, 2, 10, 8]),
        ],
        TextObjectSequence: [
          text('Lesion A\r\nsecond line', {
            BoundingBoxAnnotationUnits: 'PIXEL',
            BoundingBoxTopLeftHandCorner: [25, 0],
            BoundingBoxBottomRightHandCorner: [60, 10],
          }),
        ],
      });
      expect(shapes).toHaveLength(1);
      expect(shapes[0].label).toBe('Lesion A\nsecond line');
      expect(shapes[0].textPosition).toEqual([25, 0]);
    });

    it('turns a visible anchor into an arrow and other text into a label', () => {
      const shapes = readGraphicAnnotationItem({
        TextObjectSequence: [
          text('arrow text', {
            BoundingBoxAnnotationUnits: 'PIXEL',
            BoundingBoxTopLeftHandCorner: [200, 200],
            BoundingBoxBottomRightHandCorner: [300, 300],
            AnchorPointAnnotationUnits: 'PIXEL',
            AnchorPoint: [100, 100],
            AnchorPointVisibility: 'Y',
          }),
          text('floating text', {
            BoundingBoxAnnotationUnits: 'PIXEL',
            BoundingBoxTopLeftHandCorner: [10, 10],
            BoundingBoxBottomRightHandCorner: [50, 20],
          }),
          text('display units only', {
            BoundingBoxAnnotationUnits: 'DISPLAY',
            BoundingBoxTopLeftHandCorner: [0.1, 0.1],
            BoundingBoxBottomRightHandCorner: [0.2, 0.2],
          }),
        ],
      });
      expect(shapes).toHaveLength(2);
      expect(shapes[0]).toMatchObject({
        toolType: 'ArrowAnnotate',
        label: 'arrow text',
        points: [
          [100, 100],
          [250, 250],
        ],
        textPosition: [200, 200],
      });
      expect(shapes[1]).toMatchObject({
        toolType: 'Label',
        label: 'floating text',
        points: [[10, 10]],
      });
    });

    it('falls back to the tracking id as the label', () => {
      const [shape] = readGraphicAnnotationItem({
        GraphicObjectSequence: [
          graphic('POINT', [3, 4], {
            TrackingID: 'Finding 1',
            TrackingUID: '2.25.5001',
          }),
        ],
      });
      expect(shape.label).toBe('Finding 1');
      expect(shape.trackingUniqueIdentifier).toBe('2.25.5001');
    });
  });

  describe('generateToolState', () => {
    const dataset = createGSPS([
      onImage(IMAGE_UID, {
        GraphicObjectSequence: [graphic('POLYLINE', [10, 20, 40, 60])],
      }),
      onImage(IMAGE_UID, {
        GraphicObjectSequence: [graphic('CIRCLE', [50, 50, 60, 50])],
        TextObjectSequence: [
          text('circle', {
            BoundingBoxAnnotationUnits: 'PIXEL',
            BoundingBoxTopLeftHandCorner: [70, 40],
            BoundingBoxBottomRightHandCorner: [90, 50],
          }),
        ],
      }),
      onImage(OTHER_IMAGE_UID, {
        GraphicObjectSequence: [
          graphic('POLYLINE', [0, 0, 10, 0, 10, 10, 0, 0], {
            GraphicFilled: 'N',
          }),
        ],
      }),
      onImage(OTHER_IMAGE_UID, {
        TextObjectSequence: [
          text('look here', {
            AnchorPointAnnotationUnits: 'PIXEL',
            AnchorPoint: [30, 30],
            AnchorPointVisibility: 'Y',
          }),
        ],
      }),
      // No Referenced Image Sequence: applies to all the images
      {
        GraphicLayer: 'LAYER1',
        GraphicObjectSequence: [graphic('POINT', [5, 6])],
      },
    ]);

    it('returns tool state keyed by tool type, like the SR reader', () => {
      const toolState = GSPS.generateToolState(
        dataset,
        sopInstanceUIDToImageIdMap,
        metaData
      );
      expect(Object.keys(toolState).sort()).toEqual([
        'ArrowAnnotate',
        'CircleROI',
        'Length',
        'PlanarFreehandROI',
        'Probe',
      ]);

      const [length] = toolState.Length;
      expect(length.sopInstanceUid).toBe(IMAGE_UID);
      expect(length.annotation.metadata).toEqual({
        toolName: 'Length',
        referencedImageId: 'synthetic:image',
        FrameOfReferenceUID: FOR_UID,
      });
      expect(length.annotation.annotationUID).toBe(
        length.annotation.data.annotationUID
      );
      expect(length.annotation.data.handles.points).toEqual([
        world(10, 20),
        world(40, 60),
      ]);
      expect(length.annotation.data.frameNumber).toBe(1);

      const [circle] = toolState.CircleROI;
      expect(circle.annotation.data.label).toBe('circle');
      expect(circle.annotation.data.handles.textBox).toEqual({
        hasMoved: true,
        worldPosition: world(70, 40),
      });

      const [freehand] = toolState.PlanarFreehandROI;
      expect(freehand.annotation.metadata.referencedImageId).toBe(
        'synthetic:other'
      );
      expect(freehand.annotation.data.contour).toEqual({
        closed: true,
        polyline: [world(0, 0, 5), world(10, 0, 5), world(10, 10, 5)],
      });

      const [arrow] = toolState.ArrowAnnotate;
      expect(arrow.annotation.data.text).toBe('look here');
      expect(arrow.annotation.data.handles.arrowFirst).toBe(true);
      // Second point is offset by a tenth of the image size, as in the SR reader
      expect(arrow.annotation.data.handles.points).toEqual([
        world(30, 30, 5),
        world(40, 50, 5),
      ]);

      expect(
        toolState.Probe.map((p) => p.annotation.metadata.referencedImageId)
      ).toEqual(['synthetic:image', 'synthetic:other']);
    });

    it('matches the top level shape of MeasurementReport state', () => {
      const toolState = GSPS.generateToolState(
        dataset,
        sopInstanceUIDToImageIdMap,
        metaData
      );
      for (const states of Object.values(toolState)) {
        for (const state of states) {
          expect(state).toEqual(
            expect.objectContaining({
              sopInstanceUid: expect.any(String),
              findingSites: [],
              annotation: expect.objectContaining({
                annotationUID: expect.any(String),
                metadata: expect.objectContaining({
                  toolName: expect.any(String),
                  referencedImageId: expect.any(String),
                }),
                data: expect.objectContaining({
                  handles: expect.objectContaining({
                    points: expect.any(Array),
                    textBox: expect.any(Object),
                  }),
                  cachedStats: {},
                }),
              }),
            })
          );
        }
      }
      // GSPS is a separate entry point, not a TID 1500 measurement adapter
      expect(MeasurementReport.measurementAdapterByToolType.has('GSPS')).toBe(
        false
      );
    });

    it('applies an annotation to each referenced frame', () => {
      const multiframe = {
        ...createGSPS([
          {
            ReferencedImageSequence: [
              { ReferencedSOPInstanceUID: MULTIFRAME_UID },
            ],
            GraphicLayer: 'LAYER1',
            GraphicObjectSequence: [graphic('POINT', [1, 1])],
          },
          {
            ReferencedImageSequence: [
              {
                ReferencedSOPInstanceUID: MULTIFRAME_UID,
                ReferencedFrameNumber: [2],
              },
            ],
            GraphicLayer: 'LAYER1',
            GraphicObjectSequence: [graphic('POLYLINE', [1, 1, 2, 2])],
          },
        ]),
      };
      const toolState = GSPS.generateToolState(
        multiframe,
        sopInstanceUIDToImageIdMap,
        metaData
      );
      expect(
        toolState.Probe.map((p) => p.annotation.data.frameNumber).sort()
      ).toEqual([1, 2]);
      expect(toolState.Length).toHaveLength(1);
      expect(toolState.Length[0].annotation.metadata.referencedImageId).toBe(
        'synthetic:mf2'
      );
      expect(toolState.Length[0].annotation.data.handles.points[0]).toEqual(
        world(1, 1, 11)
      );
    });

    it('skips images that are not loaded', () => {
      const toolState = GSPS.generateToolState(
        createGSPS([
          onImage('2.25.9999', {
            GraphicObjectSequence: [graphic('POINT', [1, 1])],
          }),
        ]),
        sopInstanceUIDToImageIdMap,
        metaData
      );
      expect(toolState).toEqual({});
    });

    it('rejects volumetric presentation states', () => {
      expect(() =>
        GSPS.generateToolState(
          { SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.6' },
          sopInstanceUIDToImageIdMap,
          metaData
        )
      ).toThrow(/not supported/);
    });

    it('reads a dataset written to and read back from Part 10', () => {
      const { DicomMetaDictionary, DicomDict, DicomMessage } = dcmjs.data;
      const source = createGSPS([
        onImage(IMAGE_UID, {
          GraphicObjectSequence: [
            graphic('ELLIPSE', [0, 5, 20, 5, 10, 2, 10, 8]),
          ],
          TextObjectSequence: [
            text('single item', {
              BoundingBoxAnnotationUnits: 'PIXEL',
              BoundingBoxTopLeftHandCorner: [25, 0],
              BoundingBoxBottomRightHandCorner: [60, 10],
              BoundingBoxTextHorizontalJustification: 'LEFT',
            }),
          ],
        }),
      ]);
      const dict = new DicomDict({
        TransferSyntaxUID: { vr: 'UI', Value: ['1.2.840.10008.1.2.1'] },
        MediaStorageSOPClassUID: { vr: 'UI', Value: [source.SOPClassUID] },
        MediaStorageSOPInstanceUID: {
          vr: 'UI',
          Value: [source.SOPInstanceUID],
        },
      });
      dict.dict = DicomMetaDictionary.denaturalizeDataset(source);
      const buffer = dict.write();
      const read = DicomMessage.readFile(buffer);
      const dataset = DicomMetaDictionary.naturalizeDataset(read.dict);

      const toolState = GSPS.generateToolState(
        dataset,
        sopInstanceUIDToImageIdMap,
        metaData
      );
      expect(toolState.EllipticalROI).toHaveLength(1);
      const [ellipse] = toolState.EllipticalROI;
      expect(ellipse.annotation.data.label).toBe('single item');
      expect(ellipse.annotation.data.handles.points).toEqual([
        world(0, 5),
        world(20, 5),
        world(10, 2),
        world(10, 8),
      ]);
    });
  });
});
