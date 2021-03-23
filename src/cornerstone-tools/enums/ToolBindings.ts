/**
 * @enum Mouse This enum enumerates the different buttons returned by `.buttons` on the mouse event.
 * These values are used when setting a tool active in a tool group.
 *
 * See also: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
 */
enum Mouse {
  Primary = 1,
  Secondary = 2,
  Primary_And_Secondary = 3,
  Auxiliary = 4,
  Primary_And_Auxiliary = 5,
  Secondary_And_Auxiliary = 6,
  Primary_And_Secondary_And_Auxiliary = 7,
  Fourth_Button = 8,
  Fifth_Button = 16,
}

enum Touch {}

const enums = {
  Mouse,
  Touch,
}

export default enums
