function excludeNodeModulesExcept(modules) {
  var moduleRegExps = modules.map(function (modName) {
    return new RegExp('node_modules[/\\]' + modName);
  });

  return function (modulePath) {
    if (/cornerstoneDICOMImageLoader/.test(modulePath)) {
      return true;
    }

    if (/node_modules/.test(modulePath)) {
      for (var i = 0; i < moduleRegExps.length; i++)
        if (moduleRegExps[i].test(modulePath)) return false;
      return true;
    }
    return false;
  };
}

module.exports = excludeNodeModulesExcept;
