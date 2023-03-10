function createChildEl(parent, tagName) {
  const child = document.createElement(tagName);
  parent.append(child);
  return child;
}

export default createChildEl;
