var schedule = require('node-schedule');
var request = require('request');
var bunyan = require("bunyan");
var BunyanSlack = require('bunyan-slack'),
  slackLogger = bunyan.createLogger({
    name: "pulmuoneLogger",
    stream: new BunyanSlack({
      webhook_url: "https://hooks.slack.com/services/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",
      channel: "#monitoring",
      username: "에이디플로우알림이",
      customFormatter: function(record, levelName) {
        return {
          attachments: [{
            fallback: 'ADFMonitorNotification',
            "title": "ADFMonitor",
            color: 'danger',
            //pretext: "Optional text that appears above the attachment block",
            //author_name: "Seth Pollack",
            //author_link: "http://sethpollack.net",
            //author_icon: "http://www.gravatar.com/avatar/3f5ce68fb8b38a5e08e7abe9ac0a34f1?s=200",
            //title: "Slack API Documentation",
            //title_link: "https://api.slack.com/",
            //text: "Optional text that appears within the attachment",
            fields: [{
              title: "메시지",
              value: record.msg,
              short: false
            }]
          }]
        };
      }
    }),
    level: "error"
  });

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
    if (error) {
      slackLogger.error(error);
      return;
    }

    if (!error && response.statusCode == 200) {
      // Print out the response body
      console.log(body)
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

      // Configure the request
      var options = {
        uri: 'http://127.0.0.1:8080/v1/messages',
        method: 'POST',
        json: {
          "sender": "/test/topic/sender",
          "receiver": "users/nadir93/home/fishtank/temp",
          "content": "fishtank temp:" + data.field1 + '°C',
          "contentType": "application/base64",
          "qos": "2"
        },
        headers: headers,
      }

      // Start the request
      request(options, function(error, response, body) {
        if (error) {
          slackLogger.error(error);
          return;
        }
        if (!error && response.statusCode == 200) {
          // Print out the response body
          console.log(body)
        }
      })
    }
  })
});
