import { StackViewport, VolumeViewport, cache } from '@cornerstonejs/core'
import type { Types } from '@cornerstonejs/core'
import deepMerge from '../../utilities/deepMerge'
import { ToolModes } from '../../enums'
import { InteractionTypes, ToolProps, PublicToolProps } from '../../types'

interface IBaseTool {
  /** ToolGroup UID the tool instance belongs to */
  toolGroupUID: string
  /** Tool supported interaction types */
  supportedInteractionTypes: InteractionTypes[]
  /** Tool Mode : Active, Passive, Enabled, Disabled */
  mode: ToolModes
  /** Tool Configuration */
  configuration: {
    preventHandleOutsideImage?: boolean
    strategies?: Record<string, any>
    defaultStrategy?: string
    activeStrategy?: string
    strategyOptions?: Record<string, unknown>
  }
}

/**
 * Abstract base class from which all tools derive.
 * Deals with cleanly merging custom and default configuration, and strategy
 * application.
 */
abstract class BaseTool implements IBaseTool {
  static toolName = 'BaseTool'
  /** Supported Interaction Types - currently only Mouse */
  public supportedInteractionTypes: InteractionTypes[]
  public configuration: Record<string, any>
  /** ToolGroup UID the tool instance belongs to */
  public toolGroupUID: string
  /** Tool Mode - Active/Passive/Enabled/Disabled/ */
  public mode: ToolModes

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    const initialProps = deepMerge(defaultToolProps, toolProps)

    const {
      configuration = {},
      supportedInteractionTypes,
      toolGroupUID,
    } = initialProps

    // If strategies are not initialized in the tool config
    if (!configuration.strategies) {
      configuration.strategies = {}
      configuration.defaultStrategy = undefined
      configuration.activeStrategy = undefined
      configuration.strategyOptions = {}
    }

    this.toolGroupUID = toolGroupUID
    this.supportedInteractionTypes = supportedInteractionTypes || []
    this.configuration = Object.assign({}, configuration)
    this.mode = ToolModes.Disabled
  }

  /**
   * Returns the name of the tool
   * @returns The name of the tool.
   */
  public getToolName(): string {
    // Since toolName is static we get it from the class constructor
    return (<typeof BaseTool>this.constructor).toolName
  }

  /**
   * It applies the active strategy to the enabled element.
   * @param enabledElement - The element that is being operated on.
   * @param operationData - The data that needs to be passed to the strategy.
   * @returns The result of the strategy.
   */
  public applyActiveStrategy(
    enabledElement: Types.IEnabledElement,
    operationData: unknown
  ): any {
    const { strategies, activeStrategy } = this.configuration
    return strategies[activeStrategy].call(this, enabledElement, operationData)
  }

  /**
   * merges the new configuration with the tool configuration
   * @param configuration - toolConfiguration
   */
  public setConfiguration(newConfiguration: Record<string, any>): void {
    this.configuration = deepMerge(this.configuration, newConfiguration)
  }

  /**
   * Sets the active strategy for a tool. Strategies are
   * multiple implementations of tool behavior that can be switched by tool
   * configuration.
   *
   * @param strategyName - name of the strategy to be set as active
   */
  public setActiveStrategy(strategyName: string): void {
    this.setConfiguration({ activeStrategy: strategyName })
  }

  /**
   * Returns the volumeUID for the volume viewport. It will grabbed the volumeUID
   * from the volumeUID if particularly specified in the tool configuration, or if
   * not, the first actorUID in the viewport is returned as the volumeUID. NOTE: for
   * segmentations, actorUID is not necessarily the volumeUID since the segmentation
   * can have multiple representations, use segmentation helpers to get the volumeUID
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
   * Get the viewport and image for the targetUID. Since we are using the
   * schema of stackTarget:<viewportId>, we can get the viewport and image
   * from the stack. For the volumeViewports, the targetUID is the actual
   * volumeUID, so we can get the viewport and image.
   *
   * @param targetUID - annotation targetUID
   * @param renderingEngine - The rendering engine
   * @returns The viewport and image data for the target.
   */
  protected getTargetUIDViewportAndImage(
    targetUID: string,
    renderingEngine: Types.IRenderingEngine
  ): {
    viewport: Types.IViewport
    image: Types.IImageData
  } {
    let image, viewport
    if (targetUID.startsWith('stackTarget')) {
      const coloneIndex = targetUID.indexOf(':')
      const viewportId = targetUID.substring(coloneIndex + 1)
      viewport = renderingEngine.getViewport(viewportId)
      image = viewport.getImageData()
    } else {
      image = cache.getVolume(targetUID)
    }

    return { image, viewport }
  }

  /**
   * Get the target UID for the viewport which will be used to store the cached
   * statistics scoped to that target in the annotations.
   * For StackViewport, targetUID is the viewportId, but for the volume viewport,
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
