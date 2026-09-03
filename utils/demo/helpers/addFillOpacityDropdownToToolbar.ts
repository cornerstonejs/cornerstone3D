import { ToolGroupManager } from '@cornerstonejs/tools';
import addDropdownToToolbar from './addDropdownToToolbar';

interface AddFillOpacityDropdownToToolbarOptions {
  toolGroupId: string;
  toolNames: string[];
  renderingEngineId: string;
  viewportIds: string[];
  getRenderingEngine: (id: string) => { renderViewports: (ids: string[]) => void };
}

/**
 * Adds a Fill Opacity dropdown to the toolbar for contour-based annotation tools.
 */
export default function addFillOpacityDropdownToToolbar(
  options: AddFillOpacityDropdownToToolbarOptions
): void {
  const {
    toolGroupId,
    toolNames,
    renderingEngineId,
    viewportIds,
    getRenderingEngine,
  } = options;

  addDropdownToToolbar({
    labelText: 'Fill Opacity',
    options: {
      values: ['0', '0.2', '0.5', '0.8'],
      defaultValue: '0',
    },
    onSelectedValueChange: (value) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      if (toolGroup) {
        const fillOpacity = parseFloat(value as string);
        for (const toolName of toolNames) {
          toolGroup.setToolConfiguration(toolName, {
            fillOpacity,
          });
        }
      }

      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (renderingEngine) {
        renderingEngine.renderViewports(viewportIds);
      }
    },
  });
}
