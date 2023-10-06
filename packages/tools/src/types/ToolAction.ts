import type { Annotation } from './AnnotationTypes';
import type { MouseDownEventType } from './EventTypes';
import type { SetToolBindingsType } from './ISetToolModeOptions';

type ToolAction = {
  method: string | ((evt: MouseDownEventType, annotation: Annotation) => void);
  bindings: SetToolBindingsType[];
};

export default ToolAction;
