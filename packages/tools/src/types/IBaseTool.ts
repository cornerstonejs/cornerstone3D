import type { Types } from '@cornerstonejs/core';
import type BaseTool from '../tools/base/BaseTool';

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
  /**
   * The candidate previously chosen (included) by the filter, if any.  This
   * allows a filter to decide relative to what it has already selected -
   * for example to select at most one of a given modality.
   */
  previous?: MeasurementTargetCandidate;
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
 * The value a {@link MeasurementTargetsFilter} returns for one candidate:
 *
 * - `true` - include this display set and continue with the next candidate
 * - `false` (or `undefined`) - skip this display set and continue
 * - `'useAndStop'` - include this display set and **stop looking for further
 *   items**
 * - `'stop'` - do not include this display set and **stop looking for
 *   further items**
 */
export type MeasurementTargetsFilterResult =
  | boolean
  | undefined
  | 'useAndStop'
  | 'stop';

/**
 * A configurable filter deciding which of the display sets shown in a
 * viewport an annotation tool computes and displays statistics for.  Set it
 * on the tool configuration as `targetsFilter`.
 *
 * The filter is called once per candidate display set, in viewport order,
 * with the display set related parameters (display set, uid, exemplar
 * instance, index and the previously chosen candidate) and the viewport it
 * is applying to.  Return {@link MeasurementTargetsFilterResult} values to
 * include/skip each candidate; return `'useAndStop'` or `'stop'` to stop
 * looking for further items.
 *
 * Every included candidate becomes a measurement target: the first one is
 * the primary target returned by `getTargetId`, and each of them has its
 * statistics computed and displayed - even on a single fusion viewport where
 * the other targets have not been computed elsewhere yet.  Including no
 * candidates means no statistics are computed or displayed for the viewport.
 *
 * The decision should be based on the modality of the display set where
 * available; candidates whose display set is unknown (eg legacy stack image
 * ids) have no `imageIds`/`instance`, letting the filter choose whether to
 * include them.
 *
 * See `BaseTool.targetFilters` for ready made filters:
 *
 * ```ts
 * // CT only - shows nothing on viewports without a CT
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: CircleROITool.targetFilters.forModality('CT'),
 * });
 * // PT only - shows nothing on viewports without a PT
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: CircleROITool.targetFilters.forModality('PT'),
 * });
 * // Every display set with pixel values (skips SEG etc) - the ROI tools'
 * // default
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: CircleROITool.targetFilters.allPixelData,
 * });
 * // Just the first display set
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: CircleROITool.targetFilters.first,
 * });
 * // Custom: the first PT display set only, stopping the search once found
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: (displaySetInfo) =>
 *     displaySetInfo.modality === 'PT' ? 'useAndStop' : false,
 * });
 * ```
 */
export type MeasurementTargetsFilter = (
  displaySetInfo: MeasurementTargetCandidate,
  viewport: Types.IViewport
) => MeasurementTargetsFilterResult;

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
   * Filter deciding which display sets shown in the viewport the tool
   * computes and displays measurement statistics for.  See
   * {@link MeasurementTargetsFilter} and `BaseTool.targetFilters`.
   * The ROI statistics tools default this to `targetFilters.allPixelData`
   * (every display set containing pixel values); tools without a default
   * filter use the viewport's single default target.
   */
  targetsFilter?: MeasurementTargetsFilter;

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
