'use strict';

const http = require('http');
// const httpProxy = require('http-proxy');
const express = require('express'); 
const axios = require('axios'); 
const fs = require('fs');

const PORT = 80;
const HOST = '0.0.0.0';

const frontendURIs = [
  'http://localhost:8000', 
  'http://sem.40103709.qpc.hal.davecutting.uk'
]

const stackLimit = 3; /// recursion breaker

const inputs = require('./inputs.json');
let services = require('./serviceregistry.json');

const app = express();
// const proxy = httpProxy.createProxyServer({});

app.get('/', (req,res) => {

  req.stack = 1;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  buildEndpoint(req)
  .then(options => {
    console.log("\nRequest:\n"+options);
    callEndpoint(options)
    .then(resToFront => {
      console.log("\nResponse:\n"+resToFront);
      res.send(resToFront);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send({"error": true, "message": error.toString()});
    })
  })
  .catch(error => {
    console.error(error);
    res.status(500).send({"error": true, "message": error.toString()});
  })

});

app.get('/status', (req,res)=>{

  res.setHeader('Content-Type', 'application/json');

  const origin = req.headers.origin;

  if (frontendURIs.includes(origin)) {
    let data = {inputs, services}; /// TODO pare back to necessary
    data.error = false    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.send(data);
  } else {
    let data = {error: true, message: "Unauthorised origin."}
    res.status(404);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(data);
  }
});

app.post('/register', (req,res)=>{

  res.setHeader('Content-Type', 'application/json');

  const origin = req.headers.origin;
  const {name, open} = req.body;

  let found = false;
  let known = false;

  services.forEach(service => {
    if (service.name == name) {
      found = true;
      service.instances.forEach(instance => {
        if (instance.uri == origin) {
          known = true;
          instance.open = open;
        }
        console.log(name, origin, "service location refreshed")
      })
      if (!known) {
        service.instances.push({"uri": origin, "open": open})
        console.log(name, origin, "service location added")
      }
    }
  });

  if (found) {
    res.send({"success": true});
  } else {
    res.send({"success": false});
  }
  
  fs.writeFile('serviceregistry.json', services, err => {
    if (err) {
      console.error(err)
      return
    }
  })
  
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);


/// FUNCTIONS

function isRunningOnCloud(hostname) {

  const localPatterns = [
    /**
     * Generated by GPT-3.5
     */    
    /localhost$/, /// amended to include wsl.localhost
    /^127\.0\.0\.1$/,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^.*\.local$/,
    /^.*\.dev$/,
  ];

  let result = true; // It's running on the cloud

  for (const pattern of localPatterns) {
    /**
     * Generated by GPT-3.5
     */     
    if (pattern.test(hostname)) {
      result = false;
      break; // It's running locally
    }
  }

return result }

/**
 * Parses a service request, producing an options object compatible with nodejs http module
 * @param {*} req 
 * @returns options = { hostname, path, method }
 */
async function buildEndpoint(req) {

  /// Get requested service details from registry
  let service = services.filter(serviceReg => serviceReg.name == req.query.service)[0];
  let serviceURI = `http://${service.bridgeIP}:80`;
  /// e.g. 172.17.0.7 for sort

  /// Find open service to use or throw error
  if (isRunningOnCloud(req.hostname)) {
    if (service.instances) {
      let openInstances = service.instances.filter(instance => instance.open)
      if (openInstances.length > 0) {
        let index = Math.floor(Math.random() * openInstances.length)
        serviceURI = openInstances[index]['uri'];
      } else {
        throw new Error("No open instances available")
      }
    } else {
      throw new Error("No instances available")
    }
  }

  /// Start building endpoint query
  let ep = '?';

  /// Handle dependencies
  if (service.needs.services && req.stack <= stackLimit) {

    let needReq = { ...req }; /// spread-clone
    needReq.query.service = service.needs.services[needReq.stack-1];
    needReq.stack++; /// recursion tracker

    let needRes = await callEndpoint(await buildEndpoint(needReq));

    console.log("Fetched prerequisite service response")
    
    if (service.needs.services.includes('sort')) {
      for (let id = 1; id <= needRes.data.sorted_attendances.length; id++) {
        let index = id - 1;
        let { item, attendance, unit } = needRes.data.sorted_attendances[index];
        ep += `sorted_item_${id}=${item}&sorted_attendance_${id}=${attendance}&sorted_unit_${id}=${unit}&`
      }
    }

    if (service.needs.services.includes('score')) {
        ep += `score=${needRes.data.score}&`
    }

  } 

  if (service.needs.items) {
    inputs.components.forEach(component => {
      ep += `item_${component.id}=${component.item}&`
    });
  }

  if (service.needs.attendances) {
    inputs.components.forEach(component => {
      ep += `attendance_${component.id}=${req.query['a'+component.id]}&`
    });
  }

  if (service.needs.availabilities) {
    inputs.components.forEach(component => {
      ep += `availability_${component.id}=${component.availability}&`
    });
  }

  if (service.needs.units) {
    inputs.components.forEach(component => {
      ep += `unit_${component.id}=${component.unit}&`
    });
  }

  if (service.needs.weights) {
    inputs.components.forEach(component => {
      ep += `weight_${component.id}=${component.weight}&`
    });
  }

  if (service.needs.cutoff) {
    ep += `cutoff=${req.query['c']}&`
  }

  /// Set options (compatible with HTTP module)
  let options = {
    servicename: service.name,
    hostname: serviceURI,
    path: ep,
    method: 'GET'
  }

return options }

async function callEndpoint(options) {

  let resToFront = {
    "error": true
  };

  await axios.get(options.hostname+options.path)
  .then(results => {
    if (results.data.error) {
      resToFront.message = results.data.message;
    } else {
      resToFront = results.data;
    }
  })
  .catch(error => {
    resToFront.message = error;
  })

return resToFront }