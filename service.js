//init dependencies
const chokidar = require('chokidar');
const fs = require('fs-extra');
const express = require('express');
const spawn = require('child_process');
const path = require('path');
const shell = require("shelljs");

/*
	this service:
		watches file system at %config.watchPath% for *.js files to be added.
			upon adding a file, it then packages that as a node service at the location %config.deployPath%/%filename%
			
		-has a sanity api at /sanity
		-shows running services at /services
		
*/

//load up default config
var serviceConfig = JSON.parse(fs.readFileSync('package.json', 'utf8')).config;
/*
	"watchPath": "./watching",
    "spawnPath": "./deploy",
    "port": 3000,				//boilerplate
    "spawnPortStart": 3001,
	"runDebugEnabled" : true, 	//boilerplate
	"runDebuggerService" : true,//boilerplate 
	"runDebuggerClient" : true, //boilerplate
	"runClient" : true,			//boilerplate
	"spawnDebugEnabled" : true, 
	"spawnDebuggerService" : true, 
	"spawnDebuggerClient" : true, 
	"spawnClient" : true

*/

serviceConfig.watchPath = path.normalize(serviceConfig.watchPath);
serviceConfig.spawnPath = path.normalize(serviceConfig.spawnPath);

//override with any provided command line args...node service.js port runDebugEnabled runDebuggerService runDebuggerClient runClient	
if(process.argv.length > 2)
	serviceConfig.port = process.argv[2];

if(process.argv.length >3)
	serviceConfig.runDebugEnabled = process.argv[3];

if(process.argv.length > 4)
	serviceConfig.runDebuggerService = process.argv[4];

if(process.argv.length > 5)
	serviceConfig.runDebuggerClient = process.argv[5];
	
if(process.argv.length > 5)
	serviceConfig.runClient = process.argv[6];

