// @ts-ignore
import { state } from './index.ts';

export default function addTool(ToolClass, toolOptions) {
  const tool = new ToolClass(toolOptions);
  const toolAlreadyAdded = state.tools[tool.name] !== undefined;

  if (toolAlreadyAdded) {
    console.warn(`${tool.name} has already been added globally`);

    return;
  }

  state.tools[tool.name] = {
    toolClass: ToolClass,
    toolOptions,
  };
}
