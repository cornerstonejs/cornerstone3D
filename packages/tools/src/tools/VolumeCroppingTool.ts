// https://github.com/Kitware/vtk-js/blob/d15d50f8ba87704865b725be870c3316da2a7078/Sources/Widgets/Widgets3D/ImageCroppingWidget/index.js#L195

import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import type {
  ImageCroppingWidgetState,
  vtkImageCroppingViewWidget,
} from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';

import { BaseTool } from './base';
import {
  Enums,
  eventTarget,
  getEnabledElementByIds,
  getRenderingEngines,
} from '@cornerstonejs/core';

import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import { getToolGroup } from '../store/ToolGroupManager';
import { Events } from '../enums';

class VolumeCroppingTool extends BaseTool {
  static toolName;
  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {},
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  onSetToolEnabled = (): void => {
    console.debug('VolumeCroppingTool: onSetToolEnabled', this.toolGroupId);
    this.initViewports();
    this._subscribeToViewportEvents();
  };

  onSetToolActive = (): void => {
    console.debug('VolumeCroppingTool: onSetToolActive', this.toolGroupId);
    this.initViewports();
    this._subscribeToViewportEvents();
  };

  onSetToolDisabled = (): void => {
    //  this.cleanUpData();
    //  this._unsubscribeToViewportNewVolumeSet();
  };

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  _subscribeToViewportEvents() {
    const subscribeToElementResize = () => {
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const { viewport } = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );
        const { element } = viewport;
        this.initViewports();

        element.addEventListener(
          Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
          this.initViewports.bind(this)
        );
        /*
        const resizeObserver = new ResizeObserver(() => {
          // Todo: i wish there was a better way to do this
          setTimeout(() => {
            const element = getEnabledElementByIds(
              viewportId,
              renderingEngineId
            );
            if (!element) {
              return;
            }
            const { viewport } = element;
            this.resize(viewportId);
            viewport.render();
          }, 100);
        });

        resizeObserver.observe(element);

        this._resizeObservers.set(viewportId, resizeObserver);
*/
      });
    };

    subscribeToElementResize();

    eventTarget.addEventListener(Events.TOOLGROUP_VIEWPORT_ADDED, (evt) => {
      if (evt.detail.toolGroupId !== this.toolGroupId) {
        return;
      }

      subscribeToElementResize();
      this.initViewports();
    });
  }

  private initViewports() {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());

    viewports.forEach((viewport) => {
      const renderer = viewport.getRenderer();
      const renderWindow = viewport
        .getRenderingEngine()
        .offscreenMultiRenderWindow.getRenderWindow();
      const widget = viewport.getWidget(this.getToolName());
      // testing if widget has been deleted
      if (!widget || widget.isDeleted()) {
        this.addCropToolInViewport(viewport);
        renderer.resetCamera();
        renderer.resetCameraClippingRange();
      }

      renderWindow.render();
      // viewport.getRenderingEngine().render();
    });
  }

  async addCropToolInViewport(viewport) {
    //const viewportId = viewport.id;
    // const renderer = viewport.getRenderer();
    //const renderWindow = viewport
    //    .getRenderingEngine()
    //    .offscreenMultiRenderWindow.getRenderWindow();
    const widgetManager = vtkWidgetManager.newInstance();

    widgetManager.setRenderer(viewport.getRenderer());

    const cropWidget = vtkImageCroppingWidget.newInstance();
    const state = cropWidget.getWidgetState() as ImageCroppingWidgetState;
    cropWidget.setEdgeHandlesEnabled(false);
    cropWidget.setFaceHandlesEnabled(true);
    cropWidget.setCornerHandlesEnabled(true);
    const widget = widgetManager.addWidget(
      cropWidget
    ) as vtkImageCroppingViewWidget;
    console.debug('VolumeCroppingTool state:', state);
    /*  Initial widget register
    //widgetRegistration();
    //const action = e ? e.currentTarget.dataset.action : 'addWidget';
    const viewWidget = widgetManager['addWidget'](cropWidget);
    if (viewWidget) {
      viewWidget.setDisplayCallback((coords) => {
        if (coords) {
          console.debug('VolumeCroppingTool: coords', coords);
          const [w, h] = apiRenderWindow.getSize();
        }
      });
    }
*/
    widgetManager.enablePicking();

    console.debug('VolumeCroppingTool: widget created');
  }
}

function widgetRegistration(e) {
  const action = e ? e.currentTarget.dataset.action : 'addWidget';
  const viewWidget = widgetManager[action](widget);
  if (viewWidget) {
    viewWidget.setDisplayCallback((coords) => {
      overlay.style.left = '-100px';
      if (coords) {
        const [w, h] = apiRenderWindow.getSize();
        overlay.style.left = `${Math.round(
          (coords[0][0] / w) * window.innerWidth -
            overlaySize * 0.5 -
            overlayBorder
        )}px`;
        overlay.style.top = `${Math.round(
          ((h - coords[0][1]) / h) * window.innerHeight -
            overlaySize * 0.5 -
            overlayBorder
        )}px`;
      }
    });

    renderer.resetCamera();
    renderer.resetCameraClippingRange();
  }
  widgetManager.enablePicking();
  renderWindow.render();
}

VolumeCroppingTool.toolName = 'VolumeCropping';
export default VolumeCroppingTool;
