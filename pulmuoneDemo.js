var schedule = require('node-schedule');
var http = require('http');
var querystring = require('querystring');

schedule.scheduleJob("*/5 * * * * *" /* 15분마다 */ , function() {
  //http://api.thingspeak.com/channels/27833/feed/last.json
  http.get("http://api.thingspeak.com/channels/27833/feed/last.json", function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      //{"created_at":"2015-09-01T14:42:26Z","entry_id":453709,"field1":"26.75"}
      var data = JSON.parse(body);
      console.log('temp:' + data.field1 + '°C');

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

      var postData = querystring.stringify({
        "sender": "/test/topic/sender",
        "receiver": "users/nadir93/home/fishtank/temp",
        "content": "fishtank temp:" + data.field1 + '°C',
        "contentType": "application/base64",
        "qos": "2"
      });

      var options = {
        hostname: 'http://112.223.76.75',
        port: 8080,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          "User-Agent": "My User Agent 1.0",
          "X-Application-Key": "98178cad8cbe5ff9ed2ea7e",
          "Content-Type": "application/json;charset=utf-8",
          'Content-Length': postData.length
        }
      };

      var req = http.request(options, function(response) {
        console.log('STATUS: ' + response.statusCode);
        console.log('HEADERS: ' + JSON.stringify(response.headers));
        response.setEncoding('utf8');
        response.on('data', function(chunk) {
          console.log('BODY: ' + chunk);
        });
      });

      req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
      });
      // write data to request body
      req.write(postData);
      req.end();
    });
  }).on('error', function(e) {
    console.log("Got error: " + e.message);
  });
});
