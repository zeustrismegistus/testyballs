//init dependencies
const chokidar = require('chokidar');
const fs = require('fs-extra');
const express = require('express');
const spawn = require('child_process');
const path = require('path');

/*
	this service:
		watches file system at %config.watchPath% for *.js files to be added.
			upon adding a file, it then packages that as a node service at the location %config.deployPath%/%filename%
			
		-has a sanity api at /sanity
		-shows running services at /services
		
*/

//load up default config
var config = JSON.parse(fs.readFileSync('package.json', 'utf8')).config;
/* 	"watchPath" : "./watching", 	//which folders to watch for files 
	"deployPath" : "./deploy",		//which root folder we will be deploying our bootstrapped services to
	"port" : 3000,					//the port this service runs on
	"deployPortStart" : 3001,		//the starting port bootstrapped services begin at 
	"debug" : true,					//whether to enable debugging in bootstrapped services
	"launchClientOnDeploy" : true 	//whether to load a browser client to test the service sanity
	
*/

config.watchPath = path.normalize(config.watchPath);
config.deployPath = path.normalize(config.deployPath);

//override with any provided command line args...node service.js port debug launchClientOnDeploy deployPortStart	
if(process.argv.length > 2)
	config.port = process.argv[2];

if(process.argv.length >3)
	config.debug = process.argv[3];

if(process.argv.length > 4)
	config.launchClientOnDeploy = process.argv[4];

if(process.argv.length > 5)
	config.deployPortStart = process.argv[5];
	
	
/*
	define behaviour to spin up a single node instance
	
	we could do this but we are spinning up the instances manually on their own fs, http://stackoverflow.com/questions/18862214/start-another-node-application-using-node-js
	
	we want a cmd window to see, and on a different process/stack entirely
*/
function NodeApp (/*expects full path to an existing js file*/ jsFile, port, debug, launchClientOnDeploy){
	
	//privates
	var __self = this;
	var __sourceFile = jsFile;
	var __fileName = path.basename(jsFile, '.js');
	var __sourceDir = path.dirname(jsFile);
	var __targetDir = config.deployPath + '/' + __fileName;
	var __isRunning = false;
	
	var __process = {service:null};
	var __config = {port:port, debug:debug, launchClientOnDeploy:launchClientOnDeploy};
	
	//publics
	Object.defineProperty(__self, "name", 
		{ 
			get : function() {return  __fileName;},
			enumerable: true,
			configurable: false
		}
	);
	Object.defineProperty(__self, "isRunning", 
		{ 
			get : function() {return  __isRunning;},
			enumerable: true,
			configurable: false
		}
	);
	
	this.init = function()
	{
		//create the target 
		fs.ensureDirSync(__targetDir);
		
		//clear the target
		fs.emptyDirSync(__targetDir);
		
		//copy node and associated boilerplate files to target
		var sourceFiles = ['node.exe','npm.cmd', 'node_modules', 'managementscripts'];
		
		sourceFiles.forEach
		((x,i,a)=>{
			
			fs.copySync(x, __targetDir + '/' + x);
		});
		
		//rename the source file to a standard "service.js" naming convention
		fs.copySync(__sourceFile, __targetDir + '/service.js');
		
		//handle package.json
		//if there's a package_{serviceFileName}.json file, copy it as package.json
		if(fs.existsSync(__sourceDir + '/package_' + __fileName + '.json'))
		{
			var packageJSON = fs.readFileSync(__sourceDir + '/package_' + __fileName + '.json', __targetDir + '/package.json', "utf8");
			
			//override with passed in params
			packageJSON.name = __fileName;
			packageJSON.config = __config;
			
			fs.writeFileSync(__targetDir + '/package.json'  , JSON.stringify(packageJSON));
			
		}
		else
		{
			//else create a blank one
			//write a generic package.json that inherits the parent services config
			var templatePackageJSON = {
			  "name": __fileName,
			  "version": "1.0.0",
			  "description": "",
			  "main": "service.js",
			  "scripts": {
				"start": "node service.js"
			  },
			  "author": "",
			  "license": "MIT",
			  "dependencies": {
				"express": "^4.13.4",
				"chokidar" : "latest"
			  },
			  "config": __config
			};
			fs.writeFileSync(__targetDir + '/package.json'  , JSON.stringify(templatePackageJSON));
		}	
		
		return this;
	};
	

	this.start =  function()
	{
		__isRunning = true;
		
		//spawn the service process
		var batchDir = __targetDir + '/managementscripts';

		if(__config.debug)
		{
			__process.service = spawn.spawn('cmd.exe', ['/c', 'startservice_withDebugging.bat'], {shell:true, cwd:batchDir} );
		}
		else
		{
			__process.service = spawn.spawn('cmd.exe', ['/c', 'startservice.bat'], {shell:true, cwd:batchDir} );
		}		
		
		__process.service.stdout.on('data', function (data) {
			console.log(__fileName + ' stdout: ' + data);
		});
		__process.service.stderr.on('data', function (data) {
			console.log(__fileName + ' stderr: ' + data);
		});
		__process.service.on('exit', function (code) {
			console.log(__fileName + ' child process exited with code ' + code);
			__isRunning = false;
		});
		
		//start the debugger
		if(__config.debug)
			this.startDebugger();
		
		//start the client		
		if(__config.launchClientOnDeploy)
			this.startClient();
		
		return this;
	};
	
	this.stop = function()
	{
		__isRunning = false;
		
		if(__process.service)
			__process.service.kill();
		
		this.stopDebugger();
		this.stopClient();
		
		return this;
	};
	
	//more granular methods
	this.startDebugger = function()
	{
		var batchDir = __targetDir + '/managementscripts';
		__process.nodeInspector = spawn.spawn('cmd.exe', ['/c', 'startNodeInspector.bat'], {shell:true, cwd:batchDir} );
		__process.nodeInspectorClient =  spawn.spawn('cmd.exe', ['/c', 'startNodeInspectorClient.bat' ], {shell:true, cwd:batchDir});	
		
		return this;
	};
	
	this.stopDebugger = function()
	{
		if(__process.nodeInspector)
			__process.nodeInspector.kill();
		
		if(__process.nodeInspectorClient)
			__process.nodeInspectorClient.kill();
		
		return this;
	};
	
	this.startClient = function()
	{
		var batchDir = __targetDir + '/managementscripts';
		__process.client = spawn.spawn('cmd.exe', ['/c', 'startclient.bat', __config.port], {shell:true, cwd:batchDir} );
		
		return this;
	};
	this.stopClient = function()
	{
		if(__process.client)
			__process.client.kill();
	
		return this;
	};
	
};

