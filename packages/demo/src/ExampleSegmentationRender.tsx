import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  ORIENTATION,
  VIEWPORT_TYPE,
  createAndCacheDerivedVolume,
  Settings,
} from '@ohif/cornerstone-render'
import { ToolBindings, SegmentationModule } from '@ohif/cornerstone-tools'
import * as csTools3d from '@ohif/cornerstone-tools'

import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'

import {
  setCTWWWC,
  setSegmentationTransferFunction,
} from './helpers/transferFunctionHelpers'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'

const VOLUME = 'volume'

window.cache = cache

let ctSceneToolGroup
const { BlendMode } = vtkConstants

const toolsToUse = ['WindowLevel', 'Pan', 'Zoom', ...ANNOTATION_TOOLS]

class SegmentationRender extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    // segmentation state
    renderOutline: false,
    renderInactiveLabelmaps: true,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 1,
      viewports: [{}, {}, {}],
    },
    ptCtLeftClickTool: 'WindowLevel',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._canvasNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.volumeImageIds = getImageIds('ct1', VOLUME)

    Promise.all([this.volumeImageIds]).then(() =>
      this.setState({ progressText: 'Loading data...' })
    )

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
    ;({ ctSceneToolGroup } = initToolGroups())

    const volumeImageIds = await this.volumeImageIds

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 0, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [1, 0, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 0, 1],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.CORONAL
    )

    addToolsToToolGroups({ ctSceneToolGroup })

    renderingEngine.render()

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: volumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    // const { scalarData } = ctVolume
    // const ctLength = scalarData.length

    // for (let i = 0; i < ctLength; i++) {
    //   scalarData[i] = -1024
    // }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    await ctScene.setVolumes([
      {
        volumeUID: ctVolumeUID,
        callback: setCTWWWC,
        blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND,
      },
    ])

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this
    const onLoad = () => this.setState({ progressText: 'Loaded.' })
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

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  resetToolModes = (toolGroup) => {
    ANNOTATION_TOOLS.forEach((toolName) => {
      toolGroup.setToolPassive(toolName)
    })
    toolGroup.setToolActive('WindowLevel', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    })
    toolGroup.setToolActive('Pan', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Auxiliary }],
    })
    toolGroup.setToolActive('Zoom', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Secondary }],
    })
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    this.resetToolModes(ctSceneToolGroup)

    const tools = Object.entries(ctSceneToolGroup.tools)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.length &&
        bindings.some(
          (binding) => binding.mouseButton === ToolBindings.Mouse.Primary
        )
    )

    ctSceneToolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings = ctSceneToolGroup.tools[toolName].bindings

    ctSceneToolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        { mouseButton: ToolBindings.Mouse.Primary },
      ],
    })

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  fillBlobForThreshold = (
    imageData,
    backgroundImageData,
    segments = ['bone', 'softTissue', 'fatTissue']
  ) => {
    const dims = imageData.getDimensions()
    const values = imageData.getPointData().getScalars().getData()

    const backgroundValues = backgroundImageData
      .getPointData()
      .getScalars()
      .getData()
    const size = dims[0] * dims[1] * dims[2]

    // Bone
    const boneThreshold = [226, 3071]
    const softTissueThreshold = [-700, 255]
    const fatTissueThreshold = [-205, -51]

    for (let i = 0; i < size; i++) {
      if (
        segments.includes('bone') &&
        backgroundValues[i] >= boneThreshold[0] &&
        backgroundValues[i] < boneThreshold[1]
      ) {
        values[i] = 1
      }

      if (
        segments.includes('softTissue') &&
        backgroundValues[i] >= softTissueThreshold[0] &&
        backgroundValues[i] < softTissueThreshold[1]
      ) {
        values[i] = 2
      }

      if (
        segments.includes('fatTissue') &&
        backgroundValues[i] >= fatTissueThreshold[0] &&
        backgroundValues[i] < fatTissueThreshold[1]
      ) {
        values[i] = 3
      }
    }

    imageData.getPointData().getScalars().setData(values)
  }

  loadSegmentation = async (labelmapNumber) => {
    // faking a segmentation data by thresholding
    const viewport = this.renderingEngine.getViewport('ctAxial')

    const anatomies = [['bone', 'softTissue'], ['fatTissue']]

    SegmentationModule.setSegmentationConfig({
      renderOutline: this.state.renderOutline,
      renderInactiveLabelmaps: this.state.renderInactiveLabelmaps,
    })

    const labelmapIndex = labelmapNumber
    const labelmapUID = await SegmentationModule.setActiveLabelmapIndex(
      viewport.canvas,
      labelmapIndex
    )
    const labelmap = cache.getVolume(labelmapUID)

    const { vtkImageData: backgroundImageData } = viewport.getImageData()
    this.fillBlobForThreshold(
      labelmap.vtkImageData,
      backgroundImageData,
      anatomies[labelmapNumber]
    )
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

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>One Volume MPR Example ({this.state.progressText})</h2>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {toolsToUse.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <button
          onClick={() => this.loadSegmentation(0)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Load Bone & Soft Tissue Labelmap
        </button>
        <button
          onClick={() => this.loadSegmentation(1)}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Load Fat Tissue Labelmap
        </button>

        <input
          type="checkbox"
          style={{ marginLeft: '10px' }}
          name="toggle"
          onClick={() =>
            this.setState({
              renderOutline: !this.state.renderOutline,
            })
          }
        />
        <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
          Render Outline
        </label>
        <input
          type="checkbox"
          style={{ marginLeft: '10px' }}
          name="toggle"
          defaultChecked={this.state.renderInactiveLabelmaps}
          onClick={() =>
            this.setState({
              renderInactiveLabelmaps: !this.state.renderInactiveLabelmaps,
            })
          }
        />
        <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
          Render inactive Labelmaps
        </label>
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              className="viewport-pane"
              style={{
                ...(vp.cellStyle || {}),
                border: '2px solid grey',
                background: 'black',
              }}
              key={i}
            >
              <canvas ref={(c) => this._canvasNodes.set(i, c)} />
            </div>
          ))}
        </ViewportGrid>
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
            onClick={this.hidOffScreenCanvas}
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

export default SegmentationRender
