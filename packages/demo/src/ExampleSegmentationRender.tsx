import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  EVENTS as RENDERING_EVENTS,
  createAndCacheDerivedVolume,
} from '@ohif/cornerstone-render'
import {
  SegmentationModule,
  synchronizers,
  ToolBindings,
  ToolGroupManager,
} from '@ohif/cornerstone-tools'
import * as csTools3d from '@ohif/cornerstone-tools'

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps'

import getImageIds from './helpers/getImageIds'
import ptCtToggleAnnotationTool from './helpers/ptCtToggleAnnotationTool'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
  ANNOTATION_TOOLS,
  SEGMENTATION_TOOLS,
  TOOL_GROUP_UIDS,
} from './constants'
import LAYOUTS, { ptCtFusion, fourUpCT, petTypes, obliqueCT } from './layouts'
import config from './config/default'

import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import limitImageIds from './helpers/limitImageIds'

const VOLUME = 'volume'
const STACK = 'stack'

let ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
  ctObliqueToolGroup,
  ptTypesSceneToolGroup,
  ptCtLayoutTools

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const toolsToUse = ['WindowLevel', 'Pan', 'Zoom', ...ANNOTATION_TOOLS]

const labelmap1UID = 'boneAndSoftTissue'
const labelmap2UID = 'fatTissue'
class MPRExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    // segmentation state
    renderOutline: true,
    renderInactiveLabelmaps: true,
    //
    viewportGrid: {
      numCols: 4,
      numRows: 3,
      viewports: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          cellStyle: {
            gridRow: '1 / span 3',
            gridColumn: '4',
          },
        },
      ],
    },
    ptCtLeftClickTool: 'Levels',
    segmentationTool: 'RectangleScissors',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    // Segmentation
    segmentationStatus: '',
    segmentationToolActive: false,
    sceneForSegmentation: SCENE_IDS.CT,
    selectedLabelmapUID: '',
    availableLabelmaps: [],
    activeSegmentIndex: 1,
    fillAlpha: 0.9,
    fillAlphaInactive: 0.8,
    segmentLocked: false,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._offScreenRef = React.createRef()

    ptCtLayoutTools = ['Levels'].concat(toolsToUse)

    this._canvasNodes = new Map()
    this._viewportGridRef = React.createRef()
    this.swapPetTransferFunction = this.swapPetTransferFunction.bind(this)

    const { limitFrames } = config

    const callback = (imageIds) => {
      if (limitFrames !== undefined && typeof limitFrames === 'number') {
        const NewImageIds = sortImageIdsByIPP(imageIds)
        return limitImageIds(NewImageIds, limitFrames)
      }
      return imageIds
    }

    this.petVolumeImageIds = getImageIds('pt1', VOLUME, callback)
    this.ctVolumeImageIds = getImageIds('ct1', VOLUME, callback)

    Promise.all([this.petVolumeImageIds, this.ctVolumeImageIds]).then(() =>
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
    this.axialSync = createCameraPositionSynchronizer('axialSync')
    this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    this.ctWLSync = createVOISynchronizer('ctWLSync')
    this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')
    ;({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ctVRSceneToolGroup,
      ctObliqueToolGroup,
      ptTypesSceneToolGroup,
    } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ptVolumeUID = ptVolumeUID

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    window.renderingEngine = renderingEngine

    ptCtFusion.setLayout(
      renderingEngine,
      this._canvasNodes,
      {
        ctSceneToolGroup,
        ptSceneToolGroup,
        fusionSceneToolGroup,
        ptMipSceneToolGroup,
      },
      {
        axialSynchronizers: [this.axialSync],
        sagittalSynchronizers: [this.sagittalSync],
        coronalSynchronizers: [this.coronalSync],
        ptThresholdSynchronizer: this.ptThresholdSync,
        ctWLSynchronizer: this.ctWLSync,
      }
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ctVRSceneToolGroup,
      ctObliqueToolGroup,
      ptTypesSceneToolGroup,
    })

    // Create volumes
    const ptImageIds = await this.petVolumeImageIds
    const ctVolumeImageIds = await this.ctVolumeImageIds

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
      imageIds: ptImageIds,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ptVolume.load(onLoad)
    ctVolume.load(onLoad)

    ptCtFusion.setVolumes(
      renderingEngine,
      ctVolumeUID,
      ptVolumeUID,
      colormaps[this.state.petColorMapIndex]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this
    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    const layout = LAYOUTS[layoutIndex]

    if (prevState.layoutIndex !== layoutIndex) {
      if (layout === 'FusionMIP') {
        // FusionMIP

        ptCtFusion.setLayout(
          renderingEngine,
          this._canvasNodes,
          {
            ctSceneToolGroup,
            ptSceneToolGroup,
            fusionSceneToolGroup,
            ptMipSceneToolGroup,
          },
          {
            axialSynchronizers: [this.axialSync],
            sagittalSynchronizers: [this.sagittalSync],
            coronalSynchronizers: [this.coronalSync],
            ptThresholdSynchronizer: this.ptThresholdSync,
            ctWLSynchronizer: this.ctWLSync,
          }
        )

        ptCtFusion.setVolumes(
          renderingEngine,
          ctVolumeUID,
          ptVolumeUID,
          colormaps[this.state.petColorMapIndex]
        )
      } else if (layout === 'ObliqueCT') {
        obliqueCT.setLayout(renderingEngine, this._canvasNodes, {
          ctObliqueToolGroup,
        })
        obliqueCT.setVolumes(renderingEngine, ctVolumeUID)
      } else if (layout === 'CTVR') {
        // CTVR
        fourUpCT.setLayout(renderingEngine, this._canvasNodes, {
          ctSceneToolGroup,
          ctVRSceneToolGroup,
        })
        fourUpCT.setVolumes(renderingEngine, ctVolumeUID)
      } else if (layout === 'PetTypes') {
        // petTypes
        petTypes.setLayout(renderingEngine, this._canvasNodes, {
          ptTypesSceneToolGroup,
        })
        petTypes.setVolumes(renderingEngine, ptVolumeUID)
      } else {
        throw new Error('Unrecognised layout index')
      }
    }
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

  activateTool = async (evt) => {
    const toolName = evt.target.value

    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { uid: viewportUID } = scene.getViewports()[0]

    const toolGroup = ToolGroupManager.getToolGroups(
      renderingEngineUID,
      sceneUID,
      viewportUID
    )[0]

    const { canvas: element } = this.renderingEngine.getViewport(viewportUID)

    if (SEGMENTATION_TOOLS.includes(toolName)) {
      const labelmapIndex = SegmentationModule.getActiveLabelmapIndex(element)
      await SegmentationModule.setActiveLabelmapIndex(element, labelmapIndex)
      const labelmapUIDs = SegmentationModule.getLabelmapUIDsForElement(element)
      this.setState({
        segmentationToolActive: true,
        availableLabelmaps: labelmapUIDs,
      })
    }

    this.resetToolModes(toolGroup)

    const tools = Object.entries(toolGroup.tools)

    // Disabling any tool that is active on mouse primary
    const [activeTool] = tools.find(
      ([tool, { bindings, mode }]) =>
        mode === 'Active' &&
        bindings.length &&
        bindings.some(
          (binding) => binding.mouseButton === ToolBindings.Mouse.Primary
        )
    )

    toolGroup.setToolPassive(activeTool)

    // Using mouse primary for the selected tool
    const currentBindings = toolGroup.tools[toolName]
      ? toolGroup.tools[toolName].bindings
      : []

    toolGroup.setToolActive(toolName, {
      bindings: [
        ...currentBindings,
        { mouseButton: ToolBindings.Mouse.Primary },
      ],
    })
    this.renderingEngine.render()
  }

  swapPetTransferFunction() {
    const renderingEngine = this.renderingEngine
    const petCTScene = renderingEngine.getScene(SCENE_IDS.FUSION)

    if (!petCTScene) {
      // We have likely changed view and the scene no longer exists.
      return
    }

    const volumeActor = petCTScene.getVolumeActor(ptVolumeUID)

    let petColorMapIndex = this.state.petColorMapIndex

    petColorMapIndex = petColorMapIndex === 0 ? 1 : 0

    const mapper = volumeActor.getMapper()
    mapper.setSampleDistance(1.0)

    const range = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange()

    const cfun = vtkColorTransferFunction.newInstance()
    const preset = vtkColorMaps.getPresetByName(colormaps[petColorMapIndex])
    cfun.applyColorMap(preset)
    cfun.setMappingRange(range[0], range[1])

    volumeActor.getProperty().setRGBTransferFunction(0, cfun)

    // Create scalar opacity function
    const ofun = vtkPiecewiseFunction.newInstance()
    ofun.addPoint(0, 0.0)
    ofun.addPoint(0.1, 0.9)
    ofun.addPoint(5, 1.0)

    volumeActor.getProperty().setScalarOpacity(0, ofun)

    petCTScene.render()

    this.setState({ petColorMapIndex })
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
      //  values[i] = 1
    }

    imageData.getPointData().getScalars().setData(values)
  }

  preLoadSegmentations = async () => {
    this.setState({ segmentationStatus: '(Calculating...)' })

    // Use ct as background for segmentation threshold
    const ctViewport = this.renderingEngine.getViewport('ctAxial')
    const { vtkImageData: backgroundImageData } = ctViewport.getImageData()

    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap1UID })
    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap2UID })

    const boneSoftVolume = cache.getVolume(labelmap1UID)
    const fatVolume = cache.getVolume(labelmap2UID)

    // Bone & soft tissue labelmap
    this.fillBlobForThreshold(
      boneSoftVolume.vtkImageData,
      backgroundImageData,
      ['bone', 'softTissue']
    )

    // fat tissue labelmap
    this.fillBlobForThreshold(fatVolume.vtkImageData, backgroundImageData, [
      'fatTissue',
    ])

    this.setState({ segmentationStatus: 'done' })
  }

  loadSegmentation = async (sceneUID, labelmapUID) => {
    const scene = this.renderingEngine.getScene(sceneUID)
    const { uid } = scene.getViewports()[0]
    const { canvas } = this.renderingEngine.getViewport(uid)

    const labelmapIndex = SegmentationModule.getNextLabelmapIndex(canvas)
    const labelmap = cache.getVolume(labelmapUID)

    await SegmentationModule.setLabelmapForElement({
      canvas,
      labelmap,
      labelmapIndex,
    })

    const activeSegmentIndex = SegmentationModule.getActiveSegmentIndex(canvas)
    const segmentLocked =
      SegmentationModule.getSegmentIndexLockedStatusForElement(
        canvas,
        activeSegmentIndex
      )

    this.setState((prevState) => ({
      segmentationToolActive: true,
      selectedLabelmapUID: SegmentationModule.getActiveLabelmapUID(canvas),
      activeSegmentIndex,
      segmentLocked,
      availableLabelmaps: [...prevState.availableLabelmaps, labelmapUID],
    }))
  }

  toggleLockedSegmentIndex = (evt) => {
    const checked = evt.target.checked
    console.debug('checked', checked)
    // Todo: Don't have active viewport concept
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { canvas } = scene.getViewports()[0]
    const activeLabelmapUID = SegmentationModule.getActiveLabelmapUID(canvas)
    SegmentationModule.toggleSegmentIndexLockedForLabelmapUID(
      activeLabelmapUID,
      this.state.activeSegmentIndex
    )
    this.setState({ segmentLocked: checked })
  }

  changeActiveSegmentIndex = (direction) => {
    // Todo: Don't have active viewport concept
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { canvas } = scene.getViewports()[0]
    const currentIndex = SegmentationModule.getActiveSegmentIndex(canvas)
    let newIndex = currentIndex + direction

    if (newIndex < 0) {
      newIndex = 0
    }

    SegmentationModule.setActiveSegmentIndex(canvas, newIndex)
    const segmentLocked =
      SegmentationModule.getSegmentIndexLockedStatusForElement(canvas, newIndex)
    console.debug('segmentLocked', segmentLocked)
    this.setState({ activeSegmentIndex: newIndex, segmentLocked })
  }

  swapPtCtTool = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false

    ptCtToggleAnnotationTool(
      isAnnotationToolOn,
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      toolName
    )

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
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

  hidOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  render() {
    const {
      layoutIndex,
      metadataLoaded,
      destroyed,
      ctWindowLevelDisplay,
      ptThresholdDisplay,
    } = this.state

    const layoutID = LAYOUTS[layoutIndex]

    const fusionButtons =
      layoutID === 'FusionMIP' ? (
        <React.Fragment>
          <button
            onClick={() =>
              metadataLoaded && !destroyed && this.swapPetTransferFunction()
            }
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            SwapPetTransferFunction
          </button>
          <select
            value={this.state.ptCtLeftClickTool}
            onChange={this.activateTool}
          >
            {ptCtLayoutTools.map((toolName) => (
              <option key={toolName} value={toolName}>
                {toolName}
              </option>
            ))}
          </select>
        </React.Fragment>
      ) : null

    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>MPR Example ({this.state.progressText})</h2>
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
            {fusionButtons}
          </div>
        </div>

        <div>
          <h4>Segmentation Tools</h4>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: '5px' }}> Tool</span>
            <select
              value={this.state.segmentationTool}
              onChange={(evt) =>
                this.setState({ segmentationTool: evt.target.value })
              }
            >
              {SEGMENTATION_TOOLS.map((toolName) => (
                <option key={toolName} value={toolName}>
                  {toolName}
                </option>
              ))}
            </select>

            <span style={{ margin: '5px 5px' }}>Target Scene</span>
            <select
              value={this.state.sceneForSegmentation}
              onChange={(evt) => {
                const sceneUID = evt.target.value
                const scene = this.renderingEngine.getScene(sceneUID)
                const { uid, canvas } = scene.getViewports()[0]
                const labelmapUIDs =
                  SegmentationModule.getLabelmapUIDsForViewportUID(uid)
                const index = SegmentationModule.getActiveSegmentIndex(canvas)
                const segmentLocked =
                  SegmentationModule.getSegmentIndexLockedStatusForElement(
                    canvas,
                    index
                  )

                this.setState({
                  sceneForSegmentation: sceneUID,
                  availableLabelmaps: labelmapUIDs,
                  activeSegmentIndex: index,
                  segmentLocked,
                })
              }}
            >
              {[SCENE_IDS.CT, SCENE_IDS.PT, SCENE_IDS.PTMIP].map(
                (groupName) => (
                  <option key={groupName} value={groupName}>
                    {groupName}
                  </option>
                )
              )}
            </select>

            <button
              onClick={() =>
                this.activateTool({
                  target: { value: this.state.segmentationTool },
                })
              }
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              Activate Segmentation Tool
            </button>
            {/* <button
              onClick={() =>
                ctSceneToolGroup.setActiveStrategyName(
                  'RectangleScissors',
                  'FILL_OUTSIDE'
                )
              }
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              Change strategy
            </button> */}
          </div>
          {this.state.segmentationToolActive && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span> Labelmaps (active is selected) </span>
              <select
                value={this.state.selectedLabelmapUID}
                style={{ minWidth: '50px', margin: '0px 8px' }}
                onChange={(evt) => {
                  const selectedLabelmapUID = evt.target.value
                  const scene = this.renderingEngine.getScene(
                    this.state.sceneForSegmentation
                  )
                  const { canvas } = scene.getViewports()[0]

                  SegmentationModule.setActiveLabelmapByLabelmapUID(
                    canvas,
                    selectedLabelmapUID
                  )

                  const activeSegmentIndex =
                    SegmentationModule.getActiveSegmentIndex(canvas)

                  this.setState({
                    selectedLabelmapUID,
                    activeSegmentIndex: activeSegmentIndex,
                  })
                }}
                size={3}
              >
                {this.state.availableLabelmaps.map((labelmapUID) => (
                  <option key={labelmapUID} value={labelmapUID}>
                    {labelmapUID}
                  </option>
                ))}
              </select>

              <button
                onClick={() => this.changeActiveSegmentIndex(-1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Previous Segment
              </button>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                {`Active Segment Index ${this.state.activeSegmentIndex}`}
                <div>
                  <input
                    type="checkbox"
                    style={{ marginLeft: '0px' }}
                    name="lockToggle"
                    checked={this.state.segmentLocked}
                    onClick={(evt) => this.toggleLockedSegmentIndex(evt)}
                  />
                  <label htmlFor="lockToggle" style={{ marginLeft: '5px' }}>
                    Locked?
                  </label>
                </div>
              </span>
              <button
                onClick={() => this.changeActiveSegmentIndex(1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Next Segment
              </button>
            </div>
          )}
        </div>
        <div>
          <h5>Use Synthetic Segmentation</h5>
          <div>
            <button
              onClick={() => {
                this.setState(
                  { segmentationStatus: 'Calculating...' },
                  this.preLoadSegmentations
                )
              }}
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              1) Pre-compute bone & softTissue and fatTissue labelmaps
            </button>
            <span>{this.state.segmentationStatus}</span>
            {this.state.segmentationStatus !== 'done' ? null : (
              <>
                <button
                  onClick={() =>
                    this.loadSegmentation(
                      this.state.sceneForSegmentation,
                      labelmap1UID
                    )
                  }
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.a) Load Bone & Soft Tissue Labelmap
                </button>
                <button
                  onClick={() =>
                    this.loadSegmentation(
                      this.state.sceneForSegmentation,
                      labelmap2UID
                    )
                  }
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap
                </button>
              </>
            )}
          </div>

          <div>
            <h4>Segmentation Rendering Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutline}
              onClick={() => {
                const renderOutline = !this.state.renderOutline
                SegmentationModule.setGlobalConfig({ renderOutline })
                this.setState({
                  renderOutline,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render Outline
            </label>
            <input
              type="checkbox"
              style={{ marginLeft: '10px' }}
              name="toggle"
              defaultChecked={this.state.renderInactiveLabelmaps}
              onClick={() => {
                const renderInactiveLabelmaps =
                  !this.state.renderInactiveLabelmaps
                SegmentationModule.setGlobalConfig({ renderInactiveLabelmaps })
                this.setState({
                  renderInactiveLabelmaps,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render inactive Labelmaps
            </label>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlpha">fillAlpha</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlpha"
                  name="fillAlpha"
                  value={this.state.fillAlpha}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = evt.target.value
                    this.setState({ fillAlpha })
                    SegmentationModule.setGlobalConfig({ fillAlpha })
                  }}
                />
              </div>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlphaInactive">fillAlphaInactive</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlphaInactive"
                  name="fillAlphaInactive"
                  value={this.state.fillAlphaInactive}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = evt.target.value
                    this.setState({ fillAlphaInactive })
                    SegmentationModule.setGlobalConfig({ fillAlphaInactive })
                  }}
                />
              </div>
            </div>
          </div>
        </div>
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

export default MPRExample
