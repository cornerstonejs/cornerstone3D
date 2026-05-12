const STACK_GUARD = 'viewportSupportsStackCompatibility';
const VOLUME_GUARD = 'viewportSupportsVolumeCompatibility';

function isMethodCall(node, methodName) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === methodName
  );
}

function createFilterCall(j, objectExpression, guardName) {
  return j.callExpression(
    j.memberExpression(
      j.callExpression(
        j.memberExpression(objectExpression, j.identifier('getViewports')),
        []
      ),
      j.identifier('filter')
    ),
    [j.memberExpression(j.identifier('utilities'), j.identifier(guardName))]
  );
}

function hasUtilitiesImport(root, j) {
  let found = false;

  root
    .find(j.ImportDeclaration, { source: { value: '@cornerstonejs/core' } })
    .forEach((path) => {
      if (path.node.importKind === 'type') {
        return;
      }

      if (
        path.node.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportSpecifier' &&
            specifier.importKind !== 'type' &&
            specifier.imported.name === 'utilities'
        )
      ) {
        found = true;
      }
    });

  return found;
}

function addUtilitiesImport(root, j) {
  if (hasUtilitiesImport(root, j)) {
    return;
  }

  const coreImports = root.find(j.ImportDeclaration, {
    source: { value: '@cornerstonejs/core' },
  });

  const namedImport = coreImports.filter(
    (path) =>
      path.node.importKind !== 'type' &&
      path.node.specifiers.some(
        (specifier) => specifier.type === 'ImportSpecifier'
      )
  );

  if (namedImport.size()) {
    const declaration = namedImport.at(0).nodes()[0];
    declaration.specifiers.push(j.importSpecifier(j.identifier('utilities')));
    return;
  }

  const importDeclaration = j.importDeclaration(
    [j.importSpecifier(j.identifier('utilities'))],
    j.literal('@cornerstonejs/core')
  );

  const program = root.find(j.Program).nodes()[0];
  const firstImportIndex = program.body.findIndex(
    (statement) => statement.type === 'ImportDeclaration'
  );

  if (firstImportIndex === -1) {
    program.body.unshift(importDeclaration);
  } else {
    program.body.splice(firstImportIndex, 0, importDeclaration);
  }
}

function createStackGuard(j, viewportName) {
  return j.ifStatement(
    j.unaryExpression(
      '!',
      j.callExpression(
        j.memberExpression(
          j.identifier('utilities'),
          j.identifier(STACK_GUARD)
        ),
        [j.identifier(viewportName)]
      )
    ),
    j.blockStatement([
      j.throwStatement(
        j.newExpression(j.identifier('Error'), [
          j.literal('Viewport does not support setStack'),
        ])
      ),
    ])
  );
}

function getStatementList(statementPath) {
  const parentPath = statementPath.parent;

  if (!parentPath) {
    return null;
  }

  const parent = parentPath.node;

  if (Array.isArray(parent)) {
    return parent;
  }

  if (Array.isArray(parent.body)) {
    return parent.body;
  }

  if (Array.isArray(parent.consequent)) {
    return parent.consequent;
  }

  return null;
}

function insertGuardAfterDeclaration(j, callPath) {
  const declaratorPath = callPath.parent;

  if (!declaratorPath || declaratorPath.node.type !== 'VariableDeclarator') {
    return false;
  }

  const declarationPath = declaratorPath.parent;

  if (
    !declarationPath ||
    declarationPath.node.type !== 'VariableDeclaration' ||
    declarationPath.node.declarations.length !== 1
  ) {
    return false;
  }

  const id = declaratorPath.node.id;

  if (id.type !== 'Identifier') {
    return false;
  }

  const statementList = getStatementList(declarationPath);

  if (!statementList) {
    return false;
  }

  const index = statementList.indexOf(declarationPath.node);

  if (index === -1) {
    return false;
  }

  statementList.splice(index + 1, 0, createStackGuard(j, id.name));
  return true;
}

function transform(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let didChange = false;
  let needsUtilities = false;

  root.find(j.CallExpression).forEach((path) => {
    const { node } = path;

    if (isMethodCall(node, 'getStackViewports')) {
      j(path).replaceWith(() =>
        createFilterCall(j, node.callee.object, STACK_GUARD)
      );
      didChange = true;
      needsUtilities = true;
      return;
    }

    if (isMethodCall(node, 'getVolumeViewports')) {
      j(path).replaceWith(() =>
        createFilterCall(j, node.callee.object, VOLUME_GUARD)
      );
      didChange = true;
      needsUtilities = true;
      return;
    }

    if (isMethodCall(node, 'getStackViewport')) {
      node.callee.property.name = 'getViewport';

      if (insertGuardAfterDeclaration(j, path)) {
        needsUtilities = true;
      }

      didChange = true;
    }
  });

  if (!didChange) {
    return null;
  }

  if (needsUtilities) {
    addUtilitiesImport(root, j);
  }

  return root.toSource({ quote: 'single' });
}

module.exports = transform;
module.exports.parser = 'tsx';
