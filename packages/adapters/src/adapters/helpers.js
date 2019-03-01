const toArray = function(x) {
    return x.constructor.name === "Array" ? x : [x];
};

const codeMeaningEquals = codeMeaningName => {
    return contentItem => {
        return (
            contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName
        );
    };
};

const graphicTypeEquals = graphicType => {
    return contentItem => {
        return (
            contentItem.ContentSequence !== undefined &&
            contentItem.ContentSequence.GraphicType === graphicType
        );
    };
};

export { toArray, codeMeaningEquals, graphicTypeEquals };
