import React, { Component } from "react";
import {
  cache,
  RenderingEngine,
  eventTarget,
  createAndCacheVolume,
  loadAndCacheImages,
  metaData,
  ORIENTATION,
  VIEWPORT_TYPE,
  EVENTS as RENDERING_EVENTS,
} from "@cornerstone";
import {
  SynchronizerManager,
  synchronizers,
  ToolGroupManager,
} from "@cornerstone-tools";

import vtkColorTransferFunction from "vtk.js/Sources/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "vtk.js/Sources/Common/DataModel/PiecewiseFunction";
import vtkColorMaps from "vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps";
import getImageIdsAndCacheMetadata from "./helpers/getImageIdsAndCacheMetadata";
import { createDXImageIds } from "./helpers/createStudyImageIds";
import ViewportGrid from "./components/ViewportGrid";
import { initToolGroups, destroyToolGroups } from "./initToolGroups";
import "./ExampleVTKMPR.css";
import {
  renderingEngineUID,
  ctVolumeUID,
  ctStackUID,
  SCENE_IDS,
  VIEWPORT_IDS,
} from "./constants";
import LAYOUTS, { stackCT } from "./layouts";
import sortImageIdsByIPP from "./helpers/sortImageIdsByIPP";

const VIEWPORT_DX_COLOR = "dx_and_color_viewport";

const colorImageIds = [
  "web:http://localhost:3000/examples/head/avf1240c.png",
  "web:http://localhost:3000/examples/head/avf1241a.png",
  "web:http://localhost:3000/examples/head/avf1241b.png",
  "web:http://localhost:3000/examples/head/avf1241c.png",
  "web:http://localhost:3000/examples/head/avf1242a.png",
  "web:http://localhost:3000/examples/head/avf1242b.png",
  "web:http://localhost:3000/examples/head/avf1242c.png",
  "web:http://localhost:3000/examples/head/avf1243a.png",
];

function hardcodedMetaDataProvider(type, imageId) {
  const colonIndex = imageId.indexOf(":");
  const scheme = imageId.substring(0, colonIndex);
  if (scheme !== "web") return;

  if (type === "imagePixelModule") {
    const imagePixelModule = {
      pixelRepresentation: 0,
      bitsAllocated: 24,
      bitsStored: 24,
      highBit: 24,
      photometricInterpretation: "RGB",
      samplesPerPixel: 3,
    };

    return imagePixelModule;
  } else if (type === "generalSeriesModule") {
    const generalSeriesModule = {
      modality: "SC",
    };

    return generalSeriesModule;
  } else if (type === "imagePlaneModule") {
    const index = colorImageIds.indexOf(imageId);

    const imagePlaneModule = {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, index * 5],
      pixelSpacing: [1, 1],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      frameOfReferenceUID: "FORUID",
      columns: 2048,
      rows: 1216,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
    };

    return imagePlaneModule;
  } else if (type === "voiLutModule") {
    return {
      windowWidth: [255],
      windowCenter: [127],
    };
  } else if (type === "modalityLutModule") {
    return {
      rescaleSlope: 1,
      rescaleIntercept: 0,
    };
  }

  console.warn(type);
  throw new Error("not available!");
}

metaData.addProvider(hardcodedMetaDataProvider, 10000);

window.cache = cache;

let ctSceneToolGroup, stackViewportToolGroup;
class EnableDisableViewportExample extends Component {
  state = {
    progressText: "fetching metadata...",
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
    enabledViewports: [],
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    selectedViewportIndex: 0, // for disabling and enabling viewports
    viewportInputEntries: [],
  };

