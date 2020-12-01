// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
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

export default {
  Mouse,
  Touch,
};
