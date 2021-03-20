import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  cache,
  RenderingEngine,
  Utilities,
  VIEWPORT_TYPE,
  ORIENTATION,
} = cornerstone3D

const { createFloat32SharedArray } = Utilities

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const scene2UID = 'SCENE_2'
const axialViewportUID = 'AXIAL_VIEWPORT'
const sagittalViewportUID = 'SAGITTAL_VIEWPORT'
const customOrientationViewportUID = 'OFF_AXIS_VIEWPORT'
let renderingEngine

describe('RenderingEngine API:', () => {
  beforeEach(() => {
    renderingEngine = new RenderingEngine(renderingEngineUID)

    const canvasAxial = document.createElement('canvas')

    canvasAxial.width = 256
    canvasAxial.height = 512

    const canvasSagittal = document.createElement('canvas')

    canvasSagittal.width = 1024
    canvasSagittal.height = 1024

    const canvasCustomOrientation = document.createElement('canvas')

    canvasCustomOrientation.width = 63
    canvasCustomOrientation.height = 87

    renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: axialViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvasAxial,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene1UID,
        viewportUID: sagittalViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvasSagittal,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: customOrientationViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvasCustomOrientation,
        defaultOptions: {
          orientation: { sliceNormal: [0, 0, 1], viewUp: [0, 1, 0] },
        },
      },
    ])
  })

  it('Add multiple scenes to the viewport and have api access to both', () => {
    const scene1 = renderingEngine.getScene(scene1UID)

    const scene2 = renderingEngine.getScene(scene2UID)

    expect(scene1).toBeTruthy()
    expect(scene2).toBeTruthy()
  })

  it('should be able to access the viewports for a scene', () => {
    const scene1 = renderingEngine.getScene(scene1UID)

    const scene1AxialViewport = scene1.getViewport(axialViewportUID)
    const scene1Viewports = scene1.getViewports()

    expect(scene1AxialViewport).toBeTruthy()
    expect(scene1Viewports).toBeTruthy()
    expect(scene1Viewports.length).toEqual(2)
  })

  /*it('Add a volume to the scene and call its callback correctly', () => {
    const scene1 = renderingEngine.getScene(scene1UID)

    const testVolumeProps = {
      metadata: { FrameOfReferenceUID: '0.1.2.3' },
      dimensions: [512, 512, 512],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createFloat32SharedArray(512 * 512 * 512),
    }

    const testVolumeUID = 'testVolumeUID'

    cache.makeAndCacheLocalImageVolume(testVolumeProps, testVolumeUID)

    let callbackCalledWithCorrectProps = false
    const callback = ({ volumeActor, volumeUID }) => {
      if (volumeUID !== testVolumeUID) {
        return
      }

      if (!volumeActor) {
        return
      }

      callbackCalledWithCorrectProps = true
    }

    scene1.setVolumes([{ volumeUID: testVolumeUID, callback }])

    expect(callbackCalledWithCorrectProps).toEqual(true)
  })*/

  it('Take an orientation given by AXIAL as well as set manually by sliceNormal and viewUp', () => {
    const scene1 = renderingEngine.getScene(scene1UID)
    const scene2 = renderingEngine.getScene(scene2UID)

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