(function(){
	NodeApp.new = function(/*expects full path to an existing js file*/ jsFile, port, debug, launchClientOnDeploy)
	{
		return new NodeApp(jsFile, port, debug, launchClientOnDeploy);
	};
	
	Object.freeze(NodeApp);
})();

//watch the file systems specified
const AppManager = 
{
	nextPort : config.deployPortStart,
	apps : {},
	init : function(){
		
		fs.ensureDirSync(config.deployPath);
	},
	startApp : function(jsFile)
	{
		var port = this.nextPort = this.nextPort + 1; 
		var app = NodeApp.new(jsFile, port, config.debug, config.launchClientOnDeploy);
		app.init();
		app.start();
	},
	stopApp : function(jsFile)
	{
		var name = path.basename(jsFile, '.js')
		
		if(apps[name])
		{
			this.apps[name].stop();
			delete this.apps[name];
		}			
	},
	stopAllApps : function()
	{
		for(var m in this.apps)
			apps[m].stop();
		
		this.apps = {};
	},
	recycleApp : function(jsFile)
	{
		this.stopApp(jsFile);
		this.startApp(jsFile);
	}
};

(function(){

	Object.freeze(AppManager);
})();

//init the app tracking
AppManager.init();

//watch the file system
var watcher = chokidar.watch(config.watchPath, {ignoreInitial:false, ignored: /^\./, persistent: true});

watcher
.on('add', function(p) 
{
	if(path.extname(p) !== '.js')
		return;
	
	console.log('File', p, 'has been added'); 
	
	AppManager.startApp(p);
})
.on('change', function(p) 
{
	if(path.extname(p) !== '.js')
		return;
	
	console.log('File', p, 'has been changed');
	AppManager.recycleApp(p);
})
.on('unlink', function(p) 
{
	if(path.extname(p) !== '.js')
		return;
	
	console.log('File', p, 'has been removed');
	AppManager.stopApp(p);
})
.on('error', function(error) 
{
	console.error('Error happened', error);
});


//wire the service
var app = express();

//enable cors on the server
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

//wire pages
app.get('/sanity', function(req, res)
{
    res.send("greetings mortals");
});
app.get('/services', function(req, res)
{
    res.send(AppManager.apps.map(item=>item.name));
});

app.listen(config.port, function(){
    console.log('service.js up')
});

//launch any debuggers and clients if they've been specified		
/* var thisNodeApp = NodeApp.new('service.js', config.port, config.debug, config.launchClientOnDeploy);
if(config.debug)
	thisNodeApp.startDebugger();

if(config.launchClientOnDeploy)
	thisNodeApp.startClient(); */