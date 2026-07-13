import {
  cache,
  metaData,
  utilities as csUtils,
  viewportHasPan,
  viewportHasZoom,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import ToolModes from '../../enums/ToolModes';
import type StrategyCallbacks from '../../enums/StrategyCallbacks';
import type {
  InteractionTypes,
  ToolProps,
  PublicToolProps,
  ToolConfiguration,
  AnnotationData,
  MeasurementTargetCandidate,
} from '../../types';

const { DefaultHistoryMemo } = csUtils.HistoryMemo;

/**
 * Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy
 * application.
 */
abstract class BaseTool {
  static toolName;

  /**
   * Set to the tool that is currently drawing the active cursor.  This
   * will be either primary mouse button tool if no tool is currently
   * being directly interacted with, OR the tool that is directly interacted
   * with.  This logic ensures that there is only a single tool at a time
   * drawing, which prevents tools not getting mouse updates from over-writing
   * the cursor.
   *
   * - If the tool bound to the primary button is a cursor drawing tool,
   *   use that tool and there is NOT a tool currently drawing directly
   * - If there is a tool currently drawing directly, then that tool should
   *   display a cursor EVEN if it normally doesn't have a custom cursor
   * - When a tool finishes drawing direct, it should stop being the active
   *   cursor tool unless it is also the primary tool
   */
  public static activeCursorTool;

  /** Supported Interaction Types - currently only Mouse */
  public supportedInteractionTypes: InteractionTypes[];
  /**
   * The configuration for this tool.
   * IBaseTool contains some default configuration values, and you can use
   * configurationTyped to get the typed version of this.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public configuration: Record<string, any>;
  public get configurationTyped() {
    return <ToolConfiguration>this.configuration;
  }

  /** ToolGroup ID the tool instance belongs to */
  public toolGroupId: string;
  /** Tool Mode - Active/Passive/Enabled/Disabled/ */
  public mode: ToolModes;
  /** Primary tool - this is set to true when this tool is primary */
  public isPrimary = false;

  /**
   * A memo recording the starting state of a tool.  This will be updated
   * as changes are made, and reflects the fact that a memo has been created.
   */
  protected memo: csUtils.HistoryMemo.Memo;

  /**
   * Has the defaults associated with the base tool.
   */
  static defaults = {
    configuration: {
      strategies: {},
      defaultStrategy: undefined,
      activeStrategy: undefined,
      strategyOptions: {},
    },
  };

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    const mergedDefaults = BaseTool.mergeDefaultProps(
      BaseTool.defaults,
      defaultToolProps
    );

    const initialProps = csUtils.deepMerge(mergedDefaults, toolProps);

    const {
      configuration = {},
      supportedInteractionTypes,
      toolGroupId,
    } = initialProps;

    this.toolGroupId = toolGroupId;
    this.supportedInteractionTypes = supportedInteractionTypes || [];
    this.configuration = Object.assign({}, configuration);
    this.mode = ToolModes.Disabled;
  }

  /**
   * Does a deep merge of property options.  Allows extending the default values
   * for a child class.
   *
   * @param defaultProps - this is a base set of defaults to merge into
   * @param additionalProps - the additional properties to merge into the default props
   *
   * @returns defaultProps if additional props not defined, or a merge into a new object
   *     containing additionalProps adding onto and overriding defaultProps.
   */
  public static mergeDefaultProps(defaultProps = {}, additionalProps?) {
    if (!additionalProps) {
      return defaultProps;
    }
    return csUtils.deepMerge(defaultProps, additionalProps);
  }

  /**
   * A function generator to test if the target id is the desired one.
   * Used for deciding which set of cached stats is appropriate to display
   * for a given viewport.
   *
   * This relies on the fact that the target id contains a substring which is the
   * desired volume id when the target is a volume.
   * It is also possible to use series query parameters such as `/series/{seriesUID}/`
   * to generate specific series selections within a stack viewport.
   *
   * @deprecated Use the `targetsFilter` configuration option with
   * `measurementTargetFilters.forId` instead.
   */
  public static isSpecifiedTargetId(desiredVolumeId: string) {
    // imageId including the target id is a proxy for testing if the
    // image id is a member of that volume.  This may need to be fixed in the
    // future to add more criteria.
    return (_viewport, { targetId }) => {
      // target ids contain the base information for the volume, so allow specifying
      // preference by desiredVolumeId
      return targetId.includes(desiredVolumeId);
    };
  }

  /**
   * Newer method for getting the tool name as a property
   */
  public get toolName() {
    return this.getToolName();
  }

  /**
   * Returns the name of the tool
   * @returns The name of the tool.
   */
  public getToolName(): string {
    // Since toolName is static we get it from the class constructor
    return (<typeof BaseTool>this.constructor).toolName;
  }

  /**
   * Applies the active strategy function to the enabled element with the specified
   * operation data.
   * @param enabledElement - The element that is being operated on.
   * @param operationData - The data that needs to be passed to the strategy.
   * @returns The result of the strategy.
   */
  public applyActiveStrategy(
    enabledElement: Types.IEnabledElement,
    operationData: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    const { strategies, activeStrategy } = this.configuration;
    return strategies[activeStrategy]?.call(
      this,
      enabledElement,
      operationData
    );
  }

  /**
   * Applies the active strategy, with a given event type being applied.
   * The event type function is found by indexing it on the active strategy
   * function.
   *
   * @param enabledElement - The element that is being operated on.
   * @param operationData - The data that needs to be passed to the strategy.
   * @param callbackType - the type of the callback
   *
   * @returns The result of the strategy.
   */
  public applyActiveStrategyCallback(
    enabledElement: Types.IEnabledElement,
    operationData: unknown,
    callbackType: StrategyCallbacks | string,
    ...extraArgs
  ) {
    const { strategies, activeStrategy } = this.configuration;

    if (!strategies[activeStrategy]) {
      throw new Error(
        `applyActiveStrategyCallback: active strategy ${activeStrategy} not found, check tool configuration or spellings`
      );
    }

    return strategies[activeStrategy][callbackType]?.call(
      this,
      enabledElement,
      operationData,
      ...extraArgs
    );
  }

  /**
   * merges the new configuration with the tool configuration
   * @param configuration - toolConfiguration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public setConfiguration(newConfiguration: Record<string, any>): void {
    this.configuration = csUtils.deepMerge(
      this.configuration,
      newConfiguration
    );
  }

  /**
   * Sets the active strategy for a tool. Strategies are
   * multiple implementations of tool behavior that can be switched by tool
   * configuration.
   *
   * @param strategyName - name of the strategy to be set as active
   */
  public setActiveStrategy(strategyName: string): void {
    this.setConfiguration({ activeStrategy: strategyName });
  }

  /**
   * Get the image that is displayed for the targetId in the cachedStats
   * which can be
   * * `imageId:<imageId>`
   * * `volumeId:<volumeId>`
   * * `videoId:<basePathForVideo>/frames/<frameSpecifier>`
   *
   * @param targetId - annotation targetId stored in the cached stats
   * @returns The image data for the target.
   */
  protected getTargetImageData(
    targetId: string
  ): Types.IImageData | Types.CPUIImageData {
    if (targetId.startsWith('imageId:')) {
      const imageId = targetId.split('imageId:')[1];
      const imageURI = csUtils.imageIdToURI(imageId);
      let viewports = csUtils.getViewportsWithImageURI(imageURI);

      if (!viewports || !viewports.length) {
        return;
      }

      viewports = viewports.filter((viewport) => {
        return viewport.getCurrentImageId() === imageId;
      });

      if (!viewports || !viewports.length) {
        return;
      }

      return viewports[0].getImageData();
    } else if (targetId.startsWith('volumeId:')) {
      const volumeId = csUtils.getVolumeId(targetId);
      const viewports = csUtils.getViewportsWithVolumeId(volumeId);

      if (!viewports || !viewports.length) {
        return;
      }

      // Pass the volumeId so that a viewport displaying several volumes (eg
      // a fusion viewport) returns the image data of this target's volume
      // rather than of its first/default one - otherwise the statistics of
      // every target would be computed over the same (first) volume.
      return (viewports[0] as Types.IVolumeViewport).getImageData(volumeId);
    } else if (targetId.startsWith('videoId:')) {
      // Video id can be multi-valued for the frame information
      const imageURI = csUtils.imageIdToURI(targetId);
      const viewports = csUtils.getViewportsWithImageURI(imageURI);

      if (!viewports || !viewports.length) {
        return;
      }

      return viewports[0].getImageData();
    } else {
      throw new Error(
        'getTargetIdImage: targetId must start with "imageId:" or "volumeId:"'
      );
    }
  }

  /**
   * Get the target Id for the viewport which will be used to store the cached
   * statistics scoped to that target in the annotations.
   * For StackViewport, targetId is usually derived from the imageId.
   * For VolumeViewport, it's derived from the volumeId.
   *
   * This is the primary (first) entry of {@link getMeasurementTargets}, so it
   * honours the `targetsFilter` tool configuration - configuring, for
   * example, `measurementTargetFilters.forModality('PT')` makes the PT volume of a
   * fusion viewport the target the statistics are stored/read for.
   *
   * @param viewport - viewport to get the targetId for
   * @param data - Optional: The annotation's data object, containing cachedStats.
   * @returns targetId, or undefined when a configured filter selects no
   *   targets for this viewport
   */
  protected getTargetId(
    viewport: Types.IViewport,
    data?: AnnotationData
  ): string | undefined {
    return this.getMeasurementTargets(viewport, data)[0];
  }

  /**
   * Gets the array of targetIds the tool should compute and display
   * measurement statistics for on the given viewport.
   *
   * The targets are selected by the `targetsFilter` tool configuration
   * option, called once per candidate display set of the viewport in order
   * (see {@link measurementTargetFilters} for ready made filters).  The filter
   * receives the display set related parameters - including the previously
   * chosen candidate - and the viewport, and returns per candidate whether
   * to include it and whether to stop looking for further items (see
   * {@link MeasurementTargetsFilterResult}).
   *
   * Each returned targetId reuses an existing cachedStats key when
   * statistics were already computed for the same volume (possibly by a
   * different viewport), and is otherwise the view reference id of this
   * viewport for that volume - so a single fusion viewport can seed and
   * compute the statistics of every filtered target itself, even when no
   * other viewport has computed them.
   *
   * A configured filter's result is authoritative: when it includes no
   * candidates (eg a PT-only filter on a CT viewport, or the default
   * `allPixelData` filter when only a SEG is shown), an empty array is
   * returned and no statistics are computed or displayed.
   *
   * The deprecated `isPreferredTargetId` configuration is honoured before
   * the filter, so existing configurations keep their behaviour.  When
   * neither selects anything and no filter is configured, the viewport's
   * default view reference id is the single target.
   *
   * **Multi-target selection only works for volumes displayed on screen**
   *
   * TODO: Fix this for other fusion types on stack and also for inclusion
   * of annotation measurements which are not currently on screen.
   */
  protected getMeasurementTargets(
    viewport: Types.IViewport,
    data?: AnnotationData
  ): string[] {
    const { targetsFilter, isPreferredTargetId } = this.configurationTyped;

    // Legacy option (deprecated) choosing the preferred target from already
    // computed stats.  Checked first so configurations predating
    // targetsFilter keep working even for tools with a default filter.
    if (isPreferredTargetId && data?.cachedStats) {
      for (const [targetId, cachedStat] of Object.entries(data.cachedStats)) {
        if (isPreferredTargetId(viewport, { targetId, cachedStat })) {
          return [targetId];
        }
      }
    }

    if (targetsFilter) {
      const candidates = this.getMeasurementTargetCandidates(viewport, data);
      const targets: string[] = [];
      let previous: MeasurementTargetCandidate;
      for (const candidate of candidates) {
        candidate.previous = previous;
        const result = targetsFilter(candidate, viewport);
        if (result === true || result === 'useAndStop') {
          targets.push(candidate.targetId);
          previous = candidate;
        }
        if (result === 'useAndStop' || result === 'stop') {
          break;
        }
      }
      return targets;
    }

    // No filter configured - use the viewport's default method
    const defaultTargetId = viewport.getViewReferenceId?.();
    if (defaultTargetId) {
      return [defaultTargetId];
    }

    throw new Error(
      'getMeasurementTargets: viewport must have a getViewReferenceId method'
    );
  }

  /**
   * Builds the list of candidate measurement targets for the given viewport:
   * one per volume actor being displayed (including segmentation
   * representations, which carry a `representationUID` and are excluded by
   * the default filter rather than skipped here), falling back to a single
   * candidate for the default view reference when there are none.  The
   * candidates are what the
   * `targetsFilter` tool configuration chooses from - each carries the
   * display set related parameters (display set, uid, exemplar instance and
   * index) where they are known.
   *
   * The candidate modality is taken from the display set where available -
   * the exemplar instance or volume metadata for volume backed candidates,
   * or the registered display set of the viewport for the fallback
   * candidate.  When the display set is unknown (eg a stack viewport using
   * the legacy set image ids), the candidate has none of the display set
   * fields, and filters can choose whether to include it based on that.
   *
   * When the annotation already has a cachedStats entry for a candidate's
   * volume (possibly created by another viewport with a different view
   * reference), the existing key is reused as the targetId so statistics are
   * shared rather than recomputed per view.
   */
  protected getMeasurementTargetCandidates(
    viewport: Types.IViewport,
    data?: AnnotationData
  ): MeasurementTargetCandidate[] {
    const candidates: MeasurementTargetCandidate[] = [];
    const displaySets = BaseTool.getViewportDisplaySets(viewport);
    const actors = viewport.getActors?.() || [];
    for (let index = 0; index < actors.length; index++) {
      const { referencedId, representationUID } = actors[index];
      // Skip actors not derived from a cached volume (tool/canvas actors).
      // Segmentation representations (labelmaps etc) are kept as candidates
      // and carry their representationUID, so that the configured
      // targetsFilter decides whether to include them - excluding
      // segmentations is the job of the (default) filter, not baked in here.
      if (!referencedId) {
        continue;
      }
      const volume = cache.getVolume(referencedId);
      if (!volume) {
        continue;
      }
      const targetId =
        BaseTool.findCachedStatsTargetId(data, referencedId) ||
        viewport.getViewReferenceId?.({ volumeId: referencedId });
      if (!targetId) {
        continue;
      }
      const displaySetInfo = displaySets.find(
        (displaySet) => displaySet.volumeId === referencedId
      );
      const imageIds =
        displaySetInfo?.imageIds ??
        (volume.imageIds?.length ? volume.imageIds : undefined);
      const instance =
        displaySetInfo?.instance ?? BaseTool.getExemplarInstance(imageIds);
      candidates.push({
        targetId,
        referencedId,
        representationUID: representationUID as string,
        displaySet: displaySetInfo?.displaySet,
        displaySetUID: displaySetInfo?.displaySetUID,
        instance,
        modality: (instance?.Modality as string) ?? volume.metadata?.Modality,
        imageIds,
        index,
      });
    }
    if (!candidates.length) {
      const targetId = viewport.getViewReferenceId?.();
      if (targetId) {
        const displaySetInfo = displaySets[0];
        candidates.push({
          targetId,
          index: 0,
          displaySet: displaySetInfo?.displaySet,
          displaySetUID: displaySetInfo?.displaySetUID,
          instance: displaySetInfo?.instance,
          modality: displaySetInfo?.modality,
          imageIds: displaySetInfo?.imageIds,
        });
      }
    }
    return candidates;
  }

  /**
   * Resolves the display sets a viewport is displaying, when known.
   * Viewports displaying registered display sets (see `setDisplaySets` on
   * the generic viewports) resolve through the `displaySetModule` metadata
   * (an `IDisplaySet` from `@cornerstonejs/metadata`) falling back to the
   * generic viewport display set registration; legacy viewports (`setStack`
   * with plain image ids) have no display set, so an empty list is returned
   * and their candidates carry no display set fields.
   */
  protected static getViewportDisplaySets(viewport: Types.IViewport): Array<{
    displaySetUID: string;
    displaySet?: unknown;
    instance?: Record<string, unknown>;
    imageIds?: string[];
    volumeId?: string;
    modality?: string;
  }> {
    const displaySets = (
      viewport as unknown as {
        getDisplaySets?: () => Array<{ displaySetId: string }>;
      }
    ).getDisplaySets?.();
    if (!displaySets?.length) {
      return [];
    }
    const provider = csUtils.genericViewportDisplaySetMetadataProvider;
    return displaySets.map(({ displaySetId }) => {
      const genericRegistration = provider.get(
        provider.VIEWPORT_V2_DISPLAY_SET,
        displaySetId
      );
      const registeredImageIds = Array.isArray(genericRegistration)
        ? (genericRegistration as string[])
        : (genericRegistration as { imageIds?: string[] })?.imageIds;
      // registerDisplaySetMetadata stores IDisplaySet metadata under image
      // ids, not the logical displaySetId used by GenericViewport. Resolve
      // the generic registration first to bridge those two identifiers.
      const typedDisplaySet = registeredImageIds
        ?.map(
          (imageId) =>
            metaData.get('displaySetModule', imageId) as
              | {
                  displaySetId?: string;
                  imageIds?: readonly string[];
                  instances?: readonly Record<string, unknown>[];
                }
              | undefined
        )
        .find((displaySet) => displaySet !== undefined);
      const imageIds = typedDisplaySet?.imageIds?.length
        ? Array.from(typedDisplaySet.imageIds)
        : registeredImageIds;
      const registered = typedDisplaySet ?? genericRegistration;
      const instance =
        typedDisplaySet?.instances?.[0] ??
        BaseTool.getExemplarInstance(imageIds);
      return {
        displaySetUID: typedDisplaySet?.displaySetId ?? displaySetId,
        displaySet: registered,
        instance,
        imageIds,
        // The typed IDisplaySet owns the rich metadata, while the generic
        // registration carries the volume binding used to match viewport
        // actors back to that display set.
        volumeId: (genericRegistration as { volumeId?: string })?.volumeId,
        modality:
          (instance?.Modality as string) ??
          (imageIds?.length
            ? (metaData.get('generalSeriesModule', imageIds[0])?.modality as
                | string
                | undefined)
            : undefined),
      };
    });
  }

  /**
   * Resolves an exemplar (first) instance - naturalized DICOM metadata -
   * from the image ids of a display set/volume, when available.
   */
  protected static getExemplarInstance(
    imageIds?: string[]
  ): Record<string, unknown> | undefined {
    if (!imageIds?.length) {
      return;
    }
    return metaData.get('instance', imageIds[0]) as
      | Record<string, unknown>
      | undefined;
  }

  /**
   * Finds an existing cachedStats key for the given referenced volume id, if
   * statistics were already computed for that volume - the keys are view
   * reference ids of the form `volumeId:<volumeId>?...`, so entries created
   * by other viewports (with a different slice/orientation) still match.
   */
  protected static findCachedStatsTargetId(
    data: AnnotationData | undefined,
    referencedId: string
  ): string | undefined {
    if (!data?.cachedStats) {
      return;
    }
    return Object.keys(data.cachedStats).find(
      (key) =>
        key.startsWith('volumeId:') && csUtils.getVolumeId(key) === referencedId
    );
  }

  /**
   * Ensures a cachedStats entry exists for every measurement target, so that
   * the tool stats calculators (which iterate the cachedStats keys) compute
   * statistics for each of them.  This is what allows a single fusion
   * viewport to compute the statistics of several display sets at once, even
   * when no other viewport has computed them.
   *
   * @param data - the annotation data containing the cachedStats
   * @param targetIds - the targets to seed (see getMeasurementTargets)
   * @param needsUpdate - optional test flagging an existing entry as
   *   incomplete (eg hydrated annotations missing units) and needing to be
   *   recalculated
   * @returns true if any entry was added or flagged, meaning the stats need
   *   to be (re)calculated
   */
  protected ensureCachedStatsTargets(
    data: AnnotationData,
    targetIds: string[],
    needsUpdate?: (stats) => boolean
  ): boolean {
    let missing = false;
    const cachedStats = (data.cachedStats ??= {}) as Record<string, unknown>;
    for (const targetId of targetIds) {
      const stats = cachedStats[targetId];
      if (!stats || needsUpdate?.(stats)) {
        cachedStats[targetId] = {};
        missing = true;
      }
    }
    return missing;
  }

  /**
   * Undoes an action
   */
  public undo() {
    // It is possible a user has started another action here, so ensure that one
    // gets completed/stored correctly.  Normally this only occurs if the user
    // starts an undo while dragging.
    this.doneEditMemo();
    DefaultHistoryMemo.undo();
  }
  /**
   * Redo an action (undo the undo)
   */
  public redo() {
    DefaultHistoryMemo.redo();
  }

  /**
   * Creates a zoom/pan memo that remembers the original zoom/pan position for
   * the given viewport.
   */
  public static createZoomPanMemo(viewport) {
    if (!viewportHasPan(viewport) || !viewportHasZoom(viewport)) {
      return;
    }

    // TODO - move this to view callback as a utility
    const state = {
      pan: viewport.getPan(),
      zoom: viewport.getZoom(),
    };
    const zoomPanMemo = {
      restoreMemo: () => {
        const currentPan = viewport.getPan();
        const currentZoom = viewport.getZoom();
        const renderableViewport = viewport as typeof viewport & {
          render?: () => void;
        };
        viewport.setZoom(state.zoom);
        viewport.setPan(state.pan);
        if (typeof renderableViewport.render === 'function') {
          renderableViewport.render();
        }
        state.pan = currentPan;
        state.zoom = currentZoom;
      },
    };
    DefaultHistoryMemo.push(zoomPanMemo);
    return zoomPanMemo;
  }

  /**
   * This clears and edit memo storage to allow for further history functions
   * to be called.  Calls the complete function if present, and pushes the
   * memo to the history memo stack.
   *
   * This should be called when a tool has finished making a change which should be
   * separated from future/other changes in terms of the history.
   * Usually that means on endCallback (mouse up), but some tools also make changes
   * on the initial creation of an object or have alternate flows and the doneEditMemo
   * has to be called on mouse down or other initiation events to ensure that new
   * changes are correctly recorded.
   *
   * If the tool has no end callback, then the doneEditMemo is called from the
   * pre mouse down callback.  See ZoomTool for an example of this usage.
   */
  public doneEditMemo() {
    if (this.memo?.commitMemo?.()) {
      DefaultHistoryMemo.push(this.memo);
    }
    this.memo = null;
  }

  /** Starts a group recording of history memo, so that with a single undo you can undo multiple actions that are related to each other */
  public static startGroupRecording() {
    DefaultHistoryMemo.startGroupRecording();
  }

  /** Ends a group recording of history memo */
  public static endGroupRecording() {
    DefaultHistoryMemo.endGroupRecording();
  }

  /**
   * Calculates the length between two index coordinates using the calibrate
   * information for scaling information.
   * @param closed - set to true to calculate the closed length,
   *    including the line between the first/last index
   */
  public static calculateLengthInIndex(calibrate, indexPoints, closed = false) {
    const scale = calibrate?.scale || 1;
    const scaleY = calibrate?.scaleY || scale;
    const scaleZ = calibrate?.scaleZ || scale;
    let length = 0;
    const count = indexPoints.length;
    const start = closed ? 0 : 1;
    let lastPoint = closed ? indexPoints[count - 1] : indexPoints[0];
    for (let i = start; i < count; i++) {
      const point = indexPoints[i];
      const dx = (point[0] - lastPoint[0]) / scale;
      const dy = (point[1] - lastPoint[1]) / scaleY;
      const dz = (point[2] - lastPoint[2]) / scaleZ;
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
      lastPoint = point;
    }
    return length;
  }

  /**
   * Return true if all the index points are within the dimensions provided.
   */
  public static isInsideVolume(dimensions, indexPoints) {
    const { length: count } = indexPoints;
    for (let i = 0; i < count; i++) {
      if (!csUtils.indexAlmostWithinDimensions(indexPoints[i], dimensions)) {
        return false;
      }
    }
    return true;
  }
}

// Note: this is a workaround since terser plugin does not support static blocks
// yet and we can't easily say static toolName = "BaseTool" in the class definition.
BaseTool.toolName = 'BaseTool';
export default BaseTool;
