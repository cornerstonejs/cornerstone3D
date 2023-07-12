const codeMeaningEquals = codeMeaningName => {
    return contentItem => {
        return (
            contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName
        );
    };
};

export { codeMeaningEquals };
