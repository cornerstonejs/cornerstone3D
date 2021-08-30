import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  EVENTS,
  RenderingEngine,
  createAndCacheVolume,
  cache,
  Utilities,
  VIEWPORT_TYPE,
  ORIENTATION,
} = cornerstone3D

//const { createFloat32SharedArray } = Utilities

const renderingEngineUID = Utilities.uuidv4()

const scene1UID = 'SCENE_1'
const scene2UID = 'SCENE_2'
const axialViewportUID = 'AXIAL_VIEWPORT'
const sagittalViewportUID = 'SAGITTAL_VIEWPORT'
const customOrientationViewportUID = 'OFF_AXIS_VIEWPORT'

const DOMElements = []

describe('RenderingEngine API:', function () {
  beforeEach(function () {
    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    this.canvasAxial = document.createElement('canvas')

    this.canvasAxial.width = 256
    this.canvasAxial.height = 512

    this.canvasSagittal = document.createElement('canvas')

    this.canvasSagittal.width = 1024
    this.canvasSagittal.height = 1024

    this.canvasCustomOrientation = document.createElement('canvas')

    this.canvasCustomOrientation.width = 63
    this.canvasCustomOrientation.height = 87

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

  afterEach(function () {
    this.renderingEngine.destroy()
    cache.purgeCache()
  })

  it('Add multiple scenes to the viewport and have api access to both', function () {
    let scene1 = this.renderingEngine.getScene(scene1UID)

    let scene2 = this.renderingEngine.getScene(scene2UID)

    expect(scene1).toBeTruthy()
    expect(scene2).toBeTruthy()

    let scenes = this.renderingEngine.getScenes()

    expect(scenes.length).toBe(2)

    this.renderingEngine.removeScene(scene1UID)

    scene1 = this.renderingEngine.getScene(scene1UID)
    scenes = this.renderingEngine.getScenes()

    expect(scene1).not.toBeTruthy()
    expect(scenes.length).toBe(1)
  })

  it('should be able to access the viewports for a scene', function () {
    const scene1 = this.renderingEngine.getScene(scene1UID)

    const scene1AxialViewport = scene1.getViewport(axialViewportUID)
    const scene1Viewports = scene1.getViewports()

    expect(scene1AxialViewport).toBeTruthy()
    expect(scene1Viewports).toBeTruthy()
    expect(scene1Viewports.length).toEqual(2)
  })

  it('should be able to destroy the rendering engine', function () {
    this.renderingEngine.destroy()

    expect(function () {
      this.renderingEngine.getScenes()
    }).toThrow()
    expect(function () {
      this.renderingEngine.getViewports()
    }).toThrow()
  })

  it('should be able to handle destroy of an engine that has been destroyed', function () {
    this.renderingEngine.destroy()
    const response = this.renderingEngine.destroy()
    expect(response).toBeUndefined()
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

describe('RenderingEngine Enable/Disable API:', function () {
  beforeEach(function () {
    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    this.canvasAxial = document.createElement('canvas')

    this.canvasAxial.width = 256
    this.canvasAxial.height = 512

    this.canvasSagittal = document.createElement('canvas')

    this.canvasSagittal.width = 1024
    this.canvasSagittal.height = 1024

    this.canvasCustomOrientation = document.createElement('canvas')

    this.canvasCustomOrientation.width = 63
    this.canvasCustomOrientation.height = 87
  })

  afterEach(function () {
    this.renderingEngine.destroy()
  })

  it('should be able to successfully use enable api', function () {
    const viewportInputEntries = [
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
    ]

    this.renderingEngine.enableElement(viewportInputEntries[0])

    let scene1 = this.renderingEngine.getScene(scene1UID)
    let scene2 = this.renderingEngine.getScene(scene2UID)

    expect(scene1).toBeTruthy()
    expect(scene1.uid).toBe(scene1UID)
    expect(scene2).toBeUndefined()
  })

  it('should not enable element without canvas', function () {
    const entry = {
      sceneUID: scene1UID,
      viewportUID: axialViewportUID,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    }

    const enable = function () {
      this.renderingEngine.enableElement(entry)
    }
    expect(enable).toThrow()
  })

  it('should successfully use disable element API', function () {
    const entry = {
      sceneUID: scene1UID,
      viewportUID: axialViewportUID,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: this.canvasAxial,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    }

    this.renderingEngine.enableElement(entry)
    let viewport1 = this.renderingEngine.getViewport(axialViewportUID)
    expect(viewport1).toBeTruthy()

    this.renderingEngine.disableElement(axialViewportUID)
    viewport1 = this.renderingEngine.getViewport(axialViewportUID)
    expect(viewport1).toBeUndefined()
  })

  it('should successfully get StackViewports', function () {
    const entry = {
      sceneUID: undefined,
      viewportUID: axialViewportUID,
      type: VIEWPORT_TYPE.STACK,
      canvas: this.canvasAxial,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    }

    this.renderingEngine.enableElement(entry)
    const stackViewports = this.renderingEngine.getStackViewports()
    expect(stackViewports.length).toBe(1)
  })
})

describe('Scene API:', function () {
  beforeEach(function () {
    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    this.canvasAxial = document.createElement('canvas')

    this.canvasAxial.style.width = '256px'
    this.canvasAxial.style.height = '512px'

    document.body.appendChild(this.canvasAxial)
    DOMElements.push(this.canvasAxial)

    this.canvasSagittal = document.createElement('canvas')

    this.canvasSagittal.style.width = '256px'
    this.canvasSagittal.style.height = '512px'

    document.body.appendChild(this.canvasSagittal)
    DOMElements.push(this.canvasSagittal)

    this.canvasCustomOrientation = document.createElement('canvas')

    this.canvasCustomOrientation.style.width = '63px'
    this.canvasCustomOrientation.style.height = '87px'

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
          background: [1, 0, 1],
        },
      },
      {
        sceneUID: scene1UID,
        viewportUID: sagittalViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.canvasSagittal,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 1, 0],
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

  afterEach(function () {
    this.renderingEngine.destroy()
    cache.purgeCache()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  // it('should be able to setVolumes with more than one volume', function (done) {
  //   const volumeId1 = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
  //   const volumeId2 = 'fakeVolumeLoader:volumeURI_100_100_8_1_1_1_0'

  //   let canvasRender = 0

  //   const eventHandler = () => {
  //     canvasRender += 1
  //     if (canvasRender !== 2) {
  //       return
  //     }
  //     const ctScene = this.renderingEngine.getScene(scene1UID)
  //     const axialActor = ctScene.getVolumeActor(volumeId1)
  //     expect(axialActor).toBeTruthy()

  //     done()
  //   }

  //   this.canvasAxial.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)
  //   this.canvasSagittal.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

  //   try {
  //     createAndCacheVolume(volumeId1, { imageIds: [] }).then(() => {
  //       createAndCacheVolume(volumeId2, { imageIds: [] }).then(() => {
  //         const ctScene = this.renderingEngine.getScene(scene1UID)
  //         ctScene
  //           .setVolumes([{ volumeUID: volumeId1 }, { volumeUID: volumeId2 }])
  //           .then(() => {
  //             ctScene.render()
  //           })
  //       })
  //     })
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // })

  // it('should be able to remove viewport from scene', function (done) {
  //   const volumeId1 = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

  //   const eventHandler = () => {
  //     const ctScene = this.renderingEngine.getScene(scene1UID)
  //     let viewports = ctScene.getViewports()
  //     expect(viewports.length).toBe(2) // 2 viewports for CT scene

  //     ctScene.removeViewportByUID(axialViewportUID)

  //     viewports = ctScene.getViewports()
  //     expect(viewports.length).toBe(1) // removed one viewport
  //     expect(viewports[0]).toBe(ctScene.getViewport(sagittalViewportUID))
  //     done()
  //   }

  //   this.canvasAxial.addEventListener(EVENTS.IMAGE_RENDERED, eventHandler)

  //   try {
  //     createAndCacheVolume(volumeId1, { imageIds: [] }).then(() => {
  //       const ctScene = this.renderingEngine.getScene(scene1UID)
  //       ctScene.setVolumes([{ volumeUID: volumeId1 }]).then(() => {
  //         ctScene.render()
  //       })
  //     })
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // })
})
