import { utilities as csUtilities } from '@cornerstonejs/core';
import CORNERSTONE_3D_TAG from './cornerstone3DTag';
import MeasurementReport, {
  type AdapterOptions,
  type MeasurementAdapter,
} from './MeasurementReport';
import { toArray, toScoords } from '../helpers';

export type Point = {
  x: number;
  y: number;
  z?: number;
};

export type TID300Arguments = {
  points?: Point[];
  point1?: Point;
  point2?: Point;
  trackingIdentifierTextValue: string;
  findingSites: [];
  finding;

  [key: string]: unknown;
};

/**
 * This is a basic definition of adapters to be inherited for other adapters.
 */
export default class BaseAdapter3D {
  public static toolType: string;
  public static TID300Representation;
  public static trackingIdentifierTextValue: string;
  public static trackingIdentifiers: Set<string>;

  /**
   * The parent type is another type which could be used to parse this instance,
   * but for which this sub-class has a better representation.  For example,
   * key images are parseable as Probe instances, but are represented as a different tool
   * Thus, the name for the key image is `Cornerstone3DTag:Probe:KeyImage` so that
   * a prefix query testing just the Probe could parse this object and display it,
   * but a better/full path key could also be done.
   */
  public static parentType: string;

  public static registerType(code = '', type = '', count = 0) {
    let key = code;
    if (type) {
      key = `${key}${key.length ? '-' : ''}${type}`;
    }
    if (count) {
      key = `${key}${key.length ? '-' : ''}${count}`;
    }
    MeasurementReport.registerAdapterTypes(this, key);
  }

  public static getPointsCount(graphicItem) {
    const is3DMeasurement = graphicItem.ValueType === 'SCOORD3D';
    const pointSize = is3DMeasurement ? 3 : 2;
    return graphicItem.GraphicData.length / pointSize;
  }

  public static getGraphicItems(measurementGroup, filter) {
    const items = toArray(measurementGroup.ContentSequence).filter(
      (group) => group.ValueType === 'SCOORD' || group.ValueType === 'SCOORD3D'
    );
    return filter ? items.filter(filter) : items;
  }

  public static getGraphicItem(measurementGroup, offset = 0, type = null) {
    const items = this.getGraphicItems(
      measurementGroup,
      type && ((group) => group.ValueType === type)
    );
    return items[offset];
  }

  public static getGraphicCode(graphicItem) {
    const { ConceptNameCodeSequence: conceptNameItem } = graphicItem;
    const {
      CodeValue: graphicValue,
      CodingSchemeDesignator: graphicDesignator,
    } = conceptNameItem;
    return `${graphicDesignator}:${graphicValue}`;
  }

  public static getGraphicType(graphicItem) {
    return graphicItem.GraphicType;
  }

  public static isValidMeasurement(_measurementGroup) {
    return false;
  }

  public static init(
    toolType: string,
    representation,
    options?: AdapterOptions
  ) {
    this.toolType = toolType;
    if (BaseAdapter3D.toolType) {
      throw new Error(
        `Base adapter tool type set to ${this.toolType} while setting ${toolType}`
      );
    }
    this.parentType = options?.parentType;
    this.trackingIdentifiers = new Set<string>();

    this.TID300Representation = representation;
    if (this.parentType) {
      this.trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${this.parentType}:${this.toolType}`;
      const alternateTrackingIdentifier = `${CORNERSTONE_3D_TAG}:${this.toolType}`;
      this.trackingIdentifiers.add(alternateTrackingIdentifier);
    } else {
      this.trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${toolType}`;
    }
    this.trackingIdentifiers.add(this.trackingIdentifierTextValue);
    MeasurementReport.registerTool(this);
  }

  /**
   * registerLegacy registers the given tool adapter using the legacy/old
   * cornerstone 1.x adapter names so that the adapter class will be used to load
   * those older adapters.
   */
  public static registerLegacy() {
    this.trackingIdentifiers.add(`cornerstoneTools@^4.0.0:${this.toolType}`);
  }

  /** Registers a new copy of the given type that has the prefix path the
   * same as that of adapter, but adds the toolType to this path to create
   * a new tool instance of the given type.  This preserves compatibility
   * with parsing in other versions, without need to replace the original parent
   * type.
   */
  public static registerSubType(
    adapter: MeasurementAdapter,
    toolType: string,
    replace?
  ) {
    const subAdapter = Object.create(adapter);
    subAdapter.init(toolType, adapter.TID300Representation, {
      parentType: adapter.parentType || adapter.toolType,
      replace,
    });
    return subAdapter;
  }

