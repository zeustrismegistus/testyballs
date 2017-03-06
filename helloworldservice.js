//init dependencies
var fs = require('fs');
var express = require('express');

var config = JSON.parse(fs.readFileSync('package.json', 'utf8')).config;

//wire the service
var app = express();

//enable cors on the server
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

//wire sanity page
app.get('/sanity', function(req, res)
{
    res.send("greetings mortals");
});

//wire page to serve
app.get('/', function(req, res)
{
	res.send("hello world");
});

app.listen(config.port, function(){
    console.log('helloworldservice.js up')
});