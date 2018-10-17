const toArray = function(x) {
  return (x.constructor.name === "Array" ? x : [x]);
};

const codeMeaningEquals = (codeMeaningName) => {
  return (contentItem) => {
    return contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName;
  };
};

export {
  toArray,
  codeMeaningEquals
};
