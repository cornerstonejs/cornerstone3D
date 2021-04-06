import { IViewport } from './../types'
import Scene from './Scene'
import VolumeViewport from './VolumeViewport'
import VIEWPORT_TYPE from '../constants/viewportType'
import renderingEngineCache from './renderingEngineCache'
import RenderingEngine from './RenderingEngine'
import { createVolumeActor } from './helpers'
import cache from '../cache'
import { loadVolume } from '../volumeLoader'

type VolumeActor = {
  getProperty: () => any
}

/**
 * @type VolumeActorEntry
 * Defines the shape of volume actors entries added to the scene.
 */
export type VolumeActorEntry = {
  uid: string
  volumeActor: VolumeActor
  slabThickness: number
}

type VolumeInput = {
  volumeUID: string
  callback?: () => any
  blendMode?: string
  slabThickness?: number
}

type ViewportInput = {
  uid: string
  type: string
  canvas: HTMLElement
  sx: number
  sy: number
  sWidth: number
  sHeight: number
  defaultOptions: any
}

/**
 * @class Scene - Describes a scene which defined a worldspace containing actors.
 * A scene may have different viewports which may be different views of this same data.
 */
class VolumeScene extends Scene {
  private _volumeActors: Array<VolumeActorEntry>
  private _FrameOfReferenceUID: string

  constructor(uid: string, renderingEngineUID: string) {
    super(uid, renderingEngineUID)
    this._volumeActors = []
  }

  public getFrameOfReferenceUID(): string {
    return this._FrameOfReferenceUID
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
  ) {
    this._volumeActors = []

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

    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeUID, slabThickness } = volumeInputArray[i]
      const volumeActor = await createVolumeActor(volumeInputArray[i])

      this._volumeActors.push({ volumeActor, uid: volumeUID, slabThickness })

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

    this._viewports.forEach((viewport) => {
      if (viewport.type !== VIEWPORT_TYPE.STACK) {
        viewport._setVolumeActors(this._volumeActors)
      }
    })

    if (immediate) {
      this.render()
    }
  }

  /**
   * @method addViewport Adds a `Viewport` to the `Scene`, as defined by the `ViewportInput`.
   * @param {ViewportInput} viewportInput
   */
  public addViewport(viewportInput: ViewportInput) {
    this._addViewport(viewportInput, VolumeViewport)
  }

  /**
   * @method getVolumeActor Gets a volume actor on the scene by its `uid`.
   *
   * @param {string }uid The UID of the volumeActor to fetch.
   * @returns {object} The volume actor.
   */
  public getVolumeActor(uid: string): VolumeActor {
    const volumeActors = this._volumeActors
    const volumeActorEntry = volumeActors.find((va) => va.uid === uid)

    if (volumeActorEntry) {
      return volumeActorEntry.volumeActor
    }
  }

  /**
   * @method getVolumeActors Gets the array of `VolumeActorEntry`s.
   *
   * @returns {Array<VolumeActorEntry>} The array of volume actors.
   */
  public getVolumeActors(): Array<VolumeActorEntry> {
    return [...this._volumeActors]
  }
}

export default VolumeScene
