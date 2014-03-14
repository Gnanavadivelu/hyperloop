/**
 * Androiddow specific code generation
 */
var Codegen = require('../codegen').Codegen,
	fs = require('fs'),
	_ = require('underscore'),
	wrench = require('wrench'),
	async = require('async'),
	path = require('path'),
	crypto = require('crypto'),
	log = require('../log'),
	metabase = require('./metabase'),
	util = require('../util')
	//finder = require('./finder'),
//	programs = require('./programs'),
//	ilparser = require('./ilparser'),
//	hparser = require('./hparser')
;

function AndroidCodegen(options) {
	Codegen.call(this, options);
}

// extend our base class
AndroidCodegen.prototype.__proto__ = Codegen.prototype;

AndroidCodegen.prototype.generate = function(asts, generateASTCallback, callback) {
log.info('codegen.js: in generate');
	var androidPath = process.env.ANDROID_SDK_ROOT + '/platforms/android-19/android.jar';
	var json_metabase = metabase.generateJSON(androidPath, function(err,buf){
//	var json_metabase = metabase.generate(androidPath, function(err,buf){
log.info('codegen.js: in generateJSON');
		if (err) {
			log.fatal(err);
		}
		log.info(buf);
		generateWithMetaBase(buf, asts, generateASTCallback, callback);
	
	}
);
log.info('codegen.js: json_metabase' + json_metabase);

//generateWithMetaBase(json_metabase, asts, generateASTCallback, callback);

	/*
	var options = this.options,
		isTest = process.env['HYPERLOOP_TEST'],
		cacheDir = process.env.TMPDIR || process.env.TEMP || '/tmp',
		parsedChecksum = crypto.createHash('sha1').update(
			options.sdk
				+ (isTest ? 'test' : 'not-test')
				+ fs.readFileSync(path.join(__dirname, 'ilparser.js'), 'utf8')
		).digest('hex'),
		cacheFile = path.join(cacheDir, 'hyperloop_windows_metabase.' + parsedChecksum + '.json.gz');

	if (cacheFile && fs.existsSync(cacheFile)) {
		var metabase = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
		return generateImports(options, metabase, asts, generateASTCallback, callback);
	}

	var ref = finder.find('Androiddows.winmd', options.sdk);
	if (!ref) {
		log.error('Failed to find Androiddows.winmd.');
		log.fatal('Please create an issue at https://github.com/appcelerator/hyperloop/issues/new.');
	}
	programs.ildasm(ref, 'windows.il', function(err, ref) {
		if (err) {
			log.error('Failed to ildasm the windows.winmd: ildasm.exe failed.');
			log.fatal(err);
		}
		ilparser.parseFile(ref, function(err, ast) {
			if (err) {
				log.error('Failed to parse the output from ildasm.');
				log.fatal(err);
			}
			var metabase = ast.toJSON();
			util.writeIfDifferent(cacheFile, JSON.stringify(metabase, null, 2));
			generateImports(options, metabase, asts, generateASTCallback, callback);
		});
	});
	*/
};

function generateImports(options, metabase, asts, generateASTCallback, callback) {
log.info('codegen.js: in generateImports');
	/*
	var left = asts.length;

	function done() {
		if (--left === 0) {
			generateWithMetaBase(metabase, asts, generateASTCallback, callback);
		}
	}

	for (var i = 0, iL = asts.length; i < iL; i++) {
		var imports = asts[i].sourcefile._symbols.map(function(i) {
			return i.value;
		}).filter(removeFalsy);
		if (imports.length === 0) {
			done();
		}
		else {
			hparser.run(options, imports, asts[i].sourcefile, done);
		}
	}
	*/
}

