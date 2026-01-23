import {
  normalizers,
  data,
  utilities as dcmjsUtilities,
  derivations,
} from 'dcmjs';
import {
  cache,
  Enums,
  utilities as csUtilities,
  type Types as CSTypes,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/tools';

import CORNERSTONE_3D_TAG from './cornerstone3DTag';
import {
  toArray,
  codeMeaningEquals,
  copyStudyTags,
  scoordToWorld,
} from '../helpers';
import Cornerstone3DCodingScheme from './CodingScheme';
import { copySeriesTags } from '../helpers/copySeriesTags';
import { toPoint3 } from '../helpers/toPoint3';
import {
  COMMENT_CODE,
  metaSRAnnotation,
  NO_IMAGE_ID,
  TEXT_ANNOTATION_POSITION,
} from './constants';
import LabelData from './LabelData';

const { MetadataModules } = Enums;

type Annotation = Types.Annotation;

const { TID1500, addAccessors } = dcmjsUtilities;

const { StructuredReport } = derivations;

const { Normalizer } = normalizers;

const { TID1500MeasurementReport, TID1501MeasurementGroup } = TID1500;

const { DicomMetaDictionary } = data;

const FINDING = { CodingSchemeDesignator: 'DCM', CodeValue: '121071' };
const COMMENT = {
  CodingSchemeDesignator: COMMENT_CODE.schemeDesignator,
  CodeValue: COMMENT_CODE.value,
};
const COMMENT_POSITION = {
  CodingSchemeDesignator: TEXT_ANNOTATION_POSITION.schemeDesignator,
  CodeValue: TEXT_ANNOTATION_POSITION.value,
};

const FINDING_SITE = { CodingSchemeDesignator: 'SCT', CodeValue: '363698007' };
const FINDING_SITE_OLD = { CodingSchemeDesignator: 'SRT', CodeValue: 'G-C0E3' };

type SpatialCoordinatesState = {
  description?: string;
  sopInstanceUid?: string;
  annotation: Annotation;
  finding?: unknown;
  findingSites?: unknown;
  commentGroup?;
  commentPositionGroup?;
};

type ScoordType = {
  GraphicData: number[];
};

type SetupMeasurementData = {
  defaultState: SpatialCoordinatesState;
  state?: SpatialCoordinatesState;
  is3DMeasurement?: boolean;
  scoord?: ScoordType;
  worldCoords?: CSTypes.Point3[];
  scoordArgs?: {
    referencedImageId: string;
    is3DMeasurement: boolean;
  };
  NUMGroup: {
    MeasuredValueSequence: {
      MeasurementUnitsCodeSequence: { CodeValue: string };
      NumericValue: number;
    };
  };
  SCOORDGroup?: ScoordType;
  ReferencedSOPSequence?: Record<string, unknown>;
  ReferencedSOPInstanceUID?: string;
  referencedImageId?: string;
  textBoxPosition?: ScoordType;
  ReferencedFrameNumber?: string;
  SCOORD3DGroup?: ScoordType;
  FrameOfReferenceUID?: string;
};

type SpatialCoordinatesData = Omit<
  SetupMeasurementData,
  'defaultState' | 'NUMGroup'
> & {
  state: SpatialCoordinatesState;
};

export type AdapterOptions = {
  /**
   * The parent type is another type which could be used to parse this instance,
   * but for which this sub-class has a better representation.  For example,
   * key images are parseable as Probe instances, but are represented as a different tool
   * Thus, the name for the key image is `Cornerstone3DTag:Probe:KeyImage` so that
   * a prefix query testing just the Probe could parse this object and display it,
   * but a better/full path key could also be done.
   */
  parentType?: string;

  /**
   * If set, then replace this
   */
  replace?: boolean | ((original: MeasurementAdapter) => void);
};

/**
 * A measurement adapter parses/creates data for DICOM SR measurements
 */
export interface MeasurementAdapter {
  toolType: string;
  TID300Representation;
  trackingIdentifierTextValue: string;
  trackingIdentifiers: Set<string>;

  /**
   * The parent type is the base type of the adapter that is used for the
   * identifier, being compatible with older versions to read that subtype.
   */
  parentType: string;

  /**
   * Applies the options and registers this tool
   */
  init(toolType: string, representation, options?: AdapterOptions);

  getMeasurementData(
    measurementGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    trackingIdentifier: string
  );

  isValidCornerstoneTrackingIdentifier(trackingIdentifier: string): boolean;

  isValidMeasurement(measurementGroup): boolean;

  getTID300RepresentationArguments(
    tool,
    is3DMeasurement
  ): Record<string, unknown>;
}

export default class MeasurementReport {
  public static CORNERSTONE_3D_TAG = CORNERSTONE_3D_TAG;

  /** Maps tool type to the adapter name used to serialize this item to SR */
  public static measurementAdapterByToolType = new Map<
    string,
    MeasurementAdapter
  >();

  /** Maps tool type to the adapter name used to serialize this item to SR */
  public static measurementAdaptersByType = new Map<
    string,
    MeasurementAdapter[]
  >();

  /** Maps tracking identifier to tool class to deserialize from SR into a tool instance */
  public static measurementAdapterByTrackingIdentifier = new Map<
    string,
    MeasurementAdapter
  >();

  public static getTID300ContentItem(
    tool,
    ReferencedSOPSequence,
    toolClass,
    is3DMeasurement
  ) {
    const args = toolClass.getTID300RepresentationArguments(
      tool,
      is3DMeasurement
    );
    args.ReferencedSOPSequence = ReferencedSOPSequence;
    if (args.use3DSpatialCoordinates) {
      args.ReferencedFrameOfReferenceUID = tool.metadata.FrameOfReferenceUID;
    }

    const tid300Measurement = new toolClass.TID300Representation(args);
    const labelMeasurement = new LabelData(tid300Measurement, tool);
    return labelMeasurement;
  }

  public static codeValueMatch = (group, code, oldCode?) => {
    const { ConceptNameCodeSequence } = group;
    if (!ConceptNameCodeSequence) {
      return;
    }
    const { CodingSchemeDesignator, CodeValue } = ConceptNameCodeSequence;
    return (
      (CodingSchemeDesignator == code.CodingSchemeDesignator &&
        CodeValue == code.CodeValue) ||
      (oldCode &&
        CodingSchemeDesignator == oldCode.CodingSchemeDesignator &&
        CodeValue == oldCode.CodeValue)
    );
  };

  public static getMeasurementGroup(
    toolType,
    toolData,
    ReferencedSOPSequence,
    is3DMeasurement
  ) {
    const toolTypeData = toolData[toolType];
    const toolClass = this.measurementAdapterByToolType.get(toolType);
    if (
      !toolTypeData ||
      !toolTypeData.data ||
      !toolTypeData.data.length ||
      !toolClass
    ) {
      return;
    }

    // Loop through the array of tool instances
    // for this tool
    const Measurements = toolTypeData.data.map((tool) => {
      return this.getTID300ContentItem(
        tool,
        ReferencedSOPSequence,
        toolClass,
        is3DMeasurement
      );
    });

    return new TID1501MeasurementGroup(Measurements);
  }

  static getCornerstoneLabelFromDefaultState(defaultState) {
    const { findingSites = [], finding, commentGroup } = defaultState;

    if (commentGroup?.TextValue) {
      return commentGroup.TextValue;
    }

    const cornersoneFreeTextCodingValue =
      Cornerstone3DCodingScheme.codeValues.CORNERSTONEFREETEXT;

    const freeTextLabel = findingSites.find(
      (fs) => fs.CodeValue === cornersoneFreeTextCodingValue
    );

    if (freeTextLabel) {
      return freeTextLabel.CodeMeaning;
    }

    if (finding && finding.CodeValue === cornersoneFreeTextCodingValue) {
      return finding.CodeMeaning;
    }
  }

  /**
   * @deprecated in favour of the constants version
   */
  static generateDatasetMeta() {
    return metaSRAnnotation;
  }

  static generateDerivationSourceDataset = (instance) => {
    const studyTags = copyStudyTags(instance);
    const seriesTags = copySeriesTags(instance);

    return { ...studyTags, ...seriesTags };
  };

  public static processSCOORDGroup({
    SCOORDGroup,
    toolType,
    sopInstanceUIDToImageIdMap,
    metadata,
  }) {
    const { ReferencedSOPSequence } = SCOORDGroup.ContentSequence;
    const { ReferencedSOPInstanceUID, ReferencedFrameNumber = 1 } =
      ReferencedSOPSequence;

    const referencedImageId =
      sopInstanceUIDToImageIdMap[
        `${ReferencedSOPInstanceUID}:${ReferencedFrameNumber}`
      ];
    const imagePlaneModule = metadata.get(
      'imagePlaneModule',
      referencedImageId
    );

    const annotationUID = DicomMetaDictionary.uid();
    return {
      SCOORDGroup,
      ReferencedSOPSequence,
      ReferencedSOPInstanceUID,
      ReferencedFrameNumber,
      referencedImageId,
      state: {
        description: undefined,
        sopInstanceUid: ReferencedSOPInstanceUID,
        annotation: {
          data: {
            annotationUID,
            cachedStats: {},
            handles: {
              activeHandleIndex: 0,
              textBox: {
                hasMoved: false,
              },
            },
          },
          annotationUID,
          metadata: {
            toolName: toolType,
            referencedImageId,
            FrameOfReferenceUID: imagePlaneModule.frameOfReferenceUID,
          },
        },
      },
    };
  }

  public static processSCOORD3DGroup({
    SCOORD3DGroup,
    toolType,
  }): SpatialCoordinatesData {
    const annotationUID = DicomMetaDictionary.uid();
    const toolData = {
      SCOORD3DGroup,
      FrameOfReferenceUID: SCOORD3DGroup.ReferencedFrameOfReferenceUID,
      state: {
        description: undefined,
        annotation: {
          annotationUID,
          data: {
            annotationUID,
            cachedStats: {},
            handles: {
              activeHandleIndex: 0,
              textBox: {
                hasMoved: false,
              },
            },
          },
          metadata: {
            toolName: toolType,
            FrameOfReferenceUID: SCOORD3DGroup.ReferencedFrameOfReferenceUID,
          },
        },
      },
    };
    csUtilities.updatePlaneRestriction(
      toPoint3(SCOORD3DGroup.GraphicData),
      toolData.state.annotation.metadata
    );

    return toolData;
  }

  public static getSpatialCoordinatesState({
    NUMGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    toolType,
  }): SpatialCoordinatesData {
    const contentSequenceArr = toArray(NUMGroup.ContentSequence);
    const SCOORDGroup = contentSequenceArr.find(
      (group) => group.ValueType === 'SCOORD'
    );
    const SCOORD3DGroup = contentSequenceArr.find(
      (group) => group.ValueType === 'SCOORD3D'
    );

    const result: SpatialCoordinatesData =
      (SCOORD3DGroup &&
        this.processSCOORD3DGroup({
          SCOORD3DGroup,
          toolType,
        })) ||
      (SCOORDGroup &&
        this.processSCOORDGroup({
          SCOORDGroup,
          toolType,
          metadata,
          sopInstanceUIDToImageIdMap,
        }));
    if (!result) {
      throw new Error('No spatial coordinates group found.');
    }

    return result;
  }

  public static processSpatialCoordinatesGroup({
    NUMGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    findingGroup,
    findingSiteGroups,
    commentGroup,
    commentPositionGroup,
    toolType,
  }) {
    const {
      state,
      SCOORDGroup,
      ReferencedSOPSequence,
      ReferencedSOPInstanceUID,
      ReferencedFrameNumber,
      SCOORD3DGroup,
      FrameOfReferenceUID,
      referencedImageId,
      textBoxPosition,
    } = this.getSpatialCoordinatesState({
      NUMGroup,
      sopInstanceUIDToImageIdMap,
      metadata,
      toolType,
    });

    const finding = findingGroup
      ? addAccessors(findingGroup.ConceptCodeSequence)
      : undefined;
    const findingSites = findingSiteGroups.map((fsg) => {
      return addAccessors(fsg.ConceptCodeSequence);
    });

    if (commentPositionGroup) {
      state.commentPositionGroup = commentPositionGroup;
      const textBoxCoords = scoordToWorld(
        {
          is3DMeasurement: !referencedImageId,
          referencedImageId,
        },
        commentPositionGroup
      );
      state.annotation.data.handles.textBox = {
        hasMoved: true,
        worldPosition: textBoxCoords[0],
      };
    }

    state.finding = finding;
    state.findingSites = findingSites;
    state.commentGroup = commentGroup;
    state.commentPositionGroup = commentPositionGroup;

    if (finding) {
      state.description = finding.CodeMeaning;
    }

    state.annotation.data.label =
      this.getCornerstoneLabelFromDefaultState(state);

    return {
      // Deprecating the defaultState in favour of state, but there are lots
      // of adapters still using defaultState
      defaultState: state,
      state,
      NUMGroup,
      scoord: SCOORD3DGroup || SCOORDGroup,
      SCOORDGroup,
      ReferencedSOPSequence,
      ReferencedSOPInstanceUID,
      referencedImageId,
      textBoxPosition,
      ReferencedFrameNumber,
      SCOORD3DGroup,
      FrameOfReferenceUID,
    };
  }

  public static getSetupMeasurementData(
    MeasurementGroup,
    sopInstanceUIDToImageIdMap,
    metadata,
    toolType
  ): SetupMeasurementData {
    const { ContentSequence } = MeasurementGroup;

    const contentSequenceArr = toArray(ContentSequence);
    const findingGroup = contentSequenceArr.find((group) =>
      this.codeValueMatch(group, FINDING)
    );
    const commentGroup = contentSequenceArr.find((group) =>
      this.codeValueMatch(group, COMMENT)
    );
    const commentPositionGroup = contentSequenceArr.find((group) =>
      this.codeValueMatch(group, COMMENT_POSITION)
    );
    const findingSiteGroups =
      contentSequenceArr.filter((group) =>
        this.codeValueMatch(group, FINDING_SITE, FINDING_SITE_OLD)
      ) || [];
    const NUMGroup = contentSequenceArr.find(
      (group) => group.ValueType === 'NUM'
    ) || {
      ContentSequence: contentSequenceArr.filter(
        (group) =>
          group.ValueType === 'SCOORD' || group.ValueType === 'SCOORD3D'
      ),
    };

    const spatialGroup = this.processSpatialCoordinatesGroup({
      NUMGroup,
      sopInstanceUIDToImageIdMap,
      metadata,
      findingGroup,
      findingSiteGroups,
      commentGroup,
      commentPositionGroup,
      toolType,
    });

    const { referencedImageId } = spatialGroup.state.annotation.metadata;
    const is3DMeasurement = !!spatialGroup.SCOORD3DGroup;
    const scoordArgs = {
      referencedImageId,
      is3DMeasurement,
    };
    const scoord = spatialGroup.SCOORD3DGroup || spatialGroup.SCOORDGroup;
    const worldCoords = scoordToWorld(scoordArgs, scoord);

    return {
      ...spatialGroup,
      is3DMeasurement,
      scoordArgs,
      scoord,
      worldCoords,
    };
  }

  static generateReferencedSOPSequence({
    toolData,
    toolTypes,
    metadataProvider,
    imageId,
    sopInstanceUIDsToSeriesInstanceUIDMap,
    derivationSourceDatasets,
  }) {
    const effectiveImageId =
      imageId === NO_IMAGE_ID
        ? this.getImageIdFromVolume({ toolData, toolTypes })
        : imageId;

    const sopCommonModule = metadataProvider.get(
      'sopCommonModule',
      effectiveImageId
    );
    const instance = metadataProvider.get('instance', effectiveImageId);

    const { sopInstanceUID, sopClassUID } = sopCommonModule;
    const { SeriesInstanceUID: seriesInstanceUID } = instance;

    sopInstanceUIDsToSeriesInstanceUIDMap[sopInstanceUID] = seriesInstanceUID;

    if (
      !derivationSourceDatasets.find(
        (dsd) => dsd.SeriesInstanceUID === seriesInstanceUID
      )
    ) {
      // Entry not present for series, create one.
      const derivationSourceDataset =
        MeasurementReport.generateDerivationSourceDataset(instance);

      derivationSourceDatasets.push(derivationSourceDataset);
    }

    const frameNumber = metadataProvider.get('frameNumber', effectiveImageId);

    const ReferencedSOPSequence = {
      ReferencedSOPClassUID: sopClassUID,
      ReferencedSOPInstanceUID: sopInstanceUID,
      ReferencedFrameNumber: undefined,
    };

    if (
      (instance && instance.NumberOfFrames && instance.NumberOfFrames > 1) ||
      Normalizer.isMultiframeSOPClassUID(sopClassUID)
    ) {
      ReferencedSOPSequence.ReferencedFrameNumber = frameNumber;
    }

    return ReferencedSOPSequence;
  }

  static getImageIdFromVolume({ toolData, toolTypes }) {
    const referenceToolData = toolData?.[toolTypes?.[0]]?.data?.[0];
    const volumeId = referenceToolData?.metadata?.volumeId;
    const volume = cache.getVolume(volumeId);
    if (!volume) {
      throw new Error(`No volume found for ${volumeId}`);
    }
    const imageId = volume.imageIds[0];
    return imageId;
  }

  static generateReport(toolState, metadataProvider, options) {
    // ToolState for array of imageIDs to a Report
    // Assume Cornerstone metadata provider has access to Study / Series / Sop Instance UID
    let allMeasurementGroups = [];

    /* Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Date
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Time
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study ID
        */

    const sopInstanceUIDsToSeriesInstanceUIDMap = {};
    const derivationSourceDatasets = [];

    const _meta = MeasurementReport.generateDatasetMeta();
    let is3DSR = false;

    // Loop through each image in the toolData
    Object.keys(toolState).forEach((imageId) => {
      const toolData = toolState[imageId];
      const toolTypes = Object.keys(toolData);
      const is3DMeasurement = imageId === NO_IMAGE_ID;

      const ReferencedSOPSequence = this.generateReferencedSOPSequence({
        toolData,
        toolTypes,
        metadataProvider,
        imageId,
        sopInstanceUIDsToSeriesInstanceUIDMap,
        derivationSourceDatasets,
      });

      if (is3DMeasurement) {
        is3DSR = true;
      }

      // Loop through each tool type for the image
      const measurementGroups = [];

      toolTypes.forEach((toolType) => {
        const group = this.getMeasurementGroup(
          toolType,
          toolData,
          ReferencedSOPSequence,
          is3DMeasurement
        );
        if (group) {
          measurementGroups.push(group);
        }
      });

      allMeasurementGroups = allMeasurementGroups.concat(measurementGroups);
    });

    const tid1500MeasurementReport = new TID1500MeasurementReport(
      { TID1501MeasurementGroups: allMeasurementGroups },
      options
    );

    const report = new StructuredReport(derivationSourceDatasets, options);

    const contentItem = tid1500MeasurementReport.contentItem(
      derivationSourceDatasets,
      { ...options, sopInstanceUIDsToSeriesInstanceUIDMap }
    );

    // Merge the derived dataset with the content from the Measurement Report
    report.dataset = Object.assign(report.dataset, contentItem);
    report.dataset._meta = _meta;
    report.SpecificCharacterSet = 'ISO_IR 192';

    report.dataset.InstanceNumber ||= options.InstanceNumber || 1;
    if (options.predecessorImageId) {
      Object.assign(
        report.dataset,
        metadataProvider.get(
          MetadataModules.PREDECESSOR_SEQUENCE,
          options.predecessorImageId
        )
      );
    }

    if (is3DSR) {
      report.dataset.SOPClassUID =
        DicomMetaDictionary.sopClassUIDsByName.Comprehensive3DSR;
      if (!report.dataset.SOPClassUID) {
        throw new Error(
          `NO sop class defined for Comprehensive3DSR in ${JSON.stringify(
            DicomMetaDictionary.sopClassUIDsByName
          )}`
        );
      }
    }

    return report;
  }

  /**
   * Generate Cornerstone tool state from dataset
   */
  static generateToolState(
    dataset,
    sopInstanceUIDToImageIdMap,
    metadata,
    hooks
  ) {
    // For now, bail out if the dataset is not a TID1500 SR with length measurements
    if (dataset.ContentTemplateSequence.TemplateIdentifier !== '1500') {
      throw new Error(
        'This package can currently only interpret DICOM SR TID 1500'
      );
    }

    const REPORT = 'Imaging Measurements';
    const GROUP = 'Measurement Group';
    const TRACKING_IDENTIFIER = 'Tracking Identifier';
    const TRACKING_UNIQUE_IDENTIFIER = 'Tracking Unique Identifier';
    const { imageId: predecessorImageId } = dataset;

    // Identify the Imaging Measurements
    const imagingMeasurementContent = toArray(dataset.ContentSequence).find(
      codeMeaningEquals(REPORT)
    );

    // Retrieve the Measurements themselves
    const measurementGroups = toArray(
      imagingMeasurementContent.ContentSequence
    ).filter(codeMeaningEquals(GROUP));

    // For each of the supported measurement types, compute the measurement data
    const measurementData = {};

    measurementGroups.forEach((measurementGroup) => {
      try {
        const measurementGroupContentSequence = toArray(
          measurementGroup.ContentSequence
        );

        const trackingIdentifierGroup = measurementGroupContentSequence.find(
          (contentItem) =>
            contentItem.ConceptNameCodeSequence.CodeMeaning ===
            TRACKING_IDENTIFIER
        );

        const { TextValue: trackingIdentifierValue } = trackingIdentifierGroup;

        const trackingUniqueIdentifierGroup =
          measurementGroupContentSequence.find(
            (contentItem) =>
              contentItem.ConceptNameCodeSequence.CodeMeaning ===
              TRACKING_UNIQUE_IDENTIFIER
          );

        const trackingUniqueIdentifierValue =
          trackingUniqueIdentifierGroup?.UID;

        const toolAdapter =
          hooks?.getToolClass?.(
            measurementGroup,
            dataset,
            this.measurementAdapterByToolType
          ) ||
          this.getAdapterForTrackingIdentifier(trackingIdentifierValue) ||
          this.getAdapterForCodeType(measurementGroup);

        if (toolAdapter) {
          const measurement = toolAdapter.getMeasurementData(
            measurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            trackingIdentifierValue
          );

          measurement.TrackingUniqueIdentifier = trackingUniqueIdentifierValue;
          measurement.predecessorImageId = predecessorImageId;

          console.log(`=== ${toolAdapter.toolType} ===`);
          console.log(measurement);
          measurementData[toolAdapter.toolType] ||= [];
          measurementData[toolAdapter.toolType].push(measurement);
        }
      } catch (e) {
        console.warn('Unable to generate tool state for', measurementGroup, e);
      }
    });

    // NOTE: There is no way of knowing the cornerstone imageIds as that could be anything.
    // That is up to the consumer to derive from the SOPInstanceUIDs.
    return measurementData;
  }

  /**
   * Register a new tool type.
   * @param toolAdapter to perform I/O to DICOM for this tool
   */
  public static registerTool(
    toolAdapter: MeasurementAdapter,
    replace: boolean | ((original) => void) = false
  ) {
    const registerName = toolAdapter.toolType;
    if (this.measurementAdapterByToolType.has(registerName)) {
      if (!replace) {
        throw new Error(
          `The registered tool name ${registerName} already exists in adapters, use a different toolType or use replace`
        );
      }
      if (typeof replace === 'function') {
        // Call the function so it can call parent output
        replace(this.measurementAdapterByToolType.get(registerName));
      }
    }
    this.measurementAdapterByToolType.set(toolAdapter.toolType, toolAdapter);
    this.measurementAdapterByTrackingIdentifier.set(
      toolAdapter.trackingIdentifierTextValue,
      toolAdapter
    );
  }

  public static registerTrackingIdentifier(
    toolClass,
    ...trackingIdentifiers: string[]
  ) {
    for (const identifier of trackingIdentifiers) {
      this.measurementAdapterByTrackingIdentifier.set(identifier, toolClass);
    }
  }

  public static getAdapterForTrackingIdentifier(trackingIdentifier: string) {
    const adapter =
      this.measurementAdapterByTrackingIdentifier.get(trackingIdentifier);
    if (adapter) {
      return adapter;
    }
    for (const adapterTest of [...this.measurementAdapterByToolType.values()]) {
      if (
        adapterTest.isValidCornerstoneTrackingIdentifier(trackingIdentifier)
      ) {
        this.measurementAdapterByTrackingIdentifier.set(
          trackingIdentifier,
          adapterTest
        );
        return adapterTest;
      }
    }
  }

  /**
   * This will use the adapter types to figure out which adapters might be
   * able to convert this object.
   */
  public static getAdapterForCodeType(measurementGroup) {
    for (const adapter of this.measurementAdapterByTrackingIdentifier.values()) {
      if (adapter.isValidMeasurement(measurementGroup)) {
        return adapter;
      }
    }
  }

  /**
   * Register an adapter by type
   * This will be some combination of the graphic code, type and point count.
   * Only the most specific variants should be registered, unless the more
   * general variants can be handled.
   */
  public static registerAdapterTypes(adapter, ...types) {
    for (const type of types) {
      if (!this.measurementAdaptersByType.has(type)) {
        this.measurementAdaptersByType.set(type, []);
      }
      const adapters = this.measurementAdaptersByType.get(type);
      if (adapters.indexOf(adapter) === -1) {
        adapters.push(adapter);
      }
    }
  }

  /**
   * Finds possible adapters for the point types
   *
   * @param graphicCode - in the designator:value format
   * @param graphicType - as one of the allowed graphic type values
   * @param pointCount - a number indicating how many points were found
   * @returns An array of adapters that might handle this type
   */
  public static getAdaptersForTypes(
    graphicCode: string,
    graphicType: string,
    pointCount: number
  ) {
    const adapters = [];

    appendList(
      adapters,
      this.measurementAdaptersByType.get(
        `${graphicCode}-${graphicType}-${pointCount}`
      )
    );
    appendList(
      adapters,
      this.measurementAdaptersByType.get(`${graphicCode}-${graphicType}`)
    );
    appendList(adapters, this.measurementAdaptersByType.get(graphicCode));
    appendList(adapters, this.measurementAdaptersByType.get(graphicType));

    return adapters;
  }
}

function appendList(list, appendList) {
  if (!appendList?.length) {
    return;
  }
  list.push(...appendList);
}
