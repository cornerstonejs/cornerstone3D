/**
 * Returns a function that checks if a given content item's ConceptNameCodeSequence.CodeMeaning
 * matches the provided codeMeaningName.
 * @param codeMeaningName - The CodeMeaning to match against.
 * @returns A function that takes a content item and returns a boolean indicating whether the
 * content item's CodeMeaning matches the provided codeMeaningName.
 */
const codeMeaningEquals = (codeMeaningName: string) => {
    return contentItem => {
        return (
            contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName
        );
    };
};

export { codeMeaningEquals };