  constructor(props) {
    super(props);

    this._canvasNodes = new Map();
    this._viewportGridRef = React.createRef();
    this._offScreenRef = React.createRef();
    this.petCTImageIdsPromise = getImageIdsAndCacheMetadata();
    this.dxImageIdsPromise = createDXImageIds();
    this.numberOfViewports =
      this.state.viewportGrid.numCols * this.state.viewportGrid.numRows;

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
        this.renderingEngine.resize();
        this.renderingEngine.render();
      }
    });
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    this.setState({
      viewportInputEntries: [
        {
          // CT volume axial
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          canvas: this._canvasNodes.get(0),
          defaultOptions: {
            orientation: ORIENTATION.SAGITTAL,
          },
        },
        {
          // stack CT
          viewportUID: VIEWPORT_IDS.STACK,
          type: VIEWPORT_TYPE.STACK,
          canvas: this._canvasNodes.get(1),
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          // dx
          viewportUID: VIEWPORT_DX_COLOR,
          type: VIEWPORT_TYPE.STACK,
          canvas: this._canvasNodes.get(2),
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
        {
          // CT volume Coronal
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.CORONAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          canvas: this._canvasNodes.get(3),
          defaultOptions: {
            orientation: ORIENTATION.CORONAL,
          },
        },
        {
          sceneUID: SCENE_IDS.CT,
          viewportUID: VIEWPORT_IDS.CT.AXIAL,
          type: VIEWPORT_TYPE.ORTHOGRAPHIC,
          canvas: this._canvasNodes.get(4),
          defaultOptions: {
            orientation: ORIENTATION.AXIAL,
          },
        },
      ],
    });

    const renderingEngine = new RenderingEngine(renderingEngineUID);
    this.renderingEngine = renderingEngine;
    window.renderingEngine = renderingEngine;

    ({ ctSceneToolGroup, stackViewportToolGroup } = initToolGroups());


    // Create volumes
    const imageIds = await this.petCTImageIdsPromise;
    const dxImageIds = await this.dxImageIdsPromise;
    const { ctImageIds } = imageIds;

    const wadoCTImageIds = ctImageIds.map((imageId) => {
      const colonIndex = imageId.indexOf(":");
      return "wadors" + imageId.substring(colonIndex);
    });

    renderingEngine.enableElement(this.state.viewportInputEntries[0]); // ct volume
    renderingEngine.enableElement(this.state.viewportInputEntries[1]); // stack

    // Tools added for the first two viewports

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    );

    // stack ct
    stackViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK
    );

    renderingEngine.render();

    const ctStackLoad = async () => {
      const stackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK);
      await stackViewport.setStack(sortImageIdsByIPP(wadoCTImageIds));
    };

    this.ctStackLoad = ctStackLoad;

    const dxColorLoad = async () => {
      const dxColorViewport = renderingEngine.getViewport(VIEWPORT_DX_COLOR);

      let fakeStake = [
        dxImageIds[0],
        colorImageIds[0],
        dxImageIds[1],
        wadoCTImageIds[40],
        colorImageIds[1],
        colorImageIds[2],
        wadoCTImageIds[41],
      ];
      await dxColorViewport.setStack(fakeStake);

      stackViewportToolGroup.addViewports(
        renderingEngineUID,
        undefined,
        VIEWPORT_DX_COLOR
      );
    };

    this.dxColorLoad = dxColorLoad;

    const CTVolumeLoad = async () => {
      // This only creates the volumes, it does not actually load all
      // of the pixel data (yet)
      const ctVolume = await createAndCacheVolume(ctVolumeUID, {
        imageIds: ctImageIds,
      });

      // Initialize all CT values to -1024 so we don't get a grey box?
      const { scalarData } = ctVolume;
      const ctLength = scalarData.length;

      for (let i = 0; i < ctLength; i++) {
        scalarData[i] = -1024;
      }

      const onLoad = () => this.setState({ progressText: "Loaded." });

      ctVolume.load(onLoad);

      const ctScene = renderingEngine.getScene(SCENE_IDS.CT);
      ctScene.setVolumes([{volumeUID: ctVolumeUID}]);

      // Set initial CT levels in UI
      const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0];

      this.setState({
        ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
      });
    };

    ctStackLoad();
    CTVolumeLoad();
    this.CTVolumeLoad = CTVolumeLoad;

    this.setState({
      enabledViewports: [0, 1],
      metadataLoaded: true,
    });

    // This will initialize volumes in GPU memory
    renderingEngine.render();
    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current);
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect();
    }

    // Destroy synchronizers
    // SynchronizerManager.destroy()
    cache.purgeCache();
    ToolGroupManager.destroy();

    this.renderingEngine.destroy();
  }

  setSelectedViewportIndex = (evt) => {
    const index = evt.target.value;
    this.setState({ selectedViewportIndex: parseInt(index) });
  };

  disableSelectedViewport = () => {
    const viewportIndex = this.state.selectedViewportIndex;

    const viewportInput = this.state.viewportInputEntries[viewportIndex];

    this.renderingEngine.disableElement(viewportInput.viewportUID);

    this.setState(state => ({ ...state,
        enabledViewports : state.enabledViewports.filter(item => item !== viewportIndex)
     }))

  };

  enableSelectedViewport = () => {
    const viewportIndex = this.state.selectedViewportIndex;

    const viewportInput = this.state.viewportInputEntries[viewportIndex];

    this.renderingEngine.enableElement(viewportInput);

    // load
    if (viewportInput.viewportUID === VIEWPORT_IDS.STACK) {
      this.ctStackLoad();
    } else if (viewportInput.viewportUID === VIEWPORT_DX_COLOR) {
      this.dxColorLoad();
    } else {
      // if we have removed the scene when disabling all the related viewports
      // set the volume again
      const ctScene = this.renderingEngine.getScene(SCENE_IDS.CT)
      if (! ctScene.getVolumeActors().length) {
        this.CTVolumeLoad();
      }
      ctSceneToolGroup.addViewports(
        renderingEngineUID,
        SCENE_IDS.CT,
        viewportInput.viewportUID
      );
    }

    this.setState((state) => ({
      ...state,
      enabledViewports: [...state.enabledViewports, viewportIndex],
    }));
  };

  showOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = "";
    const uri = this.renderingEngine._debugRender();
    const image = document.createElement("img");
    image.src = uri;
    image.setAttribute("width", "100%");

    this._offScreenRef.current.appendChild(image);
  };

  hidOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = "";
  };
  render() {
    return (
      <div>
        <div>
          <h1>
            Stack and Volume Viewports (enableElement and disableElement API)
          </h1>
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
          style={{ margin: "2px 4px" }}
        >
          Enable Selected Viewport
        </button>
        <button
          onClick={() => this.disableSelectedViewport()}
          className="btn btn-primary"
          style={{ margin: "2px 4px" }}
        >
          Disable Selected Viewport
        </button>

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
                    ? vpEntry.viewportUID + " --- enabled"
                    : vpEntry.viewportUID + " --- disabled"}
                </option>
              ))}
          </select>
        </div>
        <div style={{ paddingBottom: "55px" }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: "650px", marginTop: "35px" }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                className="viewport-pane"
                style={{
                  ...(vp.cellStyle || {}),
                  border: "2px solid grey",
                  background: "black",
                }}
                key={i}
              >
                <canvas ref={(c) => this._canvasNodes.set(i, c)} />
              </div>
            ))}
          </ViewportGrid>
        </div>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: "2px 4px" }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hidOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: "2px 4px" }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    );
  }
}

export default EnableDisableViewportExample;
