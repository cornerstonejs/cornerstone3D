import { IViewport } from '../types'
import Viewport from './Viewport'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import { createVolumeActor } from './helpers'
import cache from '../cache'
import { loadVolume } from '../volumeLoader'
import { uuidv4 } from '../utilities'
import VolumeViewport from './VolumeViewport'
import { VolumeActor, ActorEntry } from './Viewport'

type VolumeInput = {
  volumeUID: string
  callback?: () => any
  blendMode?: string
  slabThickness?: number
}

/**
 * @class Scene - Describes a scene which defined a world space containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
class Scene {
  readonly uid: string
  readonly renderingEngineUID: string
  private _sceneViewports: Array<string>
  // private _volumeActors: Array<ActorEntry>
  private _FrameOfReferenceUID: string
  private _internalScene: boolean

  constructor(uid: string, renderingEngineUID: string) {
    this.renderingEngineUID = renderingEngineUID
    this._sceneViewports = []
    // this._volumeActors = []
    this._internalScene = uid ? false : true
    this.uid = uid ? uid : uuidv4()
  }

  public getFrameOfReferenceUID(): string {
    return this._FrameOfReferenceUID
  }

  public getIsInternalScene(): boolean {
    return this._internalScene
  }

  /**
   * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
   *
   * @returns {RenderingEngine} The RenderingEngine instance.
   */
  public getRenderingEngine(): RenderingEngine {
    return renderingEngineCache.get(this.renderingEngineUID)
  }

  /**
   * @method getViewport - Returns a `Viewport` from the `Scene` by its `uid`.
   * @param {string } uid The UID of the viewport to get.
   */
  public getViewport(viewportUID: string): VolumeViewport {
    const renderingEngine = this.getRenderingEngine()
    const index = this._sceneViewports.indexOf(viewportUID)

    if (index > -1) {
      return <VolumeViewport>renderingEngine.getViewport(viewportUID)
    }

    throw new Error(
      `Requested ${viewportUID} does not belong to ${this.uid} scene`
    )
  }

  /**
   * @method getViewports Returns the viewports on the scene.
   *
   * @returns {Array<Viewport>} The viewports.
   */
  public getViewports(): Array<VolumeViewport> {
    const renderingEngine = this.getRenderingEngine()
    const viewports = this._sceneViewports.map((uid) => {
      return <VolumeViewport>renderingEngine.getViewport(uid)
    })
    return viewports
  }

  /**
   * @method render Renders all `Viewport`s in the `Scene` using the `Scene`'s `RenderingEngine`.
   */
  public render(): void {
    const renderingEngine = this.getRenderingEngine()

    renderingEngine.renderScene(this.uid)
  }

  /**
   * @method setVolumes Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   *
   * @param {Array<VolumeInput>} volumeInputArray The array of `VolumeInput`s which define the volumes to add.
   * @param {boolean} [immediate=false] Whether the `Scene` should be rendered as soon as volumes are added.
   */
  public async setVolumes(
    volumeInputArray: Array<VolumeInput>,
    immediate = false
  ): void {
    // this._volumeActors = []

    // TODO: should we have a get or fail? If it's in the cache, give it back, otherwise throw
    const firstImageVolume = await loadVolume(volumeInputArray[0].volumeUID)

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with uid: ${firstImageVolume.uid} does not exist`
      )
    }

    const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID

    const numVolumes = volumeInputArray.length

    // Check all other volumes exist and have the same FrameOfReference
    for (let i = 1; i < numVolumes; i++) {
      const volumeInput = volumeInputArray[i]

      const imageVolume = await loadVolume(volumeInput.volumeUID)

      if (!imageVolume) {
        throw new Error(
          `imageVolume with uid: ${imageVolume.uid} does not exist`
        )
      }

      if (FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID) {
        throw new Error(
          `Volumes being added to scene ${this.uid} do not share the same FrameOfReferenceUID. This is not yet supported`
        )
      }
    }

    this._FrameOfReferenceUID = FrameOfReferenceUID

    const slabThicknessValues = []
    const _volumeActors = []

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeUID, slabThickness } = volumeInputArray[i]
      const volumeActor = await createVolumeActor(volumeInputArray[i])

      _volumeActors.push({ uid: volumeUID, volumeActor, slabThickness })

      if (
        slabThickness !== undefined &&
        !slabThicknessValues.includes(slabThickness)
      ) {
        slabThicknessValues.push(slabThickness)
      }
    }

    if (slabThicknessValues.length > 1) {
      console.warn(
        'Currently slab thickness for intensity projections is tied to the camera, not per volume, using the largest of the two volumes for this scene.'
      )
    }

    this._sceneViewports.forEach((uid) => {
      const viewport = this.getViewport(uid)
      viewport._setVolumeActors(_volumeActors)
    })

    if (immediate) {
      this.render()
    }
  }

  /**
   * @method addViewport Adds a `Viewport` to the `Scene`, as defined by the `ViewportInput`.
   * @param {viewportUID} viewoprtUID
   */
  public addViewport(viewportUID: string): void {
    this._sceneViewports.push(viewportUID)

    // if a viewport is added after volumes have already been added to the
    // scene, we add the existing volumeActors to the viewport.
    // Todo
  }

  public removeViewport(viewportUID: string): void {
    const index = this._sceneViewports.indexOf(viewportUID)

    if (index > -1) {
      this._sceneViewports.splice(index, 1)

      // Todo: remove from the rendering engine as well
      return
    }

    console.warn(
      `Requested ${viewportUID} does not belong to ${this.uid} scene`
    )
  }

  /**
   * @method getVolumeActor Gets a volume actor on the scene by its `uid`.
   *
   * @param {string }volumeUID The UID of the volumeActor to fetch.
   * @returns {object} The volume actor.
   */
  public getVolumeActor(uid: string): VolumeActor {
    const viewports = this.getViewports()
    //Todo: should we check the actor in all viewports (they are the same)?
    const volumeActorEntry = viewports[0].getActor(uid)

    if (volumeActorEntry) {
      return volumeActorEntry.volumeActor
    }
  }

  /**
   * @method getVolumeActors Gets the array of `VolumeActorEntry`s.
   *
   * @returns {Array<VolumeActorEntry>} The array of volume actors.
   */
  public getVolumeActors(): Array<ActorEntry> {
    const viewports = this.getViewports()
    //Todo: should we check the actor in all viewports (they are the same)?
    return viewports[0].getActors()
  }
}

export default Scene
