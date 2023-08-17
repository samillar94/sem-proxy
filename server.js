'use strict';

const express = require('express');

const PORT = 80;
const HOST = '0.0.0.0';

const params = [1,2,3,4,5];

const app = express();

app.get('/', (req,res) => {

  let r = {
    "error": false,
    "data": {}
  }

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

  console.log(r)

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(r);
});

app.listen(PORT, HOST);
console.log('Running on http://${HOST}:${PORT}');