/*
	define behaviour to spin up a single node instance
	
	we could do this but we are spinning up the instances manually on their own fs, http://stackoverflow.com/questions/18862214/start-another-node-application-using-node-js
	
	we want a cmd window to see, and on a different process/stack entirely
*/
function NodeApp (/*expects full path to an existing js file*/ jsFile, config){
	
	//privates
	var __self = this;
	var __sourceFile = jsFile;
	var __sourceDir = path.dirname(jsFile);
	var __name = path.basename(jsFile, '.js');
	var __targetDir = serviceConfig.spawnPath + '/' + __name; //name the target directory after the source file name 
	var __targetFile = __targetDir + '/service.js';//rename the source file to a standard "service.js" naming convention
	var __sourceConfigOverrideFile = __sourceDir + '/package_' + __name + '.json';
	var __targetConfigFile = __targetDir + '/package.json';
	var __isRunning = false;
	var __process = {}; //container of our process instances
	var __config = config;
	
	//publics
	Object.defineProperty(__self, "name", 
		{ 
			get : function() {return  __name;},
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
	Object.defineProperty(__self, "config", 
		{ 
			get : function() {return  __config;},
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
		var sourceFiles = ['node.exe','npm.cmd', 'node_modules'];
		sourceFiles.forEach
		((x,i,a)=>{
			
			fs.copySync(x, __targetDir + '/' + x);
		});
		fs.copySync(__sourceFile, __targetFile);
		
		//if we have an override config file, copy that over otherwise create a blank one
		if(fs.existsSync(__sourceConfigOverrideFile))
		{
			fs.copySync(__sourceConfigOverrideFile, __targetConfigFile);
		}
		else
		{
			//else create a blank one
			//write a generic package.json that inherits the parent services config
			var packageJSON = {
			  "name": __name,
			  "version": "1.0.0",
			  "description": "",
			  "main": "service.js",
			  "scripts": {
				"start": "node service.js"
			  },
			  "bin":{
				"go" : "bin/go.js"
			  },
			  "author": "",
			  "license": "MIT",
			  "dependencies": {},
			  "config": __config
			};
			fs.writeFileSync(__targetConfigFile  , JSON.stringify(packageJSON));
		}	
		
		//write some standard batch files to facilitate local testing
		fs.ensureDirSync(__targetDir + '/scripts');
		fs.writeFileSync(__targetDir + '/scripts/startservice.bat', ['cd ..','node service.js', 'pause'].join("\r\n"));
		fs.writeFileSync(__targetDir + '/scripts/startservice_withDebugging.bat', ['cd ..', 'node service.js --debug-brk --debug==' + __config.debugPort , 'pause'].join("\r\n"));
		fs.writeFileSync(__targetDir + '/scripts/startNodeInspector.bat', ["cd ..\\node_modules\\node-inspector", 
		"..\\..\\node ./bin/inspector.js",  'pause'].join("\r\n"));
		fs.writeFileSync(__targetDir + '/scripts/startNodeInspectorClient.bat', ['start chrome http://127.0.0.1:8080/?port=' + __config.debugPort, 'exit'].join("\r\n"));
		fs.writeFileSync(__targetDir + '/scripts/startClient.bat', ['start chrome http://localhost:' + __config.port + '/', 'exit'].join("\r\n"));
		return this;
	};
	

	this.start =  function()
	{
		__isRunning = true;
		//shell.cd(__targetDir);
		
		var scriptsDir = path.join(__targetDir, 'scripts');
		
		//start the debugger
		if(__config.runDebuggerService)
		{
			console.log("node inspector starting");
			 __process.debuggerService = spawn.spawn('cmd.exe', ['/c', 'startNodeInspector.bat'], {shell:true, cwd:scriptsDir, detached:true} );
		
			//__process.debuggerService = shell.exec("node ./node_modules/node-inspector/bin/inspector.js", {shell:true, cwd:__targetDir, detached:true} ); 
		}	
		
		if(__config.runDebugEnabled)
		{
			console.log("service starting with debugging");
			//__process.service = shell.exec("node --debug-brk service.js", {shell:true, cwd:__targetDir});
			 __process.service = spawn.spawn('cmd.exe', ['/c', 'startservice_withDebugging.bat'], {shell:true, cwd: scriptsDir , detached:true} );
			 //__process.service = spawn.spawn('cmd.exe', ['/c', 'node --debug-brk service.js'], {shell:true, cwd:__targetDir, detached:true} );
		}
		else
		{
			console.log("service starting");
			//__process.service = shell.exec("node service.js", {shell:true, cwd:__targetDir} );
			 __process.service = spawn.spawn('cmd.exe', ['/c', 'startservice.bat'], {shell:true, cwd:scriptsDir, detached:true} );
			// __process.service = spawn.spawn('cmd.exe', ['/c', 'node service.js'], {shell:true, cwd:__targetDir, detached:true} );
		}		
		
		__process.service.stdout.on('data', function (data) {
			console.log(__name + ' stdout: ' + data);
		});
		__process.service.stderr.on('data', function (data) {
			console.log(__name + ' stderr: ' + data);
		});
		__process.service.on('exit', function (code) {
			console.log(__name + ' child process exited with code ' + code);
			__isRunning = false;
		});
		

		
		if(__config.runDebuggerClient)
		{	
			console.log("debugger client starting");
			 __process.debuggerClient = spawn.spawn('cmd.exe', ['/c', 'startNodeInspectorClient.bat'], {shell:true, cwd:scriptsDir, detached:true} );
			//__process.debuggerClient = shell.exec("start chrome http://127.0.0.1:8080/?port=5858", {shell:true, cwd:__targetDir, detached:true}); 
		}	
		
		if(__config.runClient)
		{
			console.log("client starting");
			__process.client = spawn.spawn('cmd.exe', ['/c', 'startClient.bat'], {shell:true, cwd:scriptsDir, detached:true} 	);
			//__process.client = shell.exec("start chrome http://localhost:" + __config.port + "/", {shell:true, cwd:__targetDir, detached:true});
		}		
		
		return this;
	};
	
	this.stop = function()
	{
		__isRunning = false;
		
		if(__process.service)
			__process.service.kill();
		
		if(__process.debuggerService)
			__process.debuggerService.kill();
		
		if(__process.debuggerClient)
			__process.debuggerClient.kill();
		
		if(__process.client)
			__process.client.kill();
		
		__process = {};
		
		return this;
	};
	

	
};

(function(){
	NodeApp.new = function(/*expects full path to an existing js file*/ jsFile, config)
	{
		return new NodeApp(jsFile, config);
	};
	
	Object.freeze(NodeApp);
})();

//watch the file systems specified
const AppManager = 
{
	
	nextPort : serviceConfig.spawnPortStart,
	nextDebugPort : serviceConfig.spawnDebugPortStart,
	apps : {},
	init : function(){
		
		fs.ensureDirSync(serviceConfig.spawnPath);
	},
	startApp : function(jsFile)
	{
		var port = this.nextPort = this.nextPort + 1; 
		var debugPort = this.nextDebugPort = this.nextDebugPort + 1;

		//if we already have a debugger on we don't want another to spin up
		var isDebuggerOn = ()=>{
			for(var p in this.apps)
				if(apps[p].config.runDebuggerService)
					return true;
		}();
		
		var isDebuggerOnIndicated = isDebuggerOn == false && serviceConfig.spawnDebuggerService;
	
		//generate the config
		var spawnConfig = {};
		spawnConfig.port = port;
		spawnConfig.debugPort = debugPort;
		spawnConfig.runDebugEnabled = serviceConfig.spawnDebugEnabled;
		spawnConfig.runDebuggerService = isDebuggerOnIndicated;
		spawnConfig.runDebuggerClient = serviceConfig.spawnDebuggerClient;
		spawnConfig.runClient = serviceConfig.spawnClient;

		var app = NodeApp.new(jsFile, spawnConfig);
		app.init();
		this.apps[app.name] = app;//add app to list
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
var watcher = chokidar.watch(serviceConfig.watchPath, {ignoreInitial:false, ignored: /^\./, persistent: true});

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

app.listen(serviceConfig.port, function(){
    console.log('service.js up')
});

//launch any debuggers and clients if they've been specified		
/* var thisNodeApp = NodeApp.new('service.js', config.port, config.debug, config.launchClientOnDeploy);
if(config.debug)
	thisNodeApp.startDebugger();

if(config.launchClientOnDeploy)
	thisNodeApp.startClient(); */