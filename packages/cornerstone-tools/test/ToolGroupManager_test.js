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

const renderingEngineUID = Utilities.uuidv4()

const viewportUID1 = 'VIEWPORT1'
const viewportUID2 = 'VIEWPORT2'

const DOMElements = []

function createViewports(width, height) {
  const element1 = document.createElement('div')

  element1.style.width = `${width}px`
  element1.style.height = `${height}px`
  document.body.appendChild(element1)

  DOMElements.push(element1)

  const element2 = document.createElement('div')

  element2.style.width = `${width}px`
  element2.style.height = `${height}px`
  document.body.appendChild(element2)

  DOMElements.push(element2)

  return [element1, element2]
}

describe('ToolGroup Manager: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('ToolGroup Manager: ', () => {
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
      const [element1, element2] = createViewports(512, 128)

      this.renderingEngine.setViewports([
        {
          viewportUID: viewportUID1,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: viewportUID2,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
      ])

      this.toolGroup.addViewports(this.renderingEngine.uid, viewportUID1)

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
      const [element1, element2] = createViewports(512, 128)

      this.renderingEngine.setViewports([
        {
          viewportUID: viewportUID1,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: viewportUID2,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
      ])

      this.toolGroup.addViewports(this.renderingEngine.uid, viewportUID1)

      const tg = ToolGroupManager.getToolGroupById('volume1')
      expect(tg).toBeDefined()

      const tg2 = ToolGroupManager.getToolGroups(
        renderingEngineUID,
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
      const [element1, element2] = createViewports(512, 128)

      this.renderingEngine.setViewports([
        {
          viewportUID: viewportUID1,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: viewportUID2,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
      ])

      // Remove viewports
      let tg = ToolGroupManager.getToolGroupById('volume1')

      tg.addViewports(this.renderingEngine.uid, viewportUID1)
      expect(tg.viewports.length).toBe(1)

      tg.removeViewports(renderingEngineUID)

      tg = ToolGroupManager.getToolGroupById('volume1')
      expect(tg.viewports.length).toBe(0)

      //
      tg.addViewports(this.renderingEngine.uid, viewportUID1)
      tg = ToolGroupManager.getToolGroupById('volume1')
      expect(tg.viewports.length).toBe(1)

      tg.removeViewports(renderingEngineUID, viewportUID2)
      expect(tg.viewports.length).toBe(1)
    })

    it('Should successfully make a tool enabled/disabled/active/passive', function () {
      const [element1, element2] = createViewports(512, 128)

      this.renderingEngine.setViewports([
        {
          viewportUID: viewportUID1,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: viewportUID2,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
      ])

      this.toolGroup.addViewports(this.renderingEngine.uid, viewportUID1)

      // Remove viewports
      let tg = ToolGroupManager.getToolGroupById('volume1')
      expect(tg._toolInstances['Probe'].mode).toBe('Active')
      expect(tg._toolInstances['Length']).toBeUndefined()

      tg.setToolPassive('Probe')
      expect(tg._toolInstances['Probe'].mode).toBe('Passive')
    })

    it('Should successfully setTool status', function () {
      const [element1, element2] = createViewports(512, 128)

      this.renderingEngine.setViewports([
        {
          viewportUID: viewportUID1,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: viewportUID2,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: ORIENTATION.AXIAL,
          },
        },
      ])

      this.toolGroup.addViewports(this.renderingEngine.uid, viewportUID1)

      // Remove viewports
      let tg = ToolGroupManager.getToolGroupById('volume1')
      tg.setToolActive()
      tg.setToolPassive()
      tg.setToolEnabled()
      tg.setToolDisabled()

      expect(tg._toolInstances['Probe'].mode).toBe('Active')

      csTools3d.addTool(LengthTool, {})
      tg.addTool('Length')
      tg.setToolEnabled('Length')
      expect(tg._toolInstances['Length'].mode).toBe('Enabled')

      tg.setToolDisabled('Length')
      expect(tg._toolInstances['Length'].mode).toBe('Disabled')
    })
  })
})
