var util = require('util');
var schedule = require('node-schedule');
var elasticsearch = require('elasticsearch');
var Message = require('./message');
var Slack = require('slack-client');
var config = require('config');
var LogClass = require('./log_to_bunyan');
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
  host: process.env.HOST || config.get('elasticsearch.host'),
  log: LogClass
    //'trace'
});
var logger = new LogClass({
  logName: 'Notifier',
  level: 'info'
});
var autoMark, autoReconnect, slack, token;
token = process.env.TOKEN || config.get('slack.token');
autoReconnect = true;
autoMark = true;
slack = new Slack(token, autoReconnect, autoMark);

slack.on('open', function() {
  var channel, channels, group, groups, id, messages, unreads;
  channels = [];
  groups = [];
  unreads = slack.getUnreadCount();
  channels = (function() {
    var ref, results;
    ref = slack.channels;
    //console.log('channel='+util.inspect(ref));
    results = [];
    for (id in ref) {
      channel = ref[id];
      if (channel.is_member) {
        results.push("#" + channel.name);
      }
    }
    return results;
  })();
  groups = (function() {
    var ref, results;
    ref = slack.groups;
    results = [];
    for (id in ref) {
      group = ref[id];
      if (group.is_open && !group.is_archived) {
        results.push(group.name);
      }
    }
    return results;
  })();
  logger.info("Welcome to Slack. You are @" + slack.self.name + " of " + slack.team.name);
  logger.info('You are in: ' + channels.join(', '));
  logger.info('As well as: ' + groups.join(', '));
  messages = unreads === 1 ? 'message' : 'messages';
  return logger.info("You have " + unreads + " unread " + messages);
});

slack.on('message', function(message) {
  var channel, channelError, channelName, errors, response, text, textError, ts, type, typeError, user, userName;
  logger.info('message.channel=' + message.channel);
  channel = slack.getChannelGroupOrDMByID(message.channel);
  //console.log('channel='+util.inspect(channel));
  user = slack.getUserByID(message.user);
  response = '';
  type = message.type, ts = message.ts, text = message.text;
  channelName = (channel != null ? channel.is_channel : void 0) ? '#' : '';
  channelName = channelName + (channel ? channel.name : 'UNKNOWN_CHANNEL');
  userName = (user != null ? user.name : void 0) != null ? "@" + user.name : "UNKNOWN_USER";
  logger.info("Received: " + type + " " + channelName + " " + userName + " " + ts + " \"" + text + "\"");
  if (type === 'message' && (text != null) && (channel != null)) {
    //response = text.split('').reverse().join('');
    //channel.send(response);
    return logger.info("@" + slack.self.name + " responded with \"" + response + "\"");
  } else {
    typeError = type !== 'message' ? "unexpected type " + type + "." : null;
    textError = text == null ? 'text was undefined.' : null;
    channelError = channel == null ? 'channel was undefined.' : null;
    errors = [typeError, textError, channelError].filter(function(element) {
      return element !== null;
    }).join(' ');
    return logger.info("@" + slack.self.name + " could not respond. " + errors);
  }
});

slack.on('error', function(error) {
  return logger.error("Error: " + util.inspect(error));
});
slack.login();

// index용 날짜 포맷
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  return yyyy + '.' + (mm[1] ? mm : "0" + mm[0]) + '.' + (dd[1] ? dd : "0" + dd[0]); // padding
};

schedule.scheduleJob(config.get('alert.schedule') /* 30초마다 */ , function() {
  //console.log('The answer to life, the universe, and everything!'+new Date());
  client.search({
    index: 'alert-*',
    //type: 'tweets',
    body: config.get('alert.query')
  }).then(function(resp) {
      logger.info({
        elapsedtime: resp.took,
        unit: 'ms'
      }, '알람점검이완료되었습니다');
      var hosts = resp.aggregations.host.buckets;
      for (hostId in hosts) {
        logger.debug('호스트=' + hosts[hostId].key);
        var types = hosts[hostId].type.buckets;
        for (typesId in types) {
          logger.debug('타입=' + hosts[hostId].key + ':' + types[typesId].key);
          var alarm = true;
          var grade;
          var value;
          var grades = types[typesId].grade.buckets;
          var timestamp;
          for (gradeId in grades) {
            logger.debug('중요도=' + hosts[hostId].key + ':' + types[typesId].key + ':' + grades[gradeId].key);
            grade = grades[gradeId].key;
            var status = grades[gradeId].status.buckets;
            for (statusId in status) {
              logger.debug('상태=' + hosts[hostId].key + ':' + types[typesId].key + ':' + grades[gradeId].key + ':' + status[statusId].key);
              var hits = status[statusId].top_tag_hits.hits.hits[0];
              logger.debug('hits=' + util.inspect(hits));
              value = hits._source.value;
              timestamp = hits._source.timestamp;
              if (hits && status[statusId].key == 'notified') {
                alarm = false;
              }
            }
          }
          //send alarm
          if (alarm) {
            notify(hosts[hostId].key, types[typesId].key, grade, value, timestamp);
          }
        }
      }
    },
    function(err) {
      logger.trace(err.message);
    });
});

function notify(host, type, grade, value, timestamp) {
  //send slack
  var chl = slack.getChannelGroupOrDMByID(process.env.CHANNEL || config.get('slack.channel'));
  logger.info(chl.name, 'slackChannel');
  if (chl) {
    var msg = new Message(slack, {
      username: '에이디플로우알림이',
      attachments: [{
        "fallback": host + ' ' + ((type == 'cpu' || type == 'memory') ? type + '사용량' : type) + value,
        //"pretext": resp.aggregations.host.buckets[0].key,
        "title": host,
        "fields": [{
            "title": (type == 'cpu' || type == 'memory') ? type + '사용량' : type,
            "value": value,
            "short": true
          }, {
            "title": "중요도",
            "value": grade == 'danger' ? '위험' : '경고',
            "short": true
          }
          //, {
          //  "title": "시간",
          //  "value": timestamp, //todo gmt 시간으로 변경해야함
          //  "short": false
          //}
        ],
        "color": grade
      }]
    });
    chl.postMessage(msg);
    logger.info(response, '알람이전송되었습니다');
    //create notified record
    var d = new Date();
    client.create({
      index: 'alert-' + d.yyyymmdd(),
      type: type,
      // id: '1',
      body: {
        host: host,
        type: type,
        timestamp: d,
        grade: grade,
        status: 'notified'
      }
    }, function(error, response) {
      if (error) {
        logger.trace(error.message);
        // Alert slack
      } else {
        logger.info(response, '알람전송이기록되었습니다');
      }
    });
  }
}
