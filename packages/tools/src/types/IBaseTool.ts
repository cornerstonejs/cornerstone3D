import type { Types } from '@cornerstonejs/core';
import type BaseTool from '../tools/base/BaseTool';
import type { AnnotationData } from './AnnotationTypes';

/**
 * The display set related parameters for one candidate measurement target of
 * a viewport - the information a {@link MeasurementTargetsFilter} decides on.
 *
 * On a volume viewport there is one candidate per (non-segmentation) volume
 * being displayed, so a fusion viewport (eg PT/CT) produces one candidate for
 * each of the fused volumes.  On other viewport types there is a single
 * candidate for the currently displayed data.
 *
 * The display set fields are populated where they are known: `displaySet`,
 * `displaySetUID` and the exemplar `instance` come from the registered
 * display set metadata (or from the instance metadata of the backing
 * volume/image ids).  When the display set is unknown - for example a stack
 * viewport using the legacy set image ids - those fields are absent, and a
 * filter can choose whether to include the candidate based on that.
 */
export type MeasurementTargetCandidate = {
  /**
   * The display set being shown, where registered - an `IDisplaySet` from
   * `@cornerstonejs/metadata` (via the `displaySetModule` metadata module),
   * or the display set registered with the generic viewports.
   */
  displaySet?: unknown;
  /** The uid of the display set, where known. */
  displaySetUID?: string;
  /**
   * An exemplar (first) instance of the display set - naturalized DICOM
   * instance metadata (eg with `Modality`, `Rows`, `SeriesInstanceUID`) -
   * if available.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance?: any;
  /** The index of this display set within the viewport. */
  index: number;
  /** The volume/image id backing this display set, when available. */
  referencedId?: string;
  /**
   * The uid of the segmentation representation backing this candidate, when
   * the actor is a segmentation representation (labelmap etc) rather than a
   * plain image/volume.  Filters use this to include or exclude
   * segmentations; the default `allPixelData` filter excludes them.
   */
  representationUID?: string;
  /**
   * The modality of the display set where available - from the exemplar
   * instance or the backing volume metadata.  Absent when the display set
   * is unknown.
   */
  modality?: string;
  /** The image ids of the display set, when a known display set (or volume)
   * backs the candidate. */
  imageIds?: string[];
  /**
   * The target id used to key the annotation `cachedStats` for this display
   * set.  Internal to the measurement pipeline - filters normally decide on
   * the display set fields instead.
   */
  targetId: string;
};

/**
 * The context passed to the measurement target filters - the viewport being
 * measured together with the tool `configuration` (so a filter can read
 * `configuration.targetPredicate` and any other option) and the annotation
 * `data` when available.
 */
export type MeasurementTargetOptions = {
  /** The viewport the targets are being selected for. */
  viewport: Types.IViewport;
  /** The configuration of the tool the filter is running for. */
  configuration: ToolConfiguration;
  /** The annotation data, when the filter is running for an annotation. */
  data?: AnnotationData;
};

/**
 * A per-candidate decider: returns true to keep a single candidate display
 * set as a measurement target, false to drop it.  Set it on the tool
 * configuration as `targetPredicate` to narrow the targets the
 * `targetsFilter` chooser considers - for example
 * `targetPredicate: measurementTargetFilters.forModality('PT')` restricts a
 * fusion viewport's measurements to its PT volume.
 *
 * A predicate is the simple half of the selection: it decides one candidate
 * at a time and is reused by whichever chooser is configured, so the same
 * `forModality('PT')` predicate yields "the first PT" under
 * {@link MeasurementTargetsFilter} `firstPixelData` and "every PT" under
 * `allPixelData`, without the predicate knowing how many are wanted.
 *
 * The decision should be based on the modality of the display set where
 * available; candidates whose display set is unknown (eg legacy stack image
 * ids) have no `imageIds`/`instance`, letting the predicate choose whether to
 * include them.
 *
 * ```ts
 * import { measurementTargetFilters } from '@cornerstonejs/tools';
 *
 * // Only measure PT on a fusion viewport
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetPredicate: measurementTargetFilters.forModality('PT'),
 * });
 * // Custom predicate
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetPredicate: (candidate) => candidate.modality === 'PT',
 * });
 * ```
 */