function generateWithMetaBase(the_metabase, asts, generateASTCallback, callback) {
log.info('codegen.js: in generateWithMetaBase');

	
	var jsEngine,
		jsEngineName = 'jsc',
		jsEngineFile = path.join(__dirname, jsEngineName, 'codegen.js'),
		classes = the_metabase.classes,
		generate = {
			compiler: {},
			customclasses: {},
			classes: {},
			casts: {},
			generics: {},
			symbols: {},
			memory: {},
			prefix: '',
			name: ''
		};

	// iterate over the ast to do some processing
	for (var i = 0; i < asts.length; i++) {
		var ast = asts[i],
			symbols = ast.sourcefile.symbols,
			imports = ast.sourcefile.imports;

		for (var c = 0; c < symbols.length; c++) {
			var symbol = symbols[c];
			switch (symbol.type) {
				case 'compiler':
					_.defaults(generate.compiler, symbol.value);
					break;
				case 'package':
				case 'method':
				case 'function':
					break;
				case 'symbol':
				{
					console.log('Symbol:', symbol);
					break;
				}
				case 'cast':
				{
					generate.casts[symbol.functionName] = symbol;
					break;
				}
				case 'generic':
				{
					var generic = findGenerics(symbol.args[0], classes);
					if (generic) {
						symbol.className = generic;
						var classObject = classes[generic];
						symbol.object = {
							is_generic: true,
							type: symbol.targetType,
							object: classObject,
							className: symbol.className,
							mangledName: symbol.functionName,
							simpleType: symbol.functionName,
							fullInstanceName: symbol.targetType
						};
						symbol.mangledName = symbol.functionName;
						generate.generics[symbol.functionName] = symbol;
					}
					break;
				}
				case 'memory':
				{
					if (isArray(symbol.value)) {
						var lengths = [],
							array = makeArray(symbol.value, lengths);
						var subscript = '[' + lengths.join('][') + ']';

						symbol.assign = symbol.nativename;
						symbol.code = 'float ' + symbol.nativename + '$ ' + subscript + ' = ' + array + ';';
						symbol.code += '\nfloat *' + symbol.nativename + ' = (float *)malloc(sizeof(' + symbol.nativename + '$));';
						symbol.code += '\nmemcpy(' + symbol.nativename + ',&' + symbol.nativename + '$,sizeof(' + symbol.nativename + '$));';
						symbol.length = 'sizeof(' + symbol.nativename + '$)';
					}
					else {
						if (symbol.value === null) {
							symbol.code = 'float *' + symbol.nativename + ' = (float *)malloc(sizeof(float) * 1);\n';
							// initialize to NAN
							symbol.code += symbol.nativename + '[0] = NAN;';
							symbol.length = 'sizeof(float)*1';
						}
						else {
							symbol.code = 'void *' + symbol.nativename + ' = (void *)malloc(' + symbol.value + ');\n';
							// initialize to NAN
							symbol.code += '((float*)' + symbol.nativename + ')[0] = NAN;';
							symbol.length = symbol.value;
						}
						symbol.assign = symbol.nativename;
					}
					generate.memory[symbol.nativename] = symbol;
					break;
				}
				case 'class':
				{
					// new class
					if (symbol.extendsName) {
						var extendsType = findClassOfType(symbol.extendsName, true, classes, generate);
						if (!extendsType) {
							return callback(new Error("Couldn't find Class " + symbol.extendsName + " in " + symbol.node.start.file + " at " + symbol.node.start.line));
						}
						symbol.extendsType = classes[extendsType];
						var interfaces = symbol.interfaces;
						if (interfaces && interfaces.length) {
							for (var x = 0; x < interfaces.length; x++) {
								var interfaceName = interfaces[x],
									found = findClassOfType(interfaceName, true, classes, generate);
								if (!found) {
									return callback(new Error("Couldn't find Class " + interfaceName + " in " + symbol.node.start.file + " at " + symbol.node.start.line));
								}
							}
						}
						var methods = symbol.methods;
						if (methods && methods.length) {
							for (var x = 0; x < methods.length; x++) {
								var methodName = methods[x];
								//TODO: check method argument types and returnType
							}
						}
					}
					generate.customclasses[symbol.className] = symbol;
					break;
				}
				case 'unknown':
				{
					switch (symbol.metatype) {
						case 'new':
						{
							var type = generate.classes[symbol.name];
							if (!type) {
								// check for fully qualified className
								var entry = classes[symbol.name];
								if (entry) {
									var tok = symbol.name.split('.'),
										name = tok[tok.length];
									type = name;
								}
								else {
									log.fatal("couldn't resolve class: " + symbol.name + " in " + (!symbol.node.start ? 'unknown' : (symbol.node.start.file + " at " + symbol.node.start.line)));
								}
							}
							//TODO: this is a new Class
							break;
						}
						case 'symbol':
						{
							var foundClass = findClassOfType(symbol.name, false, classes, generate);
							if (foundClass) {
								// found a class
								symbol.className = foundClass;
								symbol.object = classes[foundClass];
								symbol.type = 'class';
								generate.classes[symbol.name] = symbol;
							}
							else if (imports && symbol.name in imports.classes) {
								symbol.className = symbol.fullInstanceName = 'Wrapped' + symbol.name;
								symbol.object = imports.classes[symbol.name];
								symbol.mangledName = 'Wrapped' + symbol.name;
								symbol.is_imported_class = symbol.is_object = true;
								symbol.type = 'class';
								generate.classes[symbol.name] = symbol;
								symbol.object.methods = _.flatten(_.values(symbol.object.methods)); 
							}
							else if (imports && symbol.name in imports.symbols) {
								// found an imported symbol
								symbol.className = symbol.name;
								symbol.object = imports.symbols[symbol.name];
								symbol.type = 'symbol';
								generate.symbols[symbol.name] = symbol;
							}
							else if (imports && symbol.name in imports.types) {
								console.log(imports.types[symbol.name]);
								log.fatal('Not Yet Implemented', 'Imported Type: ', symbol.name);
							}
							else {
								var generic = findGenerics(symbol.name, classes);
								if (generic) {
									symbol.className = generic;
									symbol.object = classes[symbol.className];
									symbol.type = 'class';
									generate.classes[symbol.name] = symbol;
								}
								else {

									  var key;
									  var matcher = new RegExp("^" + symbol.name + "\.");
									  var is_found = false;

									  for (key in classes) {
										  if (matcher.test(key)) {
											  log.info('got match for "' + symbol.name + '"');
											  is_found = true;
										break;
										  }
  									}

									if(!is_found)
									{
										// unknown symbol
										log.fatal('Unknown Symbol:', symbol.name);
									}
								}
							}
							break;
						}
					}
					break;
				}
				default:
				{
					//console.log('Unhandled:', symbol);
					break;
				}
			}
		}
	}

	// generate compressed source
	var sourceResults = generateASTCallback(asts),
		tasks = [];
	log.info('codegen.js sourceResults ' + sourceResults);
	log.info('codegen.js jsEngineFile ' + jsEngineFile);
	// make sure we have a valid JS engine
	if (!fs.existsSync(jsEngineFile)) {
		return callback(new Error("Invalid option specified for --jsengine. Couldn't find engine named: " + jsEngineName.red) + " at " + jsEngineFile.yellow);
	}
	jsEngine = require(jsEngineFile);

	generate.asts = asts;
	generate.dir = path.join('build', 'App');
	generate.gen_dir = path.join(generate.dir, 'Generated');
	generate.source = sourceResults[Object.keys(sourceResults)[0]];
	generate.name = 'GeneratedApp';
	wrench.mkdirSyncRecursive(generate.gen_dir);
	log.info('generateWithMetaBase');

	jsEngine.generateCode(generate, the_metabase, function generateCodeCallback(err, header, implementation, config) {
	log.info('generateWithMetaBase generateCode');
		
		if (err) {
			return callback(err);
		}
	log.info("codegen.js path.join('build', 'config.json') " + path.join('build', 'config.json'));

	log.info("codegen.js path.join(generate.dir, generate.prefix + generate.name + '.h' " + path.join(generate.dir, generate.prefix + generate.name + '.h'));
	log.info("codegen.js path.join(generate.dir, generate.prefix + generate.name + '.h' " + path.join(generate.dir, generate.prefix + generate.name + '.cpp'));
		
		util.writeIfDifferent(path.join('build', 'config.json'), JSON.stringify(config, undefined, 4));
		util.writeIfDifferent(path.join(generate.dir, generate.prefix + generate.name + '.h'), header);
		util.writeIfDifferent(path.join(generate.dir, generate.prefix + generate.name + '.cpp'), implementation);
	log.info('generateWithMetaBase generateCode callback ' + callback);
		callback();
	});
}

