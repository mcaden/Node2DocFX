(function () {
  /*global env*/
  var dfm = require('./dfm');
  var config = null;
  var items = [];
  var itemsMap = {};
  var base = '_yamlGeneratorOutput';
  var globalUid = 'global';
  var uidPrefix = '';
  var yamlMime = '### YamlMime:UniversalReference';
  var outputFileExt = '.yml';
  var jsdocConfigPath = '_jsdocConfTemp.json';
  var builtInTypes = ['array', 'arraybuffer', 'asyncfunction', 'atomics', 'boolean', 'dataview', 'date', 'error', 'evalerror', 'float32array', 'float64array', 'function', 'generator', 'generatorfunction', 'infinity', 'int16array', 'int32array', 'int8array', 'internalerror', 'intl', 'intl.collator', 'intl.datetimeformat', 'intl.numberformat', 'iterator', 'json', 'map', 'math', 'nan', 'number', 'object', 'parallelarray', 'promise', 'proxy', 'rangeerror', 'referenceerror', 'reflect', 'regexp', 'simd', 'simd.bool16x8', 'simd.bool32x4', 'simd.bool64x2', 'simd.bool8x16', 'simd.float32x4', 'simd.float64x2', 'simd.int16x8', 'simd.int32x4', 'simd.int8x16', 'simd.uint16x8', 'simd.uint32x4', 'simd.uint8x16', 'set', 'sharedarraybuffer', 'stopiteration', 'string', 'symbol', 'syntaxerror', 'typeerror', 'typedarray', 'urierror', 'uint16array', 'uint32array', 'uint8array', 'uint8clampedarray', 'weakmap', 'weakset', 'undefined'];

  function addItem(item) {
    if (itemsMap[item.uid] && (itemsMap[item.uid].summary && itemsMap[item.uid].summary !== '' || item.summary === '')) {
      return;
    }
    item.langs = ['js'];
    // javascript dosen't allow method / class with the same name
    if (itemsMap[item.uid] !== undefined && items[items.length - 1].uid == item.uid) {
      items[items.length - 1] = item;
    } else {
      if (item.type === 'Class') {
        // put class in front of item array to ensure serialize won't skip anything useful.
        items.unshift(item);
      } else {
        items.push(item);
      }
    }
    itemsMap[item.uid] = item;
  }

  function setSourceInfo(item, doclet) {
    if (config.repo) {
      var path = doclet.meta.path.replace(env.pwd + '\\', '') + '\\' + doclet.meta.filename;
      if (path.split('\\').length > 2) {
        path = path.split('\\').splice(2).join('\\');
      }
      item.source = {
        id: item.id,
        path: path,
        startLine: doclet.meta.lineno,
        remote: {
          branch: config.repo.branch,
          path: path,
          repo: config.repo.url
        }
      };
    }
  }

  function handleClass(item, doclet) {
    item.type = 'Class';
    if (doclet.classdesc) {
      item.summary = dfm.convertLinkToGfm(doclet.classdesc, uidPrefix);
    }

    var ctor = {
      id: item.id + '.#ctor',
      uid: item.uid + '.#ctor',
      parent: item.uid,
      name: item.name,
      fullName: item.fullName + '.' + item.name,
      summary: dfm.convertLinkToGfm(doclet.description, uidPrefix)
    };
    handleFunction(ctor, doclet);
    item.children = [ctor.uid];
    addItem(ctor);
  }

  function handleFunction(item, doclet) {
    item.type = doclet.kind === 'function' ? 'Function' : 'Constructor';
    item.syntax = {};
    // set parameters
    if (doclet.params !== undefined) {
      item.syntax.parameters = doclet.params.map(function (p) {
        return {
          id: p.name,
          type: handleParameterType(p.type),
          description: dfm.convertLinkToGfm(p.description, uidPrefix),
          optional: p.optional
        };
      });
    }
    // set name and fullName
    var params = [];
    (item.syntax.parameters || []).forEach(function (p) {
      if (p.id.indexOf('.') < 0) params.push(p.id);
    });
    item.name += '(' + params.join(', ') + ')';
    item.fullName += '(' + params.join(', ') + ')';
    // set return type
    if (doclet.returns != undefined) {
      item.syntax.return = {
        type: handleParameterType(doclet.returns[0].type),
        description: dfm.convertLinkToGfm(doclet.returns[0].description, uidPrefix),
        optional: doclet.returns[0].optional
      };
    }
    // set syntax
    // which one is better:
    // 1. function method_name(arg1, arg2, ...);
    // 2. return_type function method_name(arg1, arg2)
    // 3. function method_name(arg1, arg2) -> return_type
    item.syntax.content = (item.type === 'Function' ? 'function ' : 'new ') + item.name;

    function handleParameterType(type) {
      if (!type) return undefined;
      return type.names.map(function (n) {
        if (builtInTypes.indexOf(n.toLowerCase()) == -1) {
          n = uidPrefix + n;
        }
        return n;
      });
    }
  }

  function handleMember(item, doclet) {
    item.type = 'Member';
    // set type
    item.syntax = {};
    if (doclet.type != undefined) {
      item.syntax.return = {
        type: [doclet.type.names[0]]
      };
    }
    // set syntax
    item.syntax.content = item.name;
  }

  function serializeToc() {
    var serializer = require('js-yaml');
    var fs = require('fs');
    var classes = {};
    var fileMap = {};
    var namespaceMap = {};
    var classToNamespaceMap = {};
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base);
    }
    items.forEach(function (item) {
      switch (item.type) {
        case 'Class':
          classes[item.uid] = {
            items: [item],
            referenceMap: {}
          };

          // Calculate the namespace, if applicable.
          let lastDot = item.uid.lastIndexOf('.');
          if (lastDot > 0) {
            let ns = item.uid.substring(0, lastDot);
            namespaceMap[ns] = namespaceMap[ns] || {};
            classToNamespaceMap[item.uid] = namespaceMap[ns];
          }

          fileMap[item.uid] = item.uid;
          break;
        case 'Constructor':
        case 'Function':
        case 'Member':
          var parentId = item.parent || globalUid;
          var parent = classes[parentId];
          if (parent === undefined) {
            console.log(parentId + ' is not a class, ignored.');
            break;
          }
          parent.items.push(item);
          if (parentId === globalUid) {
            (parent.items[0].children = parent.items[0].children || []).push(item.uid);
          }
          fileMap[item.uid] = parentId;
          (item.syntax.parameters || []).forEach(function (p) {
            (p.type || []).forEach(function (t) {
              classes[parentId].referenceMap[t] = true;
            });
          });
          if (item.syntax.return) {
            (item.syntax.return.type || []).forEach(function (t) {
              classes[parentId].referenceMap[t] = true;
            });
          }
          break;
      }
    });

    var toc = [];
    // Add the namespaces we know of to the toc.
    for (var ns in namespaceMap) {
      if (ns === globalUid) {
        continue;
      }

      namespaceMap[ns].toc = {
        uid: ns,
        name: ns,
        items: []
      };
      toc.push(namespaceMap[ns].toc);
    }

    for (var id in classes) {
      var classItem = classes[id];
      // build references
      classItem.references = [];
      for (var r in classItem.referenceMap) {
        var f = fileMap[r];
        if (f !== undefined && f !== id) {
          classItem.references.push({
            uid: r,
            name: r.indexOf('.') == -1 ? r : r.substring(r.indexOf('.') + 1),
            fullName: r,
            isExternal: f === undefined
          });
        }
      }
      classItem.referenceMap = undefined;
      if (classItem.references.length == 0) {
        classItem.references = undefined;
      }

      // something wrong in js-yaml, workaround it by serialize and deserialize from JSON
      classItem = JSON.parse(JSON.stringify(classItem));
      // replace \r, \n, space with dash
      // filter global without children
      if (id == globalUid && (!classItem.items[0].children || classItem.items[0].children.length === 0)) {
        continue;
      }

      var fileName = id.replace(/[ \n\r]/g, '-') + outputFileExt;
      if (fileName && fileName.split('.').length > 2) {
        fileName = fileName.split('.').splice(1).join('.');
      }
      fs.writeFileSync(base + '/' + fileName, yamlMime + '\n' + serializer.safeDump(classItem));
      console.log(fileName + ' generated.');

      var tocItem = {
        uid: id,
        name: classItem.items[0].name
      };

      // Add to namespace children in ToC, or root if global
      if (classToNamespaceMap[id]) {
        classToNamespaceMap[id].toc.items.push(tocItem);
      } else {
        toc.push(tocItem);
      }
    }

    var sortFn = function (a, b) {
      // sort classes alphabetically, but GLOBAL at last
      if (a.uid === globalUid) {
        return 1;
      }
      if (b.uid === globalUid) {
        return -1;
      }
      var nameA = a.name.toUpperCase();
      var nameB = b.name.toUpperCase();
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      return 0;
    };

    // Sort the toc items, followed by sorting their children.
    toc.sort(sortFn);
    toc.forEach(function (rootTocitem) {
      if (rootTocitem.items) {
        rootTocitem.items.sort(sortFn);
      }
    });

    fs.writeFileSync(base + '/toc.yml', serializer.safeDump(toc));
    console.log('toc.yml generated.');
  }

  var typeMap = {
    'member': handleMember,
    'function': handleFunction,
    'class': handleClass
  };

  exports.handlers = {
    newDoclet: function (e) {
      var doclet = e.doclet;
      // ignore anything whose parent is not a doclet
      // except it's a class made with help function
      if (doclet.memberof !== undefined && itemsMap[uidPrefix + doclet.memberof] === undefined && doclet.kind !== 'class') {
        return;
      }
      // ignore unrecognized kind
      if (typeMap[doclet.kind] === undefined) {
        console.log('unrecognized kind: ' + doclet.kind);
        return;
      }
      // ignore unexported global member
      if (doclet.memberof === undefined && doclet.kind != 'class' && !(doclet.meta && doclet.meta.code && typeof (doclet.meta.code.name) === 'string' && doclet.meta.code.name.indexOf('exports') == 0)) {
        return;
      }
      // ignore inner function or member
      if (doclet.kind === 'member' && doclet.scope === 'inner') {
        return;
      }

      if (doclet.access === 'private') {
        return;
      }

      if (doclet.name && doclet.name[0] === '_') {
        return;
      }

      // ignore doclet without doucment
      if (doclet.undocumented === true) {
        return;
      }

      // ignore empty longname
      if (!doclet.longname) {
        return;
      }
      var parent = '';
      if (doclet.memberof === undefined && doclet.kind !== 'class') {
        parent = '_global.';
      }
      // basic properties
      var item = {
        uid: uidPrefix + parent + doclet.longname,
        id: uidPrefix + parent + doclet.longname,
        parent: (doclet.memberof && doclet.kind !== 'class') ? (uidPrefix + doclet.memberof) : undefined,
        name: doclet.name,
        summary: doclet.description ? dfm.convertLinkToGfm(doclet.description, uidPrefix) : dfm.convertLinkToGfm(doclet.summary, uidPrefix)
      };
      // set parent
      if (item.parent !== undefined) {
        parent = itemsMap[item.parent];
        (parent.children = parent.children || []).push(item.uid);
      }
      // set full name
      item.fullName = (item.parent ? item.parent + '.' : uidPrefix) + item.name;

      // set source info
      if (doclet.kind === 'class') {
        setSourceInfo(item, doclet);
      }

      // pass custom tags
      if ('tags' in doclet) {
        item.tags = doclet.tags;
      }

      typeMap[doclet.kind](item, doclet);
      addItem(item);
    },
    parseBegin: function () {
      var fse = require('fs-extra');
      config = fse.readJsonSync(jsdocConfigPath);

      if (config.repo && config.repo.url && !config.repo.url.endsWith('.git')) {
        config.repo.url = config.repo.url + '.git';
      }

      // parse package.json to use package name
      if (config.package) {
        var packageJson = fse.readJsonSync(config.package);
        if (packageJson && packageJson.name) {
          globalUid = packageJson.name + '.' + globalUid;
          uidPrefix = packageJson.name + '.';
        }
      }
      items.push(
        {
          uid: globalUid,
          id: globalUid,
          name: 'GLOBAL',
          fullName: 'GLOBAL',
          type: 'Class',
          langs: ['js']
        }
      );
    },
    parseComplete: function () {
      serializeToc();
      // no need to generate html, directly exit process
      process.exit(0);
    }
  };
})();
