/**
 * common utilities
 */
var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	ejs = require('ejs'),
	appc = require('node-appc'),
	uuid = require('node-uuid'),
	wrench = require('wrench'),
	log = require('./log'),
	crypto = require('crypto');

// module interface

exports.copyAndFilterEJS = copyAndFilterEJS;
exports.copyAndFilterString = copyAndFilterString;
exports.filterString = filterString;
exports.copyFileSync = copyFileSync;
exports.downloadResourceIfNecessary = downloadResourceIfNecessary;
exports.escapePaths = escapePaths;
exports.guid = guid;
exports.isDirectory = isDirectory;
exports.sha1 = sha1;
exports.writableHomeDirectory = writableHomeDirectory;
exports.renderTemplate = renderTemplate;
exports.writeIfDifferent = writeIfDifferent;

// implementation

const ignoreList = /\.(CVS|svn|git|DS_Store)$/;

function copyAndFilterEJS(from, to, obj) {
	obj = obj || {};
	if (!from || !to) {
		throw new TypeError('Bad arguments. from and to must be defined as strings.');
	}

	var content = fs.readFileSync(from).toString();
	writeIfDifferent(to, ejs.render(content, obj));
}

function copyAndFilterString(from, to, obj) {
	obj = obj || {};
	if (!from || !to) {
		throw new TypeError('Bad arguments. from and to must be defined as strings.');
	}
	var template = fs.readFileSync(from, 'utf8'),
		filtered = filterString(template, obj);
	writeIfDifferent(to, filtered);
}

function filterString(contents, obj) {
	Object.keys(obj).forEach(function(key) {
		var value = obj[key];
		contents = contents.replace(new RegExp(key, 'g'), value);
	});
	return contents;
}

/**
 * copy srcFile to destFile and optionally, filter based on function
 */
function copyFileSync(srcFile, destFile, filter) {
	if (!srcFile || !destFile) {
		throw new TypeError('Bad arguments. srcFile and destFile must be defined as strings.');
	}

	if (!ignoreList.test(srcFile)) {

		// if we have a filter and it passed or if we don't have one at all
		if (!filter || (typeof(filter)==='function' && filter(srcFile, destFile))) {

			// copy file
			var contents = fs.readFileSync(srcFile);
			fs.writeFileSync(destFile, contents);

			// set permissions to that of original file
			var stat = fs.lstatSync(srcFile);
			fs.chmodSync(destFile, stat.mode);

			log.debug('copying', srcFile.cyan, 'to', destFile.cyan);
		}
	}
}

function escapePaths(cmd) {
	cmd = cmd || '';
	if (!_.isString(cmd)) {
		throw new TypeError('Bad argument, must be a string');
	}
	return cmd.replace(/(["\s'$`\\])/g,'\\$1');
}

function guid() {
	return uuid.v4().toUpperCase();
}

/**
 * returns true if file path is a directory
 */
function isDirectory(file) {
	return fs.statSync(file).isDirectory();
}

/**
 * return the sha1 of the contents string
 */
function sha1(contents) {
	return crypto.createHash('sha1').update((contents || '').toString()).digest('hex');
}

/**
 * return a writeable home directory for hyperloop
 */
function writableHomeDirectory() {
	var dir;

	if (process.platform === 'darwin') {
		dir = path.join(process.env.HOME,'Library','Application Support','org.appcelerator.hyperloop');
	}
	else {
		dir = path.join(appc.fs.home(),'hyperloop');
	}
	if (!fs.exists(dir)) {
		wrench.mkdirSyncRecursive(dir);
	}
	return dir;
}

/**
 * download a pre-build third-party tool / library
 */
function downloadResourceIfNecessary(name, version, url, checksum, dir, callback) {

	if (!name || !version || !url || !checksum || !dir) {
		throw new TypeError('Bad argument. name, version, url, checksum, and dir are not optional and must be a defined');
	}

	var verFn = path.join(dir,name+'-version.txt'),
		zf = path.join(dir,name+'.zip'),
		zipdir = path.join(dir,name),
		localVersion = fs.existsSync(verFn) ? fs.readFileSync(verFn).toString() : null;

	if (version!==localVersion || !fs.existsSync(zipdir)) {
		var http = require('http'),
			urllib = require('url'),
			req = http.request(urllib.parse(url)),
			hash = crypto.createHash('sha1');

		if (!fs.existsSync(zipdir)) {
			wrench.mkdirSyncRecursive(zipdir);
		}

		req.on('response', function(res) {
			if (res.statusCode !== 200) {
				return callback(new Error("error loading url: "+url+", status: "+res.statusCode));
			}
			var len = parseInt(res.headers['content-length'], 10),
				stream = fs.createWriteStream(zf),
				bar;

			// workaround appc.progressbar's lack of a quiet option
			// TODO: send PR to node-appc to add quiet option to progressbar
			if (log.level !== 'quiet') {
				bar = new appc.progress('  Downloading '+name+' library'.magenta+' [:bar]'+' :percent :etas'.cyan, {
					complete: '=',
					incomplete: ' ',
					width: 50,
					total: len
				});
			} else {
				bar = { tick: function(){} };
			}

			bar.tick(0);

			res.on('data', function(chunk) {
				bar.tick(chunk.length);
				hash.update(chunk);
				stream.write(chunk, 'binary');
			});

			res.on('end', function() {
				fs.writeFileSync(verFn,version);
				stream.close();

				if (log.level !== 'quiet') {
					process.stdout.clearLine && process.stdout.clearLine();  // clear current text
					process.stdout.cursorTo && process.stdout.cursorTo(0);  // move cursor to beginning of line
					process.stdout.write('\n');
				}

				var checkChecksum = hash.digest('hex');
				if (checkChecksum!==checksum) {
					return callback(new Error("Invalid checksum ("+checkChecksum+") received, expected ("+checksum+") for "+url));
				}
				log.info('extracting zip contents');
				appc.zip.unzip(zf,zipdir,function(err){
					if (err) { return callback(err); }
					log.debug('unzip completed, contents should be in',zipdir);
					fs.unlink(zf,callback);
				});
			});
		});

		req.end();

	}
	else {
		callback();
	}
}

var templateCache = {};
function renderTemplate(name, args, dirname) {
	args = args || {};
	var template = templateCache[name];
	if (!template) {
		template = templateCache[name] = fs.readFileSync(path.join(dirname
			|| this.renderTemplateDirName
			|| __dirname, name)).toString();
	}
	args.renderTemplate = renderTemplate;
	args.renderTemplateDirName = dirname;
	var result = ejs.render(template, args);
	if (log.shouldLog('debug') && name.indexOf('.ejs') >= 0) {
		result = '/* START ' + name + ' */\n'
			+ result
			+ '\n/* END ' + name + ' */';
	}
	return result;
}

function writeIfDifferent(path, contents) {
	if (!fs.existsSync(path)) {
		fs.writeFileSync(path, contents);
		log.debug('created',path.white);
	}
	else if (fs.readFileSync(path, 'utf8') != contents) {
		fs.writeFileSync(path, contents);
		log.debug('modified',path.white);
	}
}