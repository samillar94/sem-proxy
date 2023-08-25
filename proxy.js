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

const stackLimit = 2; /// recursion breaker

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
    console.log(options);
    callEndpoint(options)
    .then(resToFront => {
      console.log(resToFront);
      res.send(resToFront);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send({"Service error": error});
    })
  })
  .catch(error => {
    console.error(error);
    res.status(500).send({"Proxy error": error});
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
  const {name, healthy} = req.body;

  let found = false;
  let known = false;

  services.forEach(service => {
    if (service.name == name) {
      found = true;
      service.instances.forEach(instance => {
        if (instance.uri == origin) {
          known = true;
          instance.healthy = healthy;
        }
      })
      if (!known) {
        service.instances.push({"uri": origin, "healthy": healthy})
      }
    }
  });

  if (found) {
    res.send({"success": true});
  } else {
    res.send({"success": false});
  }

  console.log("Services:\n",services);
  
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

function getRandomIndex(arrayLength) {
  let index = -1
  if (arrayLength > 0 && parseInt(arrayLength)!=NaN) {
    index = Math.floor(Math.random() * arrayLength)
  }
return index }

/**
 * Parses a service request, producing an options object compatible with nodejs http module
 * @param {*} req 
 * @returns options = { hostname, path, method }
 */
async function buildEndpoint(req) {

  /// Get requested service details from registry
  let service = services.filter(serviceReg => serviceReg.name === req.query.service)[0];

  let serviceURI = `http://${service.bridgeIP}:80`;
  /// e.g. 172.17.0.7 for sort

  /// Find healthy service to use or throw error
  if (isRunningOnCloud(req.hostname)) {
    if (service['instances']) {
      console.log(service)
      /// TODO 
      let healthyInstances = service[instances].filter(instance => {instance.healthy})
      console.log(healthyInstances)
      if (healthyInstances.length > 0) {
        let index = Math.floor(Math.random() * healthyInstances.length)
        serviceURI = healthyInstances[index]['uri'];
      } else {
        throw new Error("No healthy instances available")
      }
    } else {
      throw new Error("No instances available")
    }
  }

  /// Start building endpoint query
  let ep = '/?';

  /// Handle dependencies
  if (service.needs.services && req.stack <= stackLimit) {

    let needReq = { ...req }; /// spread clone
    needReq.query.service = service.needs.services[needReq.stack-1];
    needReq.stack++; /// recursion breaker

    let needRes = await callEndpoint(await buildEndpoint(needReq));
    
    if (service.needs.services.includes('sort')) {
      for (id = 1; id <= needRes.sorted_attendance.length; id++) {
        let index = id - 1;
        let { item, attendance } = needRes.sorted_attendance[index];
        ep += `sorted_item_${id}=${item}&sorted_attendance_${id}=${attendance}&`
      }
    }

    if (service.needs.services.includes('score')) {
        ep += `score=${needRes.score}&`
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
    console.log("Service responded")
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