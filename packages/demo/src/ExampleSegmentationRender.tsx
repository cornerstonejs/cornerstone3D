import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  ORIENTATION,
  VIEWPORT_TYPE,
  vtkSharedVolumeMapper,
  vtkStreamingOpenGLTexture
} from '@ohif/cornerstone-render'
import {
  SynchronizerManager,
  ToolGroupManager,
  ToolBindings,
  resetToolsState,
} from '@ohif/cornerstone-tools'
import * as csTools3d from '@ohif/cornerstone-tools'

import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume'
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import { setCTWWWC } from './helpers/transferFunctionHelpers'

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
        blendMode: BlendMode.COMPOSITE_BLEND,
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

  createLabelPipeline = (backgroundImageData) => {
    // Create a labelmap image the same dimensions as our background volume.
    const labelMapData = vtkImageData.newInstance(
    )

    const values = new Uint8Array(backgroundImageData.getNumberOfPoints())
    const dataArray = vtkDataArray.newInstance({
      numberOfComponents: 1, // labelmap with single component
      values,
    })
    labelMapData.getPointData().setScalars(dataArray)

    labelMapData.setDimensions(...backgroundImageData.getDimensions())
    labelMapData.setSpacing(...backgroundImageData.getSpacing())
    labelMapData.setOrigin(...backgroundImageData.getOrigin())
    labelMapData.setDirection(...backgroundImageData.getDirection())

    labelMapData.computeTransforms()

    const labelMap = {
      actor: vtkVolume.newInstance(),
      mapper: vtkSharedVolumeMapper.newInstance(),
      texture: vtkStreamingOpenGLTexture.newInstance(),
      imageData: labelMapData,
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
    }

    // Labelmap pipeline
    labelMap.mapper.setInputData(labelMapData)
    labelMap.mapper.setScalarTexture(labelMap.texture)
    labelMap.actor.setMapper(labelMap.mapper)

    // Set up labelMap color and opacity mapping
    labelMap.cfun.addRGBPoint(1, 1, 0, 0) // label "1" will be red
    labelMap.cfun.addRGBPoint(2, 0, 1, 0) // label "2" will be green
    labelMap.ofun.addPoint(0, 0)
    labelMap.ofun.addPoint(1, 0.9) // Red will have an opacity of 0.2.
    labelMap.ofun.addPoint(2, 0.9) // Green will have an opacity of 0.2.
    labelMap.ofun.setClamping(false)

    labelMap.actor.getProperty().setRGBTransferFunction(0, labelMap.cfun)
    labelMap.actor.getProperty().setScalarOpacity(0, labelMap.ofun)
    labelMap.actor.getProperty().setInterpolationTypeToNearest()
    labelMap.actor.getProperty().setUseLabelOutline(true)
    labelMap.actor.getProperty().setLabelOutlineThickness(3)

    return labelMap
  }

  fillBlobForThreshold = (imageData, backgroundImageData) => {
    const dims = imageData.getDimensions()
    const values = imageData.getPointData().getScalars().getData()

    const backgroundValues = backgroundImageData
      .getPointData()
      .getScalars()
      .getData()
    const size = dims[0] * dims[1] * dims[2]

    // Head
    const headThreshold = [324, 1524]
    for (let i = 0; i < size; i++) {
      if (
        backgroundValues[i] >= headThreshold[0] &&
        backgroundValues[i] < headThreshold[1]
      ) {
        values[i] = 1
      }
    }

    // Bone
    const boneThreshold = [1200, 2324]
    for (let i = 0; i < size; i++) {
      if (
        backgroundValues[i] >= boneThreshold[0] &&
        backgroundValues[i] < boneThreshold[1]
      ) {
        values[i] = 2
      }
    }

    imageData.getPointData().getScalars().setData(values)
  }

  loadSegmentation = async () => {
    // faking a segmentation data by thresholding
    const viewport = this.renderingEngine.getViewport('ctAxial')
    const ctScene = this.renderingEngine.getScene('ctScene')

    const { vtkImageData } = viewport.getImageData()
    const labelMap = this.createLabelPipeline(vtkImageData)

    this.fillBlobForThreshold(labelMap.imageData, vtkImageData)

    await ctScene.setSegmentations(labelMap, true)
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
          onClick={this.loadSegmentation}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Load Segmentation
        </button>

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
