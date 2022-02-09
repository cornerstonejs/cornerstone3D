import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  metaData,
  ORIENTATION,
  VIEWPORT_TYPE,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import { ToolBindings } from '@precisionmetrics/cornerstone-tools'
import * as cs from '@precisionmetrics/cornerstone-render'

import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'
import { registerWebImageLoader } from '@precisionmetrics/cornerstone-image-loader-streaming-volume'

import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ptVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'

const VOLUME = 'volume'

window.cache = cache

let ctSceneToolGroup,
  stackCTViewportToolGroup,
  stackPTViewportToolGroup,
  stackDXViewportToolGroup,
  ptSceneToolGroup

const toolsToUse = ANNOTATION_TOOLS
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class EnableDisableViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 2,
      viewports: [{}, {}, {}, {}, {}, {}],
    },
    leftClickTool: 'Levels',

    enabledViewports: [],
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    selectedViewportIndex: 0, // for disabling and enabling viewports
    viewportInputEntries: [],
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    this._offScreenRef = React.createRef()

    this.petVolumeImageIdsPromise = getImageIds('pt1', VOLUME)
    this.ctVolumeImageIdsPromise = getImageIds('ct1', VOLUME)
    this.ctVolumeImageIdsPromise2 = getImageIds('ct2', VOLUME)

    this.dxImageIdsPromise = getImageIds('dx')
    this.ctStackImageIdsPromise = getImageIds('ctStack')

    this.colorImageIds = config.colorImages.imageIds

    metaData.addProvider(
      (type, imageId) =>
        hardcodedMetaDataProvider(type, imageId, this.colorImageIds),
      10000
    )

    registerWebImageLoader(cs)

    this.numberOfViewports =
      this.state.viewportGrid.numCols * this.state.viewportGrid.numRows

    // Promise.all([this.petCTImageIdsPromise, this.dxImageIdsPromise]).then(() =>
    //   this.setState({ progressText: 'Loading data...' })
    // )

    // const {
    //   createCameraPositionSynchronizer,
    //   createVOISynchronizer,
    // } = synchronizers

    // this.axialSync = createCameraPositionSynchronizer('axialSync')
    // this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    // this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    // this.ctWLSync = createVOISynchronizer('ctWLSync')
    // this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    ;({
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackDXViewportToolGroup,
      ptSceneToolGroup,
    } = initToolGroups({
      configuration: { preventHandleOutsideImage: true },
    }))

    this.setState({
      viewportInputEntries: [
        {
          // CT volume axial
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this._elementNodes.get(0),
          toolGroup: ctSceneToolGroup,
          defaultOptions: {
            orientation: ORIENTATION.SAGITTAL,
          },
        },
        {
          // stack CT
          viewportUID: VIEWPORT_IDS.STACK.CT,
          type: VIEWPORT_TYPE.STACK,
          element: this._elementNodes.get(1),
          toolGroup: stackCTViewportToolGroup,
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          // dx
          viewportUID: VIEWPORT_IDS.STACK.DX,
          type: VIEWPORT_TYPE.STACK,
          element: this._elementNodes.get(2),
          toolGroup: stackDXViewportToolGroup,
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          // CT volume Coronal
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.CORONAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this._elementNodes.get(3),
          toolGroup: ctSceneToolGroup,
          defaultOptions: {
            orientation: ORIENTATION.CORONAL,
          },
        },
        {
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.AXIAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          element: this._elementNodes.get(4),
          toolGroup: ctSceneToolGroup,
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
      ],
    })

    const renderingEngine = new RenderingEngine(renderingEngineUID)
    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    // Create volumes
    const dxImageIds = await this.dxImageIdsPromise
    const ctStackImageIds = await this.ctStackImageIdsPromise
    const ctVolumeImageIds = await this.ctVolumeImageIdsPromise
    const ctVolumeImageIds2 = await this.ctVolumeImageIdsPromise2
    const petVolumeImageIds = await this.petVolumeImageIdsPromise
    const colorImageIds = this.colorImageIds

    renderingEngine.enableElement(this.state.viewportInputEntries[0]) // ct volume
    renderingEngine.enableElement(this.state.viewportInputEntries[1]) // stack

    // Tools added for the first two viewports

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    )

    // stack ct
    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackDXViewportToolGroup,
      ptSceneToolGroup,
    })

    renderingEngine.render()

    const ctStackLoad = async () => {
      const stackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
      await stackViewport.setStack(sortImageIdsByIPP(ctStackImageIds))
    }

    this.ctStackLoad = ctStackLoad

    const dxColorLoad = async () => {
      const dxColorViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.DX)

      const fakeStack = [
        dxImageIds[0],
        colorImageIds[0],
        dxImageIds[1],
        ctStackImageIds[40],
        colorImageIds[1],
        colorImageIds[2],
        ctStackImageIds[41],
      ]
      await dxColorViewport.setStack(fakeStack)

      stackDXViewportToolGroup.addViewports(
        renderingEngineUID,
        undefined,
        VIEWPORT_IDS.STACK.DX
      )
    }

    this.dxColorLoad = dxColorLoad

    const CTVolumeLoad = async () => {
      // This only creates the volumes, it does not actually load all
      // of the pixel data (yet)
      const ctVolume = await createAndCacheVolume(ctVolumeUID, {
        imageIds: ctVolumeImageIds,
      })

      const { scalarData } = ctVolume
      const ctLength = scalarData.length

      // if this is the first time we are loading the volume
      if (scalarData[0] === 0) {
        // Initialize all CT values to -1024 so we don't get a grey box?
        for (let i = 0; i < ctLength; i++) {
          scalarData[i] = -1024
        }
      }

      const onLoad = () => this.setState({ progressText: 'Loaded.' })

      ctVolume.load(onLoad)

      const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
      ctScene.setVolumes([{ volumeUID: ctVolumeUID }])

      // Set initial CT levels in UI
      const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

      this.setState({
        ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
      })
    }

    const PETVolumeLoad = async () => {
      // This only creates the volumes, it does not actually load all
      // of the pixel data (yet)
      const ptVolume = await createAndCacheVolume(ptVolumeUID, {
        imageIds: ctVolumeImageIds2,
      })

      ptVolume.load()

      const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
      ctScene.setVolumes([{ volumeUID: ptVolumeUID }])
      ctScene.render()
    }

    ctStackLoad()
    CTVolumeLoad()
    this.CTVolumeLoad = CTVolumeLoad
    this.PETVolumeLoad = PETVolumeLoad

    this.setState({
      enabledViewports: [0, 1],
      metadataLoaded: true,
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()

    this.renderingEngine.destroy()
  }

  setSelectedViewportIndex = (evt) => {
    const index = evt.target.value
    this.setState({ selectedViewportIndex: parseInt(index) })
  }

  disableSelectedViewport = () => {
    const viewportIndex = this.state.selectedViewportIndex

    const viewportInput = this.state.viewportInputEntries[viewportIndex]

    this.renderingEngine.disableElement(viewportInput.viewportUID)

    this.setState((state) => ({
      ...state,
      enabledViewports: state.enabledViewports.filter(
        (item) => item !== viewportIndex
      ),
    }))
  }

  enableSelectedViewport = () => {
    const viewportIndex = this.state.selectedViewportIndex

    const viewportInput = this.state.viewportInputEntries[viewportIndex]

    this.renderingEngine.enableElement(viewportInput)

    const { toolGroup, sceneUID, viewportUID, type, canvas } = viewportInput

    toolGroup.addViewports(renderingEngineUID, sceneUID, viewportUID)

    // load
    if (viewportUID === VIEWPORT_IDS.STACK.CT) {
      this.ctStackLoad()
    } else if (viewportUID === VIEWPORT_IDS.STACK.DX) {
      this.dxColorLoad()
    } else {
      // if we have removed the scene when disabling all the related viewports
      // set the volume again
      const ctScene = this.renderingEngine.getScene(sceneUID)
      if (!ctScene.getVolumeActors().length) {
        this.CTVolumeLoad()
      }
    }

    this.setState((state) => ({
      ...state,
      enabledViewports: [...state.enabledViewports, viewportIndex],
    }))
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false
    const options = {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    }
    if (isAnnotationToolOn) {
      // Set tool active

      const toolsToSetPassive = toolsToUse.filter((name) => name !== toolName)

      ctSceneToolGroup.setToolActive(toolName, options)
      ptSceneToolGroup.setToolActive(toolName, options)
      stackCTViewportToolGroup.setToolActive(toolName, options)
      stackDXViewportToolGroup.setToolActive(toolName, options)

      toolsToSetPassive.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        ptSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
        stackDXViewportToolGroup.setToolPassive(toolName)
      })

      ctSceneToolGroup.setToolDisabled('WindowLevel')
      ptSceneToolGroup.setToolDisabled('WindowLevel')
      stackCTViewportToolGroup.setToolDisabled('WindowLevel')
      stackDXViewportToolGroup.setToolDisabled('WindowLevel')
    } else {
      // Set window level + threshold
      ctSceneToolGroup.setToolActive('WindowLevel', options)
      ptSceneToolGroup.setToolActive('WindowLevel', options)
      stackCTViewportToolGroup.setToolActive('WindowLevel', options)
      stackDXViewportToolGroup.setToolActive('WindowLevel', options)

      // Set all annotation tools passive
      toolsToUse.forEach((toolName) => {
        ctSceneToolGroup.setToolPassive(toolName)
        ptSceneToolGroup.setToolPassive(toolName)
        stackCTViewportToolGroup.setToolPassive(toolName)
        stackDXViewportToolGroup.setToolPassive(toolName)
      })
    }

    this.renderingEngine.render()
    this.setState({ leftClickTool: toolName })
  }

  showOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }
  render() {
    return (
      <div>
        <div>
          <h1>
            Stack and Volume Viewports (enableElement and disableElement API)
          </h1>
          {!window.crossOriginIsolated ? (
            <h1 style={{ color: 'red' }}>
              This Demo requires SharedArrayBuffer but your browser does not
              support it
            </h1>
          ) : null}
          <p>
            This is a demo using the enableElement and disableElement API for
            volume viewports and stack viewports.
          </p>
          <p>
            By default, two viewports renders to the screen, the user can add
            more viewports to the screen by selecting the viewportUID in the
            list of available viewports.
          </p>
          <p>
            Viewports can also be removed from the screen by selecting the
            viewportUID in the dropdown and disabling it.
          </p>
          <p>
            A render of offscreen canvas is shown below, to demonstrate correct
            resizing upon enabling/disabling viewports.
          </p>
        </div>
        <button
          onClick={() => this.enableSelectedViewport()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Enable Selected Viewport
        </button>
        <button
          onClick={() => this.disableSelectedViewport()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Disable Selected Viewport
        </button>
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {ctLayoutTools.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <div className="col-md-4">
          {/* <label>Viewports:</label> */}
          <select
            value={this.state.selectedViewportIndex}
            onChange={this.setSelectedViewportIndex}
            className="form-control "
          >
            {this.state.viewportInputEntries &&
              this.state.viewportInputEntries.map((vpEntry, index) => (
                <option key={index} value={index}>
                  {this.state.enabledViewports.includes(index)
                    ? vpEntry.viewportUID + ' --- enabled'
                    : vpEntry.viewportUID + ' --- disabled'}
                </option>
              ))}
          </select>
        </div>
        <div style={{ paddingBottom: '55px' }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: '650px', marginTop: '35px' }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '2px solid grey',
                  background: 'black',
                  ...(vp.cellStyle || {}),
                }}
                ref={(c) => this._elementNodes.set(i, c)}
                onContextMenu={(e) => e.preventDefault()}
                key={i}
              />
            ))}
          </ViewportGrid>
        </div>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hideOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    )
  }
}

export default EnableDisableViewportExample
