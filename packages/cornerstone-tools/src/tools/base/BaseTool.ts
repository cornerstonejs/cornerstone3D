import {
  StackViewport,
  Types,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import deepMerge from '../../util/deepMerge'
import { ToolModes } from '../../enums'

/**
 * Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy
 * application.
 */
abstract class BaseTool {
  public initialConfiguration: Record<string, any>
  public name: string
  public supportedInteractionTypes: Array<string>
  public configuration: Record<string, any>
  public mode: ToolModes
  public toolGroupUID: string // the toolGroup this instance belongs to

  constructor(
    toolConfiguration: Record<string, any>,
    defaultToolConfiguration: Record<string, any>
  ) {
    this.initialConfiguration = deepMerge(
      defaultToolConfiguration,
      toolConfiguration
    )

    const {
      name,
      configuration = {},
      supportedInteractionTypes,
      toolGroupUID,
    } = this.initialConfiguration

    // If strategies are not initialized in the tool config
    if (!configuration.strategies) {
      configuration.strategies = {}
      configuration.defaultStrategy = undefined
      configuration.activeStrategy = undefined
      configuration.strategyOptions = {}
    }

    this.toolGroupUID = toolGroupUID
    this.name = name
    this.supportedInteractionTypes = supportedInteractionTypes || []
    this.configuration = Object.assign({}, configuration)
    this.mode = ToolModes.Disabled
  }

  /**
   *
   * @param evt
   * @param operationData
   */
  public applyActiveStrategy(evt: any, operationData: any): any {
    const { strategies, activeStrategy } = this.configuration
    return strategies[activeStrategy].call(this, evt, operationData)
  }

  /**
   * merges the new configuration with the tool configuration
   * @param configuration toolConfiguration
   */
  public setConfiguration(newConfiguration: Record<string, any>): void {
    this.configuration = deepMerge(this.configuration, newConfiguration)
  }

  /**
   * Sets the active strategy for a tool. Strategies are
   * multiple implementations of tool behavior that can be switched by tool
   * configuration.
   *
   * @param strategyName
   * @public
   */
  public setActiveStrategy(strategyName: string): void {
    this.setConfiguration({ activeStrategy: strategyName })
  }

  /**
   * Returns the volumeUID for the volume viewport. It will grabbed the volumeUID
   * from the volumeUID if particularly specified in the tool configuration, or if
   * not, the first actorUID in the viewport is returned as the volumeUID. NOTE: for
   * segmentations, actorUID is not necessarily the volumeUID since the segmentation
   * can have multiple representations, use SegmentationModule to get the volumeUID
   * based on the actorUID.
   *
   * @param viewport - Volume viewport
   * @returns the volumeUID for the viewport if specified in the tool configuration,
   * or the first actorUID in the viewport if not.
   */
  private getTargetVolumeUID(viewport: Types.IViewport): string | undefined {
    if (!(viewport instanceof VolumeViewport)) {
      throw new Error('getTargetVolumeUID: viewport must be a VolumeViewport')
    }

    if (this.configuration.volumeUID) {
      return this.configuration.volumeUID
    }

    // If volume not specified, then return the actorUID for the
    // default actor - first actor
    const actors = viewport.getActors()

    if (!actors && !actors.length) {
      return
    }

    return actors[0].uid
  }

  /**
   * Get the target UID for the viewport which will be used to store the cached
   * statistics scoped to that target in the toolState.
   * For StackViewport, targetUID is the viewportUID, but for the volume viewport,
   * the targetUID will be grabbed from the volumeUID if particularly specified
   * in the tool configuration, or if not, the first actorUID in the viewport.
   *
   * @param viewport - viewport to get the targetUID for
   * @returns targetUID
   */
  protected getTargetUID(viewport: Types.IViewport): string | undefined {
    if (viewport instanceof StackViewport) {
      return `stackTarget:${viewport.uid}`
    } else if (viewport instanceof VolumeViewport) {
      return this.getTargetVolumeUID(viewport)
    } else {
      throw new Error(
        'getTargetUID: viewport must be a StackViewport or VolumeViewport'
      )
    }
  }
}

export default BaseTool
