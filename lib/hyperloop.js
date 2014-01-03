/**
 * hyperloop compiler module
 */

var path = require('path'),
	fs = require('fs'),
	colors = require('colors'),
	log = require('./log'),
	compiler = require('./compiler'),
	appc = require('node-appc'),
	util = require('./util'),
	wrench = require('wrench'),
	crypto = require('crypto'),
	commands = {};

/**
 * get a list of exported commands that hyperloop supports
 */
exports.getCommands = function() {
	var result = [];
	Object.keys(commands).forEach(function(c){
		result.push(commands[c]);
	});
	return result;
};

/**
 * execute a specific command
 */
exports.run = function (command, options, args) {
	options = options || {};
	var cmd = commands[command];
	if (!cmd) {
		log.fatal('invalid command: ',command);
	}
	delete options.colors; // we don't need our color config
	cmd.execute(options, args);
};

/**
 * base class for commands
 */
function Command(name, desc, func) {
	this.description = desc;
	this.command = func;
	this.name = name;
}

Command.prototype.getName = function() {
	return this.name;
};

Command.prototype.getHelp = function() {
	return this.description;
};

Command.prototype.execute = function(options, args) {
	this.command(options,args);
};

/**
 * check to make sure that the `name` key is present in `options` and if not
 * exit with the error message `help`
 */
function required(options, name, help) {
	if (!options[name]) {
		log.fatal('Missing required options '+('--'+name).magenta.bold+' which should '+help);
	}
}

/**
 * recursively get a listing of files for a given directory
 */
function filelisting(dir, filter, files) {
	files = files || [];
	fs.readdirSync(dir).forEach(function(f){
		f = path.join(path.resolve(dir),f);
		if (util.isDirectory(f)) {
			filelisting(f, filter, files);
		}
		else {
			filter.test(f) && files.push(f);
		}
	});
	return files;
}

/**
 * command to handle the compile
 */
