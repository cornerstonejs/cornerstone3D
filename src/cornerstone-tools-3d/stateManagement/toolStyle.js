let defaultWidth = 1,
  activeWidth = 2;

function setToolWidth(width) {
  defaultWidth = width;
}

function getToolWidth() {
  return defaultWidth;
}

function setActiveWidth(width) {
  activeWidth = width;
}

function getActiveWidth() {
  return activeWidth;
}

const toolStyle = {
  setToolWidth,
  getToolWidth,
  setActiveWidth,
  getActiveWidth,
};

export default toolStyle;
