import {
  StyleConfig,
  ToolStyleConfig,
  StyleSpecifier,
  AnnotationStyle,
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
  config: StyleConfig;

  constructor() {
    const defaultConfig = {
      color: 'rgb(255, 255, 0)',
      colorHighlighted: 'rgb(0, 255, 0)',
      colorSelected: 'rgb(0, 220, 0)',
      colorLocked: 'rgb(255, 255, 0)',
      lineWidth: '1',
      lineDash: '',
      shadow: true,
      textBoxFontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      textBoxFontSize: '14px',
      textBoxColor: 'rgb(255, 255, 0)',
      textBoxColorHighlighted: 'rgb(0, 255, 0)',
      textBoxColorSelected: 'rgb(0, 255, 0)',
      textBoxColorLocked: 'rgb(255, 255, 0)',
      textBoxBackground: '',
      textBoxLinkLineWidth: '1',
      textBoxLinkLineDash: '2,3',
      textBoxShadow: true,
    };

    this._initializeConfig(defaultConfig);
  }

  /**
   * It returns the annotation-specific tool styles for the annotation with the given UID
   * @param annotationUID - The unique identifier of the annotation.
   * @returns The annotation tool styles for the annotation with the given UID.
   */
  getAnnotationToolStyles(annotationUID: string): AnnotationStyle {
    return this.config.annotations && this.config.annotations[annotationUID];
  }

  /**
   * It returns the styles for a given viewport. It includes tool-specific and
   * global styles (all tools in the viewport)
   * @param viewportId - The id of the viewport
   * @returns The viewport tool styles for the given viewport id.
   */
  getViewportToolStyles(viewportId: string): ToolStyleConfig {
    return this.config.viewports && this.config.viewports[viewportId];
  }

  /**
   * It returns the tool style for the given toolGroup. It includes tool-specific and
   * global styles (all tools in the toolGroup)
   * @param toolGroupId - The id of the toolGroup.
   * @returns The tool styles for the tool group with the given id.
   */
  getToolGroupToolStyles(toolGroupId: string): ToolStyleConfig {
    return this.config.toolGroups && this.config.toolGroups[toolGroupId];
  }

  /**
   * It returns the default tool styles from the config file. It includes tool-specific and
   * global styles (all tools in all tooLGroups)
   * @returns The default tool styles.
   */
  getDefaultToolStyles(): ToolStyleConfig {
    return this.config.default;
  }

  /**
   * It takes an annotationUID and a style object and sets the styles at
   * the annotationLevel (highest priority in the hierarchy). The styles is an
   * object with key value pairs.
   * @param annotationUID - string - The unique identifier for the annotation.
   * @param styles - ToolStyles
   */
  setAnnotationStyles(annotationUID: string, styles: AnnotationStyle) {
    let annotationSpecificStyles = this.config.annotations;

    if (!annotationSpecificStyles) {
      this.config = {
        ...this.config,
        annotations: {},
      };

      annotationSpecificStyles = this.config.annotations;
    }

    annotationSpecificStyles[annotationUID] = styles;
  }

  /**
   * It takes a viewportId and a ToolStyles object, and adds the ToolStyles object
   * at the viewport level (second highest priority in the hierarchy after the annotation level).
   * @param viewportId - The id of the viewport
   * @param styles - style object including tool-specific and/or global styles (All tools in the viewport)
   */
  setViewportToolStyles(viewportId: string, styles: ToolStyleConfig) {
    let viewportSpecificStyles = this.config.viewports;

    if (!viewportSpecificStyles) {
      this.config = {
        ...this.config,
        viewports: {},
      };

      viewportSpecificStyles = this.config.viewports;
    }

    viewportSpecificStyles[viewportId] = styles;
  }

  /**
   * It takes a toolGroupId and a ToolStyles object, and it adds the ToolStyles object
   * at the toolGroup level (third highest priority in the hierarchy after the viewport level).
   * @param toolGroupId - The id of the toolGroup
   * @param styles - style object including tool-specific (in all viewports of the toolGroup) and/or
   * global styles (All tools in the toolGroup for all viewports)
   */
  setToolGroupToolStyles(toolGroupId: string, styles: ToolStyleConfig) {
    let toolGroupSpecificStyles = this.config.toolGroups;

    if (!toolGroupSpecificStyles) {
      this.config = {
        ...this.config,
        toolGroups: {},
      };

      toolGroupSpecificStyles = this.config.toolGroups;
    }

    toolGroupSpecificStyles[toolGroupId] = styles;
  }

  /**
   * Sets the default tool styles for the editor. It overrides the default styles for all tools.
   * @param styles - style object including tool-specific (a tool in all toolGroups) and/or
   * global styles (All tools in all tooLGroups)
   */
  setDefaultToolStyles(styles: ToolStyleConfig) {
    this.config.default = styles;
  }

  /**
   * It returns the value for a given style key, based on the provided specifications.
   * It starts by looking at the annotation-specific styles, then at the viewport-specific styles,
   * then at the toolGroup-specific styles, and finally at the default styles.
   * @param styleKey - The key of the style.
   * @param styleSpecifier - An object containing the specifications such as viewportId,
   * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
   * met
   * @returns The value for the given style key.
   */
  getStyleProperty(toolStyle: string, specifications: StyleSpecifier) {
    const { annotationUID, viewportId, toolGroupId, toolName } = specifications;

    return this._getToolStyle(
      toolStyle,
      annotationUID,
      viewportId,
      toolGroupId,
      toolName
    );
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
        if (styles[property]) {
          return styles[property];
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

  private _initializeConfig(config) {
    const toolStyles = {};
    for (const name in config) {
      toolStyles[name] = config[name];
    }

    this.config = {
      default: {
        global: toolStyles as AnnotationStyle,
      },
    };
  }
}

const toolStyle = new ToolStyle();

export default toolStyle;