  /**
   * @returns true if the tool is of the given tool type based on the tracking identifier
   */
  public static isValidCornerstoneTrackingIdentifier(
    trackingIdentifier: string
  ) {
    if (this.trackingIdentifiers.has(trackingIdentifier)) {
      return true;
    }
    if (!trackingIdentifier.includes(':')) {
      return false;
    }

    return trackingIdentifier.startsWith(this.trackingIdentifierTextValue);
  }

  /**
   * Returns annotation data for CS3D to use based on the underlying
   * DICOM SR annotation data.
   */
  public static getMeasurementData(
    MeasurementGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    trackingIdentifier?: string
  ) {
    const { defaultState: state, ReferencedFrameNumber } =
      MeasurementReport.getSetupMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata,
        this.toolType
      );

    state.annotation.data = {
      cachedStats: {},
      frameNumber: ReferencedFrameNumber,
      seriesLevel: trackingIdentifier?.indexOf(':Series') > 0,
    };

    return state;
  }

  public static getTID300RepresentationArguments(
    tool,
    is3DMeasurement = false
  ): TID300Arguments {
    const { metadata } = tool;
    const { finding, findingSites } = tool;
    const { referencedImageId } = metadata;
    const scoordProps = {
      is3DMeasurement,
      referencedImageId,
    };

    // Using image coordinates for 2D points
    const pointsImage = toScoords(scoordProps, tool.data.handles.points);

    const tidArguments = {
      points: pointsImage,
      trackingIdentifierTextValue: this.trackingIdentifierTextValue,
      findingSites: findingSites || [],
      finding,
      ReferencedFrameOfReferenceUID: is3DMeasurement
        ? metadata.FrameOfReferenceUID
        : null,
    };

    return tidArguments;
  }

  /**
   * Retrieve cached stats using either the referenced imageId
   * or the volumeId, depending on which key was used to store them.
   *
   * The lookup order is:
   * 1. The `imageId:<referencedImageId>` key.
   * 2. With `metadata.volumeId`: the exact view reference key
   *    (`getVolumeViewReferenceId`), then any key of the same volume. The
   *    second step is for annotations without a `sliceIndex`, for example
   *    annotations from an earlier version.
   * 3. Without `metadata.volumeId`: the first `volumeId:` key, in the
   *    insertion order of `cachedStats`, whose `sliceIndex` is equal to
   *    `metadata.sliceIndex` and whose `viewPlaneNormal` is equal to
   *    `metadata.viewPlaneNormal` within 1e-3 per component.
   * 4. The `frameOfReference:<FrameOfReferenceUID>` key, which holds the
   *    statistics read from an SR that references the frame of reference
   *    only (SCOORD3D), until a viewport computes them.
   *
   * Step 3 is for MPR annotations from `createAnnotationForViewport`, which
   * deletes `volumeId` so that the annotation applies to all volumes of the
   * frame of reference. The normal is compared as numbers and not as the
   * formatted key text, because the key rounds each component to 3 decimals,
   * and a small camera difference can give a different text (for example
   * `-0.000` and `0.000`). With two volumes on the same plane (fusion), the
   * statistics of the first key are used: the volume whose statistics were
   * computed first.
   *
   * @param cachedStats - The annotation cachedStats keyed by target id
   * @param metadata - The annotation metadata
   * @returns The cached stats for the annotation target, or an empty object
   */
  public static getCachedStats(cachedStats, metadata) {
    const {
      referencedImageId,
      volumeId,
      sliceIndex,
      viewPlaneNormal,
      FrameOfReferenceUID,
    } = metadata;
    const imageStats = cachedStats[`imageId:${referencedImageId}`];
    if (imageStats) {
      return imageStats;
    }
    const frameOfReferenceStats =
      cachedStats[`frameOfReference:${FrameOfReferenceUID}`] || {};

    if (!volumeId) {
      const targetId =
        viewPlaneNormal &&
        Object.keys(cachedStats).find((key) => {
          const match = key.match(
            /^volumeId:.*[?&]sliceIndex=([^&]*)&viewPlaneNormal=([^&]*)$/
          );
          return (
            match &&
            Number(match[1]) === sliceIndex &&
            csUtilities.isEqual(
              match[2].split(',').map(Number),
              viewPlaneNormal,
              1e-3
            )
          );
        });
      return cachedStats[targetId] || frameOfReferenceStats;
    }

    if (viewPlaneNormal) {
      const viewReferenceId = csUtilities.getVolumeViewReferenceId({
        volumeId,
        sliceIndex,
        viewPlaneNormal,
      });
      if (cachedStats[viewReferenceId]) {
        return cachedStats[viewReferenceId];
      }
    }

    const targetId = Object.keys(cachedStats).find(
      (key) =>
        key.startsWith('volumeId:') && csUtilities.getVolumeId(key) === volumeId
    );

    return cachedStats[targetId] || frameOfReferenceStats;
  }
}