commands['compile'] = new Command('compile', 'compile source files', function(options,args) {

	required(options,'src','specify the directory of files to be compiled, or a specific file to compile');
	required(options,'dest','specify the directory where files will be generated');
	required(options,'platform','specify the platform to target such as ios, windows, android, etc');

	var platform = options.platform,
		src = appc.fs.resolvePath(options.src),
		isDir = util.isDirectory(src),
		codegen = new (require(path.join(__dirname,platform,'codegen.js')).Codegen)(options),
		SourceFile = require(path.join(__dirname,platform,'sourcefile.js')).SourceFile,
		prefix = options.prefix ? options.prefix + '/' : '',
		asts = [];

	var files = isDir ? filelisting(src, /\.h?js$/) : [src];

	if (files.length===0) {
		log.fatal('No source files found at',src.magenta);
	}

	if (!fs.existsSync(options.dest)) {
		wrench.mkdirSyncRecursive(options.dest);
	}

	// force an option for the src directory
	options.srcdir = path.join(options.dest, 'src');

	if (!options.classprefix)
	{
		options.classprefix = 'hl$';
	}

	var env = options.environment,
		env_dev = /^dev/i.test(env) || !env,
		env_prod = /^prod/i.test(env),
		env_test = /^test/i.test(env),
		build_opts = {
			"DEBUG": options.debug || false,
			"TITANIUM_VERSION": "0.0.0",
			"TITANIUM_BUILD_HASH": "",
			"TITANIUM_BUILD_DATE": new Date().toString(),
			"OS_IOS": /(ios|iphone|ipad)/i.test(platform),
			"OS_IPHONE": /(ios|iphone)/i.test(platform),
			"OS_IPAD": /(ios|ipad)/i.test(platform),
			"OS_ANDROID": /(android)/i.test(platform),
			"OS_BLACKBERRY": /(blackberry)/i.test(platform),
			"OS_WINDOWS": /(windows)/i.test(platform),
			"OS_WEB": /(web|html)/i.test(platform),
			"OS_MOBILEWEB": /(web|html)/i.test(platform),
			"OS_TIZEN": /(tizen)/i.test(platform),
			"ENV_DEV": env_dev,
			"ENV_DEVELOPMENT": env_dev,
			"ENV_TEST": env_test,
			"ENV_PRODUCTION": env_prod
		},
		ti_key = /^ti-/i,
		hl_key = /^hl-/i;

	// attempt to pass in any additional keys from command line which will
	// customize our compression
	Object.keys(options).forEach(function(k){
		var value = options[k];
		if (ti_key.test(k)) {
			k = k.replace(ti_key,'TITANIUM_').replace(/-/g,'_').toUpperCase();
			build_opts[k] = value;
		} else if (hl_key.test(k)) {
			k = k.replace(hl_key,'HYPERLOOP_').replace(/-/g,'_').toUpperCase();
			build_opts[k] = value;
		} else {
			build_opts[k.toUpperCase()] = value;
		}
	});


	files.forEach(function(filename){
		if (!fs.existsSync(filename)) {
			log.fatal("Couldn't find source file",filename.magenta);
		}

		var relativeFilename = isDir ? filename.replace(path.resolve(src), '') : src,
			relativeFilename = relativeFilename.charAt(0) === '/' ? relativeFilename.substring(1) : relativeFilename,
			isHJS = /\.hjs$/.test(relativeFilename),
			jsfilename = relativeFilename.replace(/[\s-\/]/g, '_').replace(/\.h?js$/, ''), // replace invalid chars
			relativeFilename = prefix + relativeFilename,
			source = fs.readFileSync(filename).toString(),
			sourceHash = crypto.createHash('md5').update(source).digest('hex'),
			sourcefile = new SourceFile(relativeFilename, jsfilename, options, args),
			ast = isHJS && compiler.compile(source,'./'+jsfilename+'.js',jsfilename,sourcefile,build_opts);

		asts.push({ast: ast, sourcefile: sourcefile, filename: filename, jsfilename: jsfilename, sourceHash: sourceHash});
		codegen.addSource(sourcefile);

		if (isHJS) {
			sourcefile = new SourceFile(jsfilename+'_sm',jsfilename+'_sm');
			codegen.addSource(sourcefile);
		}
	});

	var sourceMapFile = path.join(__dirname, '..', 'deps', '_source-map.js');
	var sourceMapDest = path.join(options.dest,'src');
	if (!fs.existsSync(sourceMapDest)) {
		wrench.mkdirSyncRecursive(sourceMapDest);
	}
	var sourceMapFileDest = path.join(sourceMapDest,'_source_map.js');
	util.copyFileSync(sourceMapFile, sourceMapFileDest);
	var source = fs.readFileSync(sourceMapFile).toString();
	var sourceHash = crypto.createHash('md5').update(source).digest('hex');
	var sourcefile = new SourceFile('/_source_map.js','_source_map',{},{});
	asts.push({ast:null,sourcefile:sourcefile,filename:sourceMapFileDest,jsfilename:'_source_map',sourceHash:sourceHash});
	codegen.addSource(sourcefile);

	function generateASTs(asts) {
		log.debug('using JS compress options:',JSON.stringify(build_opts).grey);

		var sourceResults = {},
			sourceMaps = [];

		asts.forEach(function(entry) {
			var sourcefile = entry.sourcefile,
				filename = entry.filename,
				jsfilename = entry.jsfilename,
				sourceHash = entry.sourceHash,
				jssrc = path.join(options.dest, 'src', jsfilename + '.js'),
				sourcecode, compressed;

			if (entry.ast) {
				compressed = compiler.compress(entry.ast, build_opts, filename, './'+jsfilename+'.js');
				sourcecode = compressed.code;
				sourceMaps.push({name:jsfilename+'_sm',filename:'/'+jsfilename+'_sm',code:compressed.map});
			} else {
				// this is just plain ole JS, not HJS
				sourcecode = fs.readFileSync(filename).toString();
			}

			if (options.debug) {
				fs.writeFileSync(jssrc, sourcecode);
				log.debug('wrote output JS at',jssrc.yellow);
			}

			sourcefile.finish(sourcecode);

			// map our generate source into our results
			sourceResults[sourcefile.filename] = sourcecode;
		});

		// turn our sourcemaps into code that will be native compiled as well
		//
		// TODO: in an ideal world, the sourcecode code will just be stored in the
		// native compiled file of the original source instead of a separate compiled file
		sourceMaps.forEach(function(sm){
			sourceResults[sm.filename] = sm.code;
			var sourcefile = new SourceFile(sm.filename,sm.name,{},{});
			codegen.addSource(sourcefile);
		});

		return sourceResults;
	}

	codegen.generate(asts,generateASTs,function(err,file){
		if (err) {
			log.fatal(err.toString());
		}
		!options.dontExit && process.exit(0);
		options.callback && options.callback();
	});
});

/**
 * command to handle the package
 */
commands['package'] = new Command('package', 'package source files', function(options,args) {

	required(options,'src','specify the directory where files should be compiled');
	required(options,'platform','specify the platform to target such as ios, windows, android, etc');

	var fn = commands['compile'],
		platform = options.platform,
		Packager = require(path.join(__dirname,platform,'packager.js')).Packager;
		packager = new Packager(options);

	// validate args before we compile
	packager.validate(options,args,required);

	// tell the compiler not to automatically exit on completion
	options.dontExit = true;

	// called after the compiler
	options.callback = function() {
		delete options.callback;
		packager.package(options,args,function(err){
			err && log.fatal(err.message);
		});
	};

	fn.command(options,args);
});

commands['clean'] = new Command('clean', 'removes the build folder', function(options,args) {
	required(options,'dest','specify the directory where files will be generated');
	if (fs.existsSync(options.dest)) {
		wrench.rmdirSyncRecursive(options.dest);
		log.info('cleaned ' + options.dest.yellow);
	}
});
