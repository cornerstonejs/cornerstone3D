import type { Annotation } from './AnnotationTypes';
import type { InteractionEventType } from './EventTypes';
import type { SetToolBindingsType } from './ISetToolModeOptions';

/**
 * An action that may be defined at the tool configuration level
 *
 * Annotations can have actions that run a specific task (ex: showing a dropdown
 * containing a list of all predefined zoom levels - advanced magnifier glass).
 * Each action must have at least one binding option (mouse button + [modifier(s)])
 * and a action runs if and only if no other tool is using that same binding options
 * to draw an annotation because action has lower priority.
 *
 * Actions are defined in the following way in a annotation tool constructor:
 *
 * class MyAnnotationTool extends AnnotationTool {
 *   constructor(
 *     toolProps: PublicToolProps = {},
 *     defaultToolProps: ToolProps = {
 *       configuration: {
 *         actions: [
 *           {
 *             method: 'myAction',
 *             bindings: [
 *               {
 *                 mouseButton: MouseBindings.Secondary,
 *                 modifierKey: KeyboardBindings.Shift,
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     }
 *   ) {
 *     super(toolProps, defaultToolProps);
 *   }
 *
 *   public myAction(evt: EventTypes.InteractionEventType, annotation: MyAnnotation) {
 *     // action code
 *   }
 * }
 *
 * The "method" property may be a string or a javascript function. In case it is
 * a string a function with same name must exists in the tool class. In both ways
 * (string or function) the function is called in the tool's context (`this`)
 */
type ToolAction = {
  method:
    | string
    | ((evt: InteractionEventType, annotation: Annotation) => void);
  bindings: SetToolBindingsType[];
};

export default ToolAction;
