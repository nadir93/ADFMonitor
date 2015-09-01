var schedule = require('node-schedule');
var request = require('request');
var querystring = require('querystring');

schedule.scheduleJob("*/5 * * * * *" /* 15분마다 */ , function() {

  // Set the headers
  var headers = {
    'User-Agent': 'Super Agent/0.0.1',
    'X-Application-Key': '98178cad8cbe5ff9ed2ea7e',
    'Content-Type': 'application/json;charset=utf-8',
  }

  // Configure the request
  var options = {
    url: 'http://api.thingspeak.com/channels/27833/feed/last.json',
    method: 'GET',
    headers: headers,
  }

  // Start the request
  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      // Print out the response body
      console.log(body)
      console.log('temp:' + body.field1 + '°C');

      //header
      // {
      //   "User-Agent": "My User Agent 1.0",
      //   "X-Application-Key": "98178cad8cbe5ff9ed2ea7e",
      //   "Content-Type": "application/json;charset=utf-8",
      //   "Content-Length": 179
      // }

      // {
      //   "sender": "/test/topic/sender",
      //   "receiver": "mms/01040269329",
      //   "content": "테스트 입니다",
      //   "contentType": "application/base64",
      //   "qos": "2"
      // }

      // Configure the request
      var options = {
        url: '112.223.76.75',
        port: 8080,
        method: 'POST',
        json: {
          "sender": "/test/topic/sender",
          "receiver": "users/nadir93/home/fishtank/temp",
          "content": "fishtank temp:" + body.field1 + '°C',
          "contentType": "application/base64",
          "qos": "2"
        },
        headers: headers,
      }

      // Start the request
      request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
          // Print out the response body
          console.log(body)
        }
      })
    }
  })
});
