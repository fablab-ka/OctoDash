'use strict';
var lockFile = require('lockfile');
var influx = require('influx');
var Client = require('node-rest-client').Client;

// config
var Config = require('./config.json');

// influx
var client = new influx.InfluxDB(Object.assign({}, Config.influx));

// rest
var rclient = new Client();

// use the same time for all updates in this run
var time = new Date();

function getPrinter(host,args,name){
	rclient.get('http://' + host + '/api/printer', args, function (data) {
		// Bed
		console.log(data);
		if(data != "Printer is not operational"){
			var tBed = {value: data.temperature.bed.actual, time: time};
			var tBedTarget = {value: data.temperature.bed.target, time: time};
			// Extruder
			var tEx = {value: data.temperature.tool0.actual, time: time};
			var tExTarget = {value: data.temperature.tool0.target, time: time};
			console.log(tBed);

			client.writeMeasurement(
				'temperature', [
					{
						fields: {
							t_bed: tBed.value,
							t_bed_target: tBedTarget.value,
							t_ex: tEx.value,
							t_ex_target: tExTarget.value
						},
						tags: { host: name },
					}
				]
			).catch(err => {
				console.error(`Error saving data to InfluxDB! ${err.stack}`)
			})
		}
	}).on('error', function (err) {
		console.log('something went wrong on the request', err.request.options);
	});
};

	// job status
function getJob(host, args,name ){
		rclient.get('http://' + host + '/api/job', args, function (data) {
		// Status
		console.log(data);
		if(data != "Printer is not operational"){
			var status = {value: data.state, time: time};
			client.writeMeasurement(
				'status', [
					{
						fields: {
							status: status.value
						},
						tags: { host: name },
					}
				]
			)

			// Only update the job status while the printer is printing
			if(data.state == "Printing" || data.state == "Paused") {
				// Progress
				var completion = {value: data.progress.completion, time: time};

				// Print Time
				var printTime = {value: data.progress.printTime, time: time};
				var printTimeLeft = {value: data.progress.printTimeLeft, time: time};

				client.writeMeasurement(
				'status', [
					{
						fields: {
							completion: completion.value,
							printTime: printTime.value,
							printTimeLeft: printTimeLeft.value,
						},
						tags: { host: name },
					}
				])
			}else{
				client.writeMeasurement(
				'status', [
					{
						fields: {
							completion: 0,
							printTime: 0,
							printTimeLeft: 0,
						},
						tags: { host: name },
					}
				])
			}
		}
	}).on('error', function (err) {
		console.log('something went wrong on the request', err.request.options);
	});
};

lockFile.lock('/tmp/octoStats.lock', function () {
	Config.octoprint.forEach(function(e) {
	  	getJob(e.host,{headers: {'X-Api-Key': e.apikey}},e.name);
		getPrinter(e.host,{headers: {'X-Api-Key': e.apikey}},e.name);
	});
	lockFile.unlock('/tmp/octoStats.lock', function () {
		console.log('failed to unlock');
	});
});