exports.Codegen = AndroidCodegen;

function isArray(value) {
	return value && value.constructor.name === Array.prototype.constructor.name;
}

function makeArray(value, lengths) {
	lengths && lengths.push(value.length);
	var array = [];
	for (var c = 0; c < value.length; c++) {
		var entry = value[c];
		if (isArray(entry)) {
			entry = makeArray(entry, c === 0 ? lengths : null);
		}
		array.push(entry);
	}
	return '{' + array.join(', ') + '}';
}

function findGenerics(name, classes) {
	var regex = new RegExp('\\.' + name + '`[12]<[^>]+>$');
	for (var key in classes) {
		if (classes.hasOwnProperty(key)) {
			if (regex.test(key)) {
				return key;
			}
		}
	}
	return null;
}

function findClassOfType(type, required, classes, generate) {
	type = type.replace(/::/g, '.');
	var matches = [],
		isNamespaced = type.indexOf('.') > 0,
		prefix = (isNamespaced ? '' : '\\.'),
		findType = new RegExp(prefix + type + '$');
	for (var key in classes) {
		if (classes.hasOwnProperty(key)) {
			if (key.match(findType)) {
				matches.push(key);
			}
		}
	}
	switch (matches.length) {
		case 0:
			return !required ? undefined : log.fatal('Unable to find class of type ' + type.bold + '!');
		case 1:
			return matches[0];
		default:
			// Attempt to disambiguate based on @compiler "using_namespaces".
			var namespaces = generate.compiler.using_namespaces || [];
			for (var i = 0, iL = matches.length; i < iL; i++) {
				var match = matches[i];
				for (var j = 0, jL = namespaces.length; j < jL; j++) {
					var ns = namespaces[j];
					// TODO: Filter out invalid namespaces based on the compiler directive.
					console.log(match, 'vs', ns);
				}
			}
			return log.fatal('' + type.bold + ' is ambiguous between ' + matches.join(' and ') + '!');
	}
}

function removeFalsy(a) {
	return !!a;
}
