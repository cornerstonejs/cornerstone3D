import { utilities, sr } from 'dcmjs';
import { CONTROL_POINTS_CODE, SPLINE_TYPE_CODE } from './constants';
const { valueTypes } = sr;
const { Polyline: TID300Polyline } = utilities.TID300;

/** Typed view of the dcmjs TID300Polyline instance (types not shipped by dcmjs). */
interface TID300PolylineInstance {
  props: {
    controlPoints?: number[];
    use3DSpatialCoordinates?: boolean;
    ReferencedSOPSequence?: unknown;
    ReferencedFrameOfReferenceUID?: string;
    splineType?: string;
  };
  flattenPoints: (opts: {
    points: number[];
    use3DSpatialCoordinates?: boolean;
  }) => number[];
}

export default class ControlPointPolyline extends TID300Polyline {
  contentItem() {
    const contentEntries = super.contentItem();
    const self = this as unknown as TID300PolylineInstance;
    const {
      controlPoints,
      use3DSpatialCoordinates,
      ReferencedSOPSequence,
      ReferencedFrameOfReferenceUID,
      use3DSpatialCoordinates: is3DMeasurement,
    } = self.props;

    if (!controlPoints?.length) {
      return contentEntries;
    }

    const GraphicData = self.flattenPoints({
      points: controlPoints,
      use3DSpatialCoordinates,
    });

    const GraphicType = valueTypes.GraphicTypes.MULTIPOINT;

    const scoordPlain: Record<string, unknown> = is3DMeasurement
      ? {
          RelationshipType: valueTypes.RelationshipTypes.CONTAINS,
          ValueType: 'SCOORD3D',
          ConceptNameCodeSequence: [
            {
              CodeValue: CONTROL_POINTS_CODE.value,
              CodingSchemeDesignator: CONTROL_POINTS_CODE.schemeDesignator,
              CodeMeaning: CONTROL_POINTS_CODE.meaning,
            },
          ],
          GraphicType,
          GraphicData,
          ReferencedFrameOfReferenceUID,
          ContentSequence: [
            {
              RelationshipType: valueTypes.RelationshipTypes.SELECTED_FROM,
              ValueType: valueTypes.ValueTypes.IMAGE,
              ReferencedSOPSequence,
            },
          ],
        }
      : {
          RelationshipType: valueTypes.RelationshipTypes.CONTAINS,
          ValueType: 'SCOORD',
          ConceptNameCodeSequence: [
            {
              CodeValue: CONTROL_POINTS_CODE.value,
              CodingSchemeDesignator: CONTROL_POINTS_CODE.schemeDesignator,
              CodeMeaning: CONTROL_POINTS_CODE.meaning,
            },
          ],
          GraphicType,
          GraphicData,
          ContentSequence: [
            {
              RelationshipType: valueTypes.RelationshipTypes.SELECTED_FROM,
              ValueType: valueTypes.ValueTypes.IMAGE,
              ReferencedSOPSequence,
            },
          ],
        };

    // Nest control points inside the NUM entry's ContentSequence.
    // Spline Type goes as HAS OBS CONTEXT at Measurement Group level (TID 320 does not allow TEXT under NUM).
    const { splineType } = self.props;

    const entries = contentEntries as Array<Record<string, unknown>>;
    const numEntry = entries.find((e) => e.ValueType === 'NUM');
    if (numEntry) {
      const inner = numEntry.ContentSequence;
      const innerArray: unknown[] = Array.isArray(inner)
        ? inner
        : inner
          ? [inner]
          : [];
      numEntry.ContentSequence = [...innerArray, scoordPlain];
    } else {
      entries.push(scoordPlain);
    }

    if (splineType) {
      const splineTypeObsContext = {
        RelationshipType: valueTypes.RelationshipTypes.HAS_OBS_CONTEXT,
        ValueType: 'TEXT',
        ConceptNameCodeSequence: {
          CodeValue: SPLINE_TYPE_CODE.value,
          CodingSchemeDesignator: SPLINE_TYPE_CODE.schemeDesignator,
          CodeMeaning: SPLINE_TYPE_CODE.meaning,
        },
        TextValue: splineType,
      };
      const hasObsContextIndex = entries.findIndex(
        (e) =>
          (e as Record<string, string>).RelationshipType ===
          valueTypes.RelationshipTypes.HAS_OBS_CONTEXT
      );
      const insertIndex = hasObsContextIndex >= 0 ? hasObsContextIndex + 2 : 2;
      entries.splice(insertIndex, 0, splineTypeObsContext);
    }

    return entries;
  }
}
