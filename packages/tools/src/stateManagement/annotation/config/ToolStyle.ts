import {
  ToolStyleConfig,
  StyleSpecifications,
  ToolStyles,
  AnnotationStyles,
} from '../../../types/AnnotationStyle';

/**
 * This class handles the configuration of the tool style. You can use it to set
 * the style of a tool at various levels (annotation, viewport, toolGroup, global).
 *
 * The hierarchy of the configuration is as follows (each level falls back to the
 * next level if not specified):
 *
 * 1) Annotation-level styles (with annotationUID)
 *     2) Viewport-level tool styles
 *         - Per-tool: Length on the viewport with viewportId
 *         - Global: All tools on the viewport with viewportId
 *             3) ToolGroup tool styles
 *                 - Per-tool: Angle on toolGroupId in all viewports of the toolGroup
 *                 - Global: All tools in the toolGroupId for all viewports
 *                     4) Default level:
 *                         - Per-tool: Length styles
 *                         - Global: Opinionated styles by CornerstoneJS
 */
class ToolStyle {
  config: ToolStyleConfig;

  constructor() {
    const defaultConfig = {
      color: 'rgb(255, 255, 0)',
      colorHighlighted: 'rgb(0, 255, 0)',
      colorSelected: 'rgb(0, 220, 0)',
      colorLocked: 'rgb(255, 255, 0)',
      lineWidth: '1',
      lineDash: '',
      textBoxFontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      textBoxFontSize: '14px',
      textBoxColor: 'rgb(255, 255, 0)',
      textBoxColorHighlighted: 'rgb(0, 255, 0)',
      textBoxColorSelected: 'rgb(0, 255, 0)',
      textBoxColorLocked: 'rgb(255, 255, 0)',
      textBoxBackground: '',
      textBoxLinkLineWidth: '1',
      textBoxLinkLineDash: '2,3',
    };

    this._initializeConfig(defaultConfig);
  }

  setAnnotationToolStyles(annotationUID: string, styles: ToolStyles) {
    let annotationSpecificStyles = this.config.annotations;

    if (!annotationSpecificStyles) {
      this.config = {
        ...this.config,
        annotations: {},
      };

      annotationSpecificStyles = this.config.annotations;
    }

    if (annotationSpecificStyles[annotationUID]) {
      console.warn(
        'overriding annotation styles for annotationUID:',
        annotationUID
      );
    }

    annotationSpecificStyles[annotationUID] = styles;
  }

  setViewportToolStyles(viewportId: string, styles: ToolStyles) {
    let viewportSpecificStyles = this.config.viewports;

    if (!viewportSpecificStyles) {
      this.config = {
        ...this.config,
        viewports: {},
      };

      viewportSpecificStyles = this.config.viewports;
    }

    if (viewportSpecificStyles[viewportId]) {
      console.warn('overriding viewport styles for viewportId:', viewportId);
    }

    viewportSpecificStyles[viewportId] = styles;
  }

  setToolGroupToolStyles(toolGroupId: string, styles: ToolStyles) {
    let toolGroupSpecificStyles = this.config.toolGroups;

    if (!toolGroupSpecificStyles) {
      this.config = {
        ...this.config,
        toolGroups: {},
      };

      toolGroupSpecificStyles = this.config.toolGroups;
    }

    if (toolGroupSpecificStyles[toolGroupId]) {
      console.warn('overriding toolGroup styles for toolGroupId:', toolGroupId);
    }

    toolGroupSpecificStyles[toolGroupId] = styles;
  }

  setDefaultToolStyles(styles: ToolStyles) {
    this.config.default = styles;
  }

  getStyleProperty(toolStyle: string, query: StyleSpecifications) {
    const { annotationUID, viewportId, toolGroupId, toolName } = query;

    return this._getToolStyle(
      toolStyle,
      annotationUID,
      viewportId,
      toolGroupId,
      toolName
    );
  }

  getAnnotationToolStyles(annotationUID: string) {
    return this.config.annotations && this.config.annotations[annotationUID];
  }

  getViewportToolStyles(viewportId: string) {
    return this.config.viewports && this.config.viewports[viewportId];
  }

  getToolGroupToolStyles(toolGroupId: string) {
    return this.config.toolGroups && this.config.toolGroups[toolGroupId];
  }

  getDefaultToolStyles() {
    return this.config.default;
  }

  private _getToolStyle(
    property: string,
    annotationUID: string,
    viewportId: string,
    toolGroupId: string,
    toolName: string
  ) {
    if (annotationUID) {
      const styles = this.getAnnotationToolStyles(annotationUID);

      if (styles) {
        // check first in the toolSpecific styles
        if (styles[toolName] && styles[toolName][property]) {
          return styles[toolName][property];
        }

        // check if we have the style in the annotation specific global styles
        if (styles.global && styles.global[property]) {
          return styles.global[property];
        }
      }
    }

    if (viewportId) {
      const styles = this.getViewportToolStyles(viewportId);

      if (styles) {
        // check if we have the viewportId specific style
        // check first in the toolSpecific styles
        if (styles[toolName] && styles[toolName][property]) {
          return styles[toolName][property];
        }

        // check if we have the style in the viewport specific global viewportSpecificStyles
        if (styles.global && styles.global[property]) {
          return styles.global[property];
        }
      }
    }

    if (toolGroupId) {
      const styles = this.getToolGroupToolStyles(toolGroupId);

      if (styles) {
        // check first in the toolSpecific styles
        if (styles[toolName] && styles[toolName][property]) {
          return styles[toolName][property];
        }

        // check if we have the style in the toolGroup specific global styles
        if (styles.global && styles.global[property]) {
          return styles.global[property];
        }
      }
    }

    const globalStyles = this.getDefaultToolStyles();

    if (globalStyles[toolName] && globalStyles[toolName][property]) {
      return globalStyles[toolName][property];
    }

    if (globalStyles.global && globalStyles.global[property]) {
      return globalStyles.global[property];
    }
  }

  _initializeConfig(config) {
    const toolStyles = {};
    for (const name in config) {
      toolStyles[name] = config[name];
    }

    this.config = {
      default: {
        global: toolStyles as AnnotationStyles,
      },
    };
  }
}

const toolStyle = new ToolStyle();

export default toolStyle;
