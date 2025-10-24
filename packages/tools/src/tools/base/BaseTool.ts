import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import ToolModes from '../../enums/ToolModes';
import type StrategyCallbacks from '../../enums/StrategyCallbacks';
import type {
  InteractionTypes,
  ToolProps,
  PublicToolProps,
  ToolConfiguration,
} from '../../types';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

/**
 * Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy
 * application.
 */
abstract class BaseTool {
  static toolName;
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
  /**
   * A memo recording the starting state of a tool.  This will be updated
   * as changes are made, and reflects the fact that a memo has been created.
   */
  protected memo: utilities.HistoryMemo.Memo;

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

    const initialProps = utilities.deepMerge(mergedDefaults, toolProps);

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
    return utilities.deepMerge(defaultProps, additionalProps);
  }

  /**
   * A function generator to test if the target id is the desired one.
   * Used for deciding which set of cached stats is appropriate to display
   * for a given viewport.
   */
  public static isSpecifiedTargetId(desiredTargetId: string) {
    return (_viewport, { targetId }) => targetId.includes(desiredTargetId);
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
    this.configuration = utilities.deepMerge(
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
      const imageURI = utilities.imageIdToURI(imageId);
      let viewports = utilities.getViewportsWithImageURI(imageURI);

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
      const volumeId = utilities.getVolumeId(targetId);
      const viewports = utilities.getViewportsWithVolumeId(volumeId);

      if (!viewports || !viewports.length) {
        return;
      }

      return viewports[0].getImageData();
    } else if (targetId.startsWith('videoId:')) {
      // Video id can be multi-valued for the frame information
      const imageURI = utilities.imageIdToURI(targetId);
      const viewports = utilities.getViewportsWithImageURI(imageURI);

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
   * This method allows prioritizing a specific volumeId from the tool's
   * configuration if available in the cachedStats.
   *
   * @param viewport - viewport to get the targetId for
   * @param data - Optional: The annotation's data object, containing cachedStats.
   * @returns targetId
   */
  protected getTargetId(
    viewport: Types.IViewport,
    data?: unknown & { cachedStats?: Record<string, unknown> }
  ): string | undefined {
    const { isPreferredTargetId } = this.configurationTyped; // Get preferred ID from config

    // Check if cachedStats is available and contains the preferredVolumeId
    if (isPreferredTargetId && data?.cachedStats) {
      for (const [targetId, cachedStat] of Object.entries(data.cachedStats)) {
        if (isPreferredTargetId(viewport, { targetId, cachedStat })) {
          return targetId;
        }
      }
    }

    // If not found or not applicable, use the viewport's default method
    const defaultTargetId = viewport.getViewReferenceId?.();
    if (defaultTargetId) {
      return defaultTargetId;
    }

    throw new Error(
      'getTargetId: viewport must have a getViewReferenceId method'
    );
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
    // TODO - move this to view callback as a utility
    const state = {
      pan: viewport.getPan(),
      zoom: viewport.getZoom(),
    };
    const zoomPanMemo = {
      restoreMemo: () => {
        const currentPan = viewport.getPan();
        const currentZoom = viewport.getZoom();
        viewport.setZoom(state.zoom);
        viewport.setPan(state.pan);
        viewport.render();
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
}

// Note: this is a workaround since terser plugin does not support static blocks
// yet and we can't easily say static toolName = "BaseTool" in the class definition.
BaseTool.toolName = 'BaseTool';
export default BaseTool;
