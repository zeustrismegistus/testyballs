#! /usr/bin/env node
/* this script starts the node service and any additional services that package.json configuration indicates.
	it is located at \bin\go.js

	.config{
		
    "port": 3000,
    "runDebugEnabled" : true, 
	"runDebuggerService" : true, 
	"runDebuggerClient" : true, 
	"runClient" : true,
	}

	within package.json we wire this start.js script to npm.  see http://blog.npmjs.org/post/118810260230/building-a-simple-command-line-tool-with-npm
	
	"bin":{
		"startAll" : "./managementscripts/start.js"
	},
	
	to register this command run, npm link
*/


var shell = require("shelljs");
var fs = require("fs");

//shell.cd(".."); //we're at /bin/go.js..so go back to the root folder

var config = JSON.parse(fs.readFileSync('package.json', 'utf8')).config;
if(!config)
	throw 'invalid config';

if(config.runDebugEnabled)
	shell.exec("node --debug-brk service.js", {shell:true});
else
	shell.exec("node service.js", {shell:true});

if(config.runDebuggerService)
	shell.exec("node ./node_modules/node-inspector/bin/inspector.js", {shell:true});

if(config.runDebuggerClient)
	shell.exec("start chrome http://127.0.0.1:8080/?port=5858", {shell:true});

if(config.runClient)
	shell.exec("start chrome http://localhost:" + config.port + "/", {shell:true});

	
