import * as cornerstone3D from '../../cornerstone-render/src/index'
import * as csTools3d from '../src/index'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  Utilities,
  unregisterAllImageLoaders,
  metaData,
  registerVolumeLoader,
} = cornerstone3D

const { ProbeTool, LengthTool, ToolGroupManager, ToolBindings } = csTools3d

const { fakeMetaDataProvider, fakeVolumeLoader } = Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const scene2UID = 'SCENE_2'
const viewportUID1 = 'VIEWPORT1'
const viewportUID2 = 'VIEWPORT2'

const DOMElements = []

function createCanvas(width, height) {
  // TODO: currently we need to have a parent div on the canvas with
  // position of relative for the svg layer to be set correctly
  const viewportPane1 = document.createElement('div')
  viewportPane1.style.position = 'relative'
  viewportPane1.style.display = 'block'
  viewportPane1.style.width = `${width}px`
  viewportPane1.style.height = `${height}px`

  document.body.appendChild(viewportPane1)

  const canvas1 = document.createElement('canvas')

  canvas1.style.position = 'absolute'
  canvas1.style.width = '100%'
  canvas1.style.height = '100%'
  viewportPane1.appendChild(canvas1)

  DOMElements.push(canvas1)
  DOMElements.push(viewportPane1)

  // Second viewport
  const viewportPane2 = document.createElement('div')
  viewportPane2.style.position = 'relative'
  viewportPane2.style.display = 'block'
  viewportPane2.style.width = `${width}px`
  viewportPane2.style.height = `${height}px`

  document.body.appendChild(viewportPane2)

  const canvas2 = document.createElement('canvas')

  canvas2.style.position = 'absolute'
  canvas2.style.width = '100%'
  canvas2.style.height = '100%'
  viewportPane2.appendChild(canvas2)

  DOMElements.push(canvas2)
  DOMElements.push(viewportPane2)

  return [canvas1, canvas2]
}

describe('Synchronizer Manager: ', () => {
  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(ProbeTool, {})
    cache.purgeCache()
    this.toolGroup = ToolGroupManager.createToolGroup('volume1')
    this.toolGroup.addTool('Probe')
    this.toolGroup.setToolActive('Probe', {
      bindings: [
        {
          mouseButton: ToolBindings.Mouse.Primary,
        },
      ],
    })
    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    ToolGroupManager.destroy()
    csTools3d.destroy()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully creates tool groups', function () {
    const [canvas1, canvas2] = createCanvas(512, 128)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    this.toolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )

    const tg = ToolGroupManager.getToolGroupById('volume1')
    expect(tg).toBeDefined()
  })
})

describe('Synchronizer Manager: ', () => {
  beforeEach(function () {
    csTools3d.init()
    csTools3d.addTool(ProbeTool, {})
    cache.purgeCache()
    this.toolGroup = ToolGroupManager.createToolGroup('volume1')
    this.toolGroup.addTool('Probe')
    this.toolGroup.setToolActive('Probe', {
      bindings: [
        {
          mouseButton: ToolBindings.Mouse.Primary,
        },
      ],
    })
    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    // Destroy synchronizer manager to test it first since csTools3D also destroy
    // synchronizers
    ToolGroupManager.destroyToolGroupById('volume1')
    csTools3d.destroy()
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should successfully create toolGroup and get tool instances', function () {
    const [canvas1, canvas2] = createCanvas(512, 128)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    this.toolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )

    const tg = ToolGroupManager.getToolGroupById('volume1')
    expect(tg).toBeDefined()

    const tg2 = ToolGroupManager.getToolGroups(
      renderingEngineUID,
      scene1UID,
      viewportUID1
    )
    expect(tg2).toBeDefined()
    expect(tg2.length).toBe(1)
    expect(tg).toBe(tg2[0])

    const tg3 = ToolGroupManager.createToolGroup('volume1')
    expect(tg3).toBeUndefined()

    const instance = tg.getToolInstance('Probe')
    expect(instance.name).toBe('Probe')

    const instance2 = tg.getToolInstance('probe')
    expect(instance2).toBeUndefined()
  })

  it('Should successfully Use toolGroup manager API', function () {
    const [canvas1, canvas2] = createCanvas(512, 128)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    // Remove viewports
    let tg = ToolGroupManager.getToolGroupById('volume1')

    tg.addViewports(this.renderingEngine.uid, scene1UID, viewportUID1)
    expect(tg.viewports.length).toBe(1)

    tg.removeViewports(renderingEngineUID)

    tg = ToolGroupManager.getToolGroupById('volume1')
    expect(tg.viewports.length).toBe(0)

    //
    tg.addViewports(this.renderingEngine.uid, scene1UID, viewportUID1)
    tg = ToolGroupManager.getToolGroupById('volume1')
    expect(tg.viewports.length).toBe(1)

    tg.removeViewports(renderingEngineUID, scene2UID, viewportUID2)
    expect(tg.viewports.length).toBe(1)
  })

  it('Should successfully make a tool enabled/disabled/active/passive', function () {
    const [canvas1, canvas2] = createCanvas(512, 128)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    this.toolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )

    // Remove viewports
    let tg = ToolGroupManager.getToolGroupById('volume1')
    expect(tg._tools['Probe'].mode).toBe('Active')
    expect(tg._tools['Length']).toBeUndefined()

    tg.setToolPassive('Probe')
    expect(tg._tools['Probe'].mode).toBe('Passive')
  })

  it('Should successfully setTool status', function () {
    const [canvas1, canvas2] = createCanvas(512, 128)

    this.renderingEngine.setViewports([
      {
        sceneUID: scene1UID,
        viewportUID: viewportUID1,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: scene2UID,
        viewportUID: viewportUID2,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: canvas2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: ORIENTATION.AXIAL,
        },
      },
    ])

    this.toolGroup.addViewports(
      this.renderingEngine.uid,
      scene1UID,
      viewportUID1
    )

    // Remove viewports
    let tg = ToolGroupManager.getToolGroupById('volume1')
    tg.setToolActive()
    tg.setToolPassive()
    tg.setToolEnabled()
    tg.setToolDisabled()

    expect(tg._tools['Probe'].mode).toBe('Active')

    csTools3d.addTool(LengthTool, {})
    tg.addTool('Length')
    tg.setToolEnabled('Length')
    expect(tg._tools['Length'].mode).toBe('Enabled')

    tg.setToolDisabled('Length')
    expect(tg._tools['Length'].mode).toBe('Disabled')
  })
})
