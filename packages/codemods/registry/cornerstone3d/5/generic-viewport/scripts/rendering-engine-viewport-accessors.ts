import type { Codemod, Edit } from 'codemod:ast-grep';
import type { SgNode } from 'codemod:ast-grep';
import type TSX from 'codemod:ast-grep/langs/tsx';

const STACK_GUARD = 'viewportSupportsStackCompatibility';
const VOLUME_GUARD = 'viewportSupportsVolumeCompatibility';
const CORE_PACKAGE = '@cornerstonejs/core';

function getMethodCallParts(node: SgNode<TSX>) {
  if (node.kind() !== 'call_expression') {
    return null;
  }

  const memberExpression = node.field('function');

  if (!memberExpression || memberExpression.kind() !== 'member_expression') {
    return null;
  }

  const object = memberExpression.field('object');
  const property = memberExpression.field('property');

  if (!object || !property) {
    return null;
  }

  return {
    object,
    property,
    methodName: property.text(),
  };
}

function createFilterReplacement(objectText: string, guardName: string) {
  return `${objectText}\n  .getViewports()\n  .filter(utilities.${guardName})`;
}

function findCoreNamedImport(rootNode: SgNode<TSX>) {
  const coreImports = rootNode.findAll({
    rule: {
      kind: 'import_statement',
    },
  });

  return coreImports.find((importNode) => {
    const text = importNode.text();

    return (
      !/^import\s+type\b/.test(text) &&
      text.includes('{') &&
      text.includes('}') &&
      /from\s+(['"])@cornerstonejs\/core\1/.test(text)
    );
  });
}

function hasUtilitiesImport(rootNode: SgNode<TSX>) {
  const coreImport = findCoreNamedImport(rootNode);

  if (!coreImport) {
    return false;
  }

  const importClause = coreImport.text().match(/\{([\s\S]*?)\}/)?.[1] ?? '';

  return importClause
    .split(',')
    .map((specifier) => specifier.trim())
    .some((specifier) => specifier === 'utilities');
}

function createUtilitiesImportEdit(rootNode: SgNode<TSX>): Edit | null {
  if (hasUtilitiesImport(rootNode)) {
    return null;
  }

  const coreImport = findCoreNamedImport(rootNode);

  if (coreImport) {
    const text = coreImport.text();
    const specifierText = text.match(/\{([\s\S]*?)\}/)?.[1];
    const quote = text.includes(`from "${CORE_PACKAGE}"`) ? '"' : "'";

    if (!specifierText) {
      return null;
    }

    const specifiers = specifierText
      .split(',')
      .map((specifier) => specifier.trim())
      .filter(Boolean);

    specifiers.push('utilities');

    return coreImport.replace(
      `import { ${specifiers.join(', ')} } from ${quote}${CORE_PACKAGE}${quote};`
    );
  }

  const firstImport = rootNode.find({
    rule: {
      kind: 'import_statement',
    },
  });

  const insertedText = `import { utilities } from '${CORE_PACKAGE}';\n`;

  if (firstImport) {
    return {
      startPos: firstImport.range().start.index,
      endPos: firstImport.range().start.index,
      insertedText,
    };
  }

  return {
    startPos: 0,
    endPos: 0,
    insertedText,
  };
}

function statementForNode(node: SgNode<TSX>) {
  return node.ancestors().find((ancestor) => {
    const parent = ancestor.parent();

    if (!parent) {
      return false;
    }

    return (
      parent.kind() === 'program' ||
      parent.kind() === 'statement_block' ||
      parent.kind() === 'else_clause'
    );
  });
}

function createStackGuardEdit(callNode: SgNode<TSX>): Edit | null {
  const variableDeclarator = callNode
    .ancestors()
    .find((ancestor) => ancestor.kind() === 'variable_declarator');

  if (!variableDeclarator) {
    return null;
  }

  const variableName = variableDeclarator.field('name')?.text();
  const value = variableDeclarator.field('value');

  if (!variableName || value?.id() !== callNode.id()) {
    return null;
  }

  const statement = statementForNode(variableDeclarator);

  if (!statement) {
    return null;
  }

  return {
    startPos: statement.range().end.index,
    endPos: statement.range().end.index,
    insertedText: `\nif (!utilities.${STACK_GUARD}(${variableName})) {\n  throw new Error('Viewport does not support setStack');\n}`,
  };
}

const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];
  let needsUtilities = false;

  const calls = rootNode.findAll({
    rule: {
      kind: 'call_expression',
      any: [
        { pattern: '$RE.getStackViewports()' },
        { pattern: '$RE.getVolumeViewports()' },
        { pattern: '$RE.getStackViewport($$$ARGS)' },
      ],
    },
  });

  for (const call of calls) {
    const parts = getMethodCallParts(call);

    if (!parts) {
      continue;
    }

    if (parts.methodName === 'getStackViewports') {
      edits.push(
        call.replace(createFilterReplacement(parts.object.text(), STACK_GUARD))
      );
      needsUtilities = true;
      continue;
    }

    if (parts.methodName === 'getVolumeViewports') {
      edits.push(
        call.replace(createFilterReplacement(parts.object.text(), VOLUME_GUARD))
      );
      needsUtilities = true;
      continue;
    }

    if (parts.methodName === 'getStackViewport') {
      edits.push(parts.property.replace('getViewport'));

      const guardEdit = createStackGuardEdit(call);

      if (guardEdit) {
        edits.push(guardEdit);
        needsUtilities = true;
      }
    }
  }

  if (!edits.length) {
    return null;
  }

  if (needsUtilities) {
    const importEdit = createUtilitiesImportEdit(rootNode);

    if (importEdit) {
      edits.push(importEdit);
    }
  }

  return rootNode.commitEdits(edits);
};

export default codemod;
