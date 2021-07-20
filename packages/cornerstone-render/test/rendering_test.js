import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  EVENTS,
  registerVolumeLoader,
  createAndCacheVolume,
  Utilities,
} = cornerstone3D

const { volumeLoader } = Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const scene2UID = 'SCENE_2'
const axialViewportUID = 'AXIAL_VIEWPORT'
const sagittalViewportUID = 'SAGITTAL_VIEWPORT'
const customOrientationViewportUID = 'OFF_AXIS_VIEWPORT'

const DOMElements = []

registerVolumeLoader('fakeVolumeLoader', volumeLoader)

describe('RenderingEngine API:', () => {
  beforeEach(function () {
    const renderingEngine = new RenderingEngine(renderingEngineUID)
    this.renderingEngine = renderingEngine

    const canvasAxial = document.createElement('canvas')
    this.canvasAxial = canvasAxial

    this.canvasAxial.style.width = 256
    this.canvasAxial.style.height = 512
    document.body.appendChild(this.canvasAxial)
    DOMElements.push(this.canvasAxial)

    const canvasSagittal = document.createElement('canvas')
    this.canvasSagittal = canvasSagittal

    this.canvasSagittal.style.width = 1024
    this.canvasSagittal.style.height = 1024
    document.body.appendChild(this.canvasSagittal)
    DOMElements.push(this.canvasSagittal)

    const canvasCustomOrientation = document.createElement('canvas')
    this.canvasCustomOrientation = canvasCustomOrientation

    this.canvasCustomOrientation.style.width = 63
    this.canvasCustomOrientation.style.height = 87
    document.body.appendChild(this.canvasCustomOrientation)
    DOMElements.push(this.canvasCustomOrientation)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: axialViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.canvasAxial,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene1UID,
        viewportUID: sagittalViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.canvasSagittal,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: customOrientationViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.canvasCustomOrientation,
        defaultOptions: {
          orientation: { sliceNormal: [0, 0, 1], viewUp: [0, 1, 0] },
        },
      },
    ])
  })

  afterEach(() => {
    cache.purgeCache()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Add multiple scenes to the viewport and have api access to both', function () {
    const scene1 = this.renderingEngine.getScene(scene1UID)

    const scene2 = this.renderingEngine.getScene(scene2UID)

    expect(scene1).toBeTruthy()
    expect(scene2).toBeTruthy()
  })

  it('should be able to access the viewports for a scene', function () {
    const scene1 = this.renderingEngine.getScene(scene1UID)

    const scene1AxialViewport = scene1.getViewport(axialViewportUID)
    const scene1Viewports = scene1.getViewports()

    expect(scene1AxialViewport).toBeTruthy()
    expect(scene1Viewports).toBeTruthy()
    expect(scene1Viewports.length).toEqual(2)
  })

  it('Add a volume to the scene and call its callback correctly', function (done) {
    const volumeId = 'fakeVolumeLoader:volumeURI_512_512_512_1_1_1_0'
    const scene1 = this.renderingEngine.getScene(scene1UID)

    let callbackCalledWithCorrectProps = false
    const callback = ({ volumeActor, volumeUID }) => {
      if (volumeUID !== volumeId) {
        return
      }

      if (!volumeActor) {
        return
      }

      callbackCalledWithCorrectProps = true
    }

    createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
      scene1.setVolumes([{ volumeUID: volumeId, callback }])
      scene1.render()
    })

    this.canvasAxial.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      expect(callbackCalledWithCorrectProps).toEqual(true)
      done()
    })

    scene1.setVolumes([{ volumeUID: volumeId, callback }])
  })

  it('Take an orientation given by AXIAL as well as set manually by sliceNormal and viewUp', function () {
    const scene1 = this.renderingEngine.getScene(scene1UID)
    const scene2 = this.renderingEngine.getScene(scene2UID)

    const scene1AxialViewport = scene1.getViewport(axialViewportUID)
    const scene2CustomOrientationViewport = scene2.getViewport(
      customOrientationViewportUID
    )

    const scene1DefaultOptions = scene1AxialViewport.defaultOptions
    const scene1Orientation = scene1DefaultOptions.orientation
    const scene2DefaultOptions = scene2CustomOrientationViewport.defaultOptions
    const scene2Orientation = scene2DefaultOptions.orientation

    expect(scene1Orientation.viewUp.length).toEqual(3)
    expect(scene1Orientation.sliceNormal.length).toEqual(3)
    expect(scene2Orientation.viewUp.length).toEqual(3)
    expect(scene2Orientation.sliceNormal.length).toEqual(3)
  })
})
