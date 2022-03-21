import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const { RenderingEngine, cache, utilities, Enums } = cornerstone3D

const { VIEWPORT_TYPE, ORIENTATION } = Enums

const renderingEngineUID = utilities.uuidv4()

const axialViewportUID = 'AXIAL_VIEWPORT'
const sagittalViewportUID = 'SAGITTAL_VIEWPORT'
const customOrientationViewportUID = 'OFF_AXIS_VIEWPORT'

describe('RenderingEngineAPI -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false)
  })

  describe('RenderingEngine API:', function () {
    beforeEach(function () {
      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      this.elementAxial = document.createElement('div')

      this.elementAxial.width = 256
      this.elementAxial.height = 512

      this.elementSagittal = document.createElement('div')

      this.elementSagittal.width = 1024
      this.elementSagittal.height = 1024

      this.elementCustom = document.createElement('div')

      this.elementCustom.width = 63
      this.elementCustom.height = 87

      this.renderingEngine.setViewports([
        {
          viewportUID: axialViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementAxial,
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: sagittalViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementSagittal,
          defaultOptions: {
            orientation: ORIENTATION.SAGITTAL,
          },
        },
        {
          viewportUID: customOrientationViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementCustom,
          defaultOptions: {
            orientation: { sliceNormal: [0, 0, 1], viewUp: [0, 1, 0] },
          },
        },
      ])
    })

    afterEach(function () {
      this.renderingEngine.destroy()
      ;[this.elementAxial, this.elementSagittal, this.elementCustom].forEach(
        (el) => {
          if (el.parentNode) {
            el.parentNode.removeChild(el)
          }
        }
      )
      cache.purgeCache()
    })

    it('should be able to access the viewports from renderingEngine', function () {
      const AxialViewport = this.renderingEngine.getViewport(axialViewportUID)
      const Viewports = this.renderingEngine.getViewports()

      expect(AxialViewport).toBeTruthy()
      expect(Viewports).toBeTruthy()
      expect(Viewports.length).toEqual(3)
    })

    it('should be able to destroy the rendering engine', function () {
      this.renderingEngine.destroy()

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
      const AxialViewport = this.renderingEngine.getViewport(axialViewportUID)
      const CustomOrientationViewport = this.renderingEngine.getViewport(
        customOrientationViewportUID
      )

      const DefaultOptions1 = AxialViewport.defaultOptions
      const Orientation1 = DefaultOptions1.orientation
      const DefaultOptions2 = CustomOrientationViewport.defaultOptions
      const Orientation2 = DefaultOptions2.orientation

      expect(Orientation1.viewUp.length).toEqual(3)
      expect(Orientation1.sliceNormal.length).toEqual(3)
      expect(Orientation2.viewUp.length).toEqual(3)
      expect(Orientation2.sliceNormal.length).toEqual(3)
    })
  })

  describe('RenderingEngine Enable/Disable API:', function () {
    beforeEach(function () {
      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      this.elementAxial = document.createElement('div')

      this.elementAxial.width = 256
      this.elementAxial.height = 512

      this.elementSagittal = document.createElement('div')

      this.elementSagittal.width = 1024
      this.elementSagittal.height = 1024

      this.elementCustomOrientation = document.createElement('div')

      this.elementCustomOrientation.width = 63
      this.elementCustomOrientation.height = 87
    })

    afterEach(function () {
      this.renderingEngine.destroy()
      ;[
        this.elementAxial,
        this.elementSagittal,
        this.elementCustomOrientation,
      ].forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should be able to successfully use enable api', function () {
      const viewportInputEntries = [
        {
          viewportUID: axialViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementAxial,
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          viewportUID: sagittalViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementSagittal,
          defaultOptions: {
            orientation: ORIENTATION.SAGITTAL,
          },
        },
        {
          viewportUID: customOrientationViewportUID,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this.elementCustomOrientation,
          defaultOptions: {
            orientation: { sliceNormal: [0, 0, 1], viewUp: [0, 1, 0] },
          },
        },
      ]

      this.renderingEngine.enableElement(viewportInputEntries[0])

      let viewport1 = this.renderingEngine.getViewport(axialViewportUID)
      let viewport2 = this.renderingEngine.getViewport(sagittalViewportUID)

      expect(viewport1).toBeTruthy()
      expect(viewport1.uid).toBe(axialViewportUID)
      expect(viewport2).toBeUndefined()
    })

    it('should not enable element without an element', function () {
      const entry = {
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
        viewportUID: axialViewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this.elementAxial,
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
        viewportUID: axialViewportUID,
        type: VIEWPORT_TYPE.STACK,
        element: this.elementAxial,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      }

      this.renderingEngine.enableElement(entry)
      const stackViewports = this.renderingEngine.getStackViewports()
      expect(stackViewports.length).toBe(1)
    })
  })
})
