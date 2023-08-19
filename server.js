'use strict';

const express = require('express');
const fs = require('fs');

const PORT = 80;
const HOST = '0.0.0.0';

const frontendURIs = [
  'http://localhost:8000', 
  'http://sem.40103709.qpc.hal.davecutting.uk'
]


const params = [1,2,3,4,5];
const inputs = require('./inputs.json');
const services = require('./serviceregistry.json');
const proxies = require('./proxyregistry.json');

const app = express();

app.get('/', (req,res) => {

  let r = {
    "error": false,
    "data": {}
  };

  let service = req.query['service'];

  params.forEach(id => {
    let att = req.query['attendance_'+id];
    r.data[req.query['item_'+id]] = att;
  });

  // let xhttp = new XMLHttpRequest();
  // xhttp.onreadystatechange = function () {
  //   console.log(this.readyState);
  //   if (this.readyState == 4 && this.status == 200) {
  //     //let response = this.response
  //     var j = JSON.parse(this.response);
  //     if (j.error) {
  //       displayError("maxmin", j.message);
  //     } else {
  //       let max_attendance = j.max_item;
  //       let min_attendance = j.min_item;
  //       displayMaxMin(max_attendance, min_attendance);
  //     }
  //   } else if (this.readyState == 4 && this.status != 200) {
  //     displayError("maxmin", "the service did not respond");
  //   }
  // };
  // xhttp.open("GET", querystring);
  // xhttp.send();

  console.log(r);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(r);
});

app.get('/status', (req,res)=>{

  res.setHeader('Content-Type', 'application/json');

  const origin = req.headers.origin;

  if (frontendURIs.includes(origin)) {
    let data = {inputs, services, proxies}; /// TODO save proxies in frontend
    data.error = false    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.send(data);
  } else {
    r = {error: true, message: "Unauthorised origin."}
    res.status(404);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(r);
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
      found = true
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
    res.send({"success": true, "proxyregistry": proxies});
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