export type MeasurementTargetPredicate = (
  candidate: MeasurementTargetCandidate,
  options: MeasurementTargetOptions
) => boolean;

/**
 * A configurable chooser deciding which of the display sets shown in a
 * viewport an annotation tool computes and displays statistics for.  Set it
 * on the tool configuration as `targetsFilter`, either as a function or as
 * the name of one of the ready made `measurementTargetFilters` (eg
 * `targetsFilter: 'firstPixelData'`).
 *
 * The chooser receives the viewport's candidate display sets in viewport
 * order (see {@link MeasurementTargetCandidate}) and the
 * {@link MeasurementTargetOptions}, and returns the subset to measure -
 * normally the input array narrowed (and, if wanted, reordered) with the
 * standard array methods.  A chooser is responsible only for the cardinality
 * (first vs all); the eligibility of an individual candidate is delegated to
 * the configured {@link MeasurementTargetPredicate} (`targetPredicate`), so
 * the two decisions compose independently.
 *
 * Every returned candidate becomes a measurement target: the first one is
 * the primary target returned by `getTargetId`, and each of them has its
 * statistics computed and displayed - even on a single fusion viewport where
 * the other targets have not been computed elsewhere yet.  Returning an
 * empty array means no statistics are computed or displayed for the
 * viewport.
 *
 * See `measurementTargetFilters` for ready made choosers:
 *
 * ```ts
 * import { measurementTargetFilters } from '@cornerstonejs/tools';
 *
 * // Every display set with pixel values (skips SEG etc) - the ROI tools'
 * // default
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.allPixelData,
 * });
 * // The first pixel-data display set only, by name
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: 'firstPixelData',
 * });
 * // Only the PT of a fusion viewport, computed as the primary target
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: 'firstPixelData',
 *   targetPredicate: measurementTargetFilters.forModality('PT'),
 * });
 * ```
 */
export type MeasurementTargetsFilter = (
  candidates: MeasurementTargetCandidate[],
  options: MeasurementTargetOptions
) => MeasurementTargetCandidate[];

/**
 * General tool configuration.  This is intended to be extended
 * by various tools to add the different configuration options.
 */
export interface ToolConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategies: any;
  defaultStrategy?: string;
  activeStrategy?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategyOptions: any;

  /**
   * Chooser deciding how many of the eligible display sets shown in the
   * viewport the tool computes and displays measurement statistics for -
   * first vs all.  A function, or the name of one of the ready made
   * `measurementTargetFilters` (eg `'firstPixelData'`).  See
   * {@link MeasurementTargetsFilter}.
   *
   * The ROI statistics tools default this to
   * `measurementTargetFilters.allPixelData` (every display set containing
   * pixel values); tools without a default chooser use the viewport's single
   * default target.
   */
  targetsFilter?: MeasurementTargetsFilter | string;

  /**
   * Per-candidate predicate narrowing which individual display sets the
   * `targetsFilter` chooser is allowed to select - when unset, every
   * pixel-data display set is kept.  See {@link MeasurementTargetPredicate}.
   *
   * This is the single-candidate decider: set it to
   * `measurementTargetFilters.forModality('PT')` to measure only PT, and the
   * `targetsFilter` chooser decides whether that means the first PT or every
   * PT.
   */
  targetPredicate?: MeasurementTargetPredicate;

  /**
   * @returns true if the given targetId is preferred.
   * @deprecated Use `targetsFilter` instead, which both selects the primary
   * targetId and allows statistics for multiple targets.
   */
  isPreferredTargetId?: (
    viewport,
    /**
     * The target info is a specifier for different types of target information.
     * Right now there is just the single option consisting of an image id and
     * cached stat, but in the future other alternatives might be provided.
     */
    targetInfo: {
      /**
       * The imageId of a cachedStat instance.  This isn't the only way to
       * identify data, but is one possible option.
       */
      imageId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cachedStat: any;
    }
  ) => boolean;
}

export type IBaseTool = BaseTool;
