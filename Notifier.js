var util = require('util');
var oracledb = require('oracledb');
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
var bunyan = require("bunyan"),
  logger = new LogClass({
    logName: 'Notifier',
    level: config.get('bunyan.level')
  });

var BunyanSlack = require('bunyan-slack'),
  slackLogger = bunyan.createLogger({
    name: "Notifier",
    stream: new BunyanSlack({
      webhook_url: process.env.webhook_url || config.get('slack.webhook_url'),
      channel: process.env.webhook_channel || config.get('slack.webhook_channel'),
      username: "에이디플로우알림이",
      customFormatter: function(record, levelName) {
        return {
          attachments: [{
            fallback: 'Notifier(' + process.env.HOST + ')',
            "title": 'Notifier(' + process.env.HOST + ')',
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
slackLogger.error("Notifier가시작되었습니다");


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
  return slackLogger.error("Error: " + util.inspect(error));
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
        수행시간: resp.took + 'ms',
        검색된문서수: resp.hits.total
      }, '알람점검이완료되었습니다');
      if (resp.hits.total == 0) {
        return;
      }
      var hosts = resp.aggregations.host.buckets;
      for (hostId in hosts) {
        logger.debug('호스트=' + hosts[hostId].key);
        var types = hosts[hostId].type.buckets;
        for (typesId in types) {
          logger.debug('타입=' + hosts[hostId].key + ':' + types[typesId].key);
          var typeInstances = types[typesId].typeInstance.buckets;
          for (typeInstanceId in typeInstances) {
            logger.debug('타입인스턴스=' + hosts[hostId].key + ':' + types[typesId].key + ':' + typeInstances[typeInstanceId].key);
            var alarm = true;
            var grade;
            var value;
            var grades = typeInstances[typeInstanceId].grade.buckets;
            var timestamp;
            for (gradeId in grades) {
              logger.debug('중요도=' + hosts[hostId].key + ':' + types[typesId].key + ':' + typeInstances[typeInstanceId].key + ':' + grades[gradeId].key);
              grade = grades[gradeId].key;
              var status = grades[gradeId].status.buckets;
              for (statusId in status) {
                logger.debug('상태=' + hosts[hostId].key + ':' + types[typesId].key + ':' + typeInstances[typeInstanceId].key + ':' + grades[gradeId].key + ':' + status[statusId].key);
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
              notify(hosts[hostId].key, types[typesId].key, typeInstances[typeInstanceId].key, grade, value, timestamp);
            }
          }
        }
      }
    },
    function(err) {
      logger.trace(err.message);
    });
});

function sendSMS(host, type, typeInstance, grade, value, timestamp) {
  oracledb.getConnection({
      user: process.env.user,
      password: process.env.password,
      connectString: process.env.connString,
    },
    function(err, connection) {
      if (err) {
        slackLogger.error(err.message);
        return;
      }
      var message;

      switch (type) {
        case 'offline':
          message = '[' + host + '] ADFMonitoring Agent가 Offline 상태입니다.';
          break;
        case 'cpu':
          message = '[' + host + '] CPU사용률(' + value + ')이 높습니다.';
          break;
        case 'memory':
          message = '[' + host + '] 가상메모리사용률(' + value + ')이 높습니다.';
          break;
        case 'df':
          message = '[' + host + '] ' + typeInstance + ' 파일시스템의 사용된 공간백분율(' + value + ')이 높습니다.';
          break;
        case 'process':
          message = '[' + host + '] ' + typeInstance + ' 프로세스가 kill되었거나 존재하지 않습니다.';
          break;
      }

      var receivers = []; //'01040269329';
      var users = config.get('users')

      for (userID in users) {
        var alerts = users[userID].alert;
        logger.info({
          phone: users[userID].phone,
          alert: users[userID].alert
        }, users[userID].name);
        for (alertID in alerts) {
          if (!alerts[alertID].host) {
            if (alerts[alertID] === 'all') {
              logger.info({
                host: 'all',
                type: 'all',
                receiver: users[userID].name,
                phone: users[userID].phone
              }, '전송리스트추가');
              receivers.push(users[userID].phone);
            }
          } else {
            if (alerts[alertID].host === host) {
              var types = alerts[alertID].type;
              for (typeID in types) {
                if (types[typeID] === 'all') {
                  logger.info({
                    host: host,
                    type: 'all',
                    receiver: users[userID].name,
                    phone: users[userID].phone
                  }, '전송리스트추가');
                  receivers.push(users[userID].phone);
                } else if (types[typeID] === type) {
                  logger.info({
                    host: host,
                    type: type,
                    receiver: users[userID].name,
                    phone: users[userID].phone
                  }, '전송리스트추가');
                  receivers.push(users[userID].phone);
                }
              }
            }
          }
        }
      }

      logger.info({
        receivers: receivers
      }, 'SMS전송리스트');

      var sendDate;
      var d = new Date();
      var n = d.getHours();
      logger.info("현재시간:" + n);
      if (n < 7) {
        sendDate = " to_date(to_char(sysdate, 'yyyymmdd') || '070100', 'YYYYMMDDHH24MISS') ";
      } else if (n >= 23) {
        sendDate = " to_date(to_char(sysdate + 1, 'yyyymmdd') || '070100', 'YYYYMMDDHH24MISS') ";
      } else {
        sendDate = " sysdate ";
      }
      var sender = '024504079';

      for (receiverID in receivers) {
        connection.execute("insert into sms (sm_number, sm_indate, sm_sdmbno, sm_rvmbno, sm_msg, sm_code1, sm_code2) values (sms_seq.nextval," + sendDate + ", :receiver, :sender, :msg, :code1, :code2)", [receivers[receiverID], sender, message, 'tivoli', 'tivoli'], // Bind values
          {
            autoCommit: true
          }, // Override the default non-autocommit behavior
          function(err, result) {
            if (err) {
              slackLogger.error(err.message);
              return;
            }
            logger.info({
              '입력레코드수': result.rowsAffected
            });
            if (result.rowsAffected === 1) {
              logger.info({
                receiver: receivers[receiverID],
                sender: sender,
                message: message
              }, 'SMS전송완료');
              //create notified record
              var d = new Date();
              client.create({
                index: 'alert-' + d.yyyymmdd(),
                type: type,
                // id: '1',
                body: {
                  host: host,
                  type: type,
                  typeInstance: typeInstance,
                  sendType: 'sms',
                  receiver: receivers[receiverID],
                  timestamp: d,
                  grade: grade,
                  status: 'notified'
                }
              }, function(error, response) {
                if (error) {
                  slackLogger.error(error.message);
                  // Alert slack
                } else {
                  logger.info(response, 'SMS전송이기록되었습니다');
                }
              });
            }
          });
      }
    });
}

function notify(host, type, typeInstance, grade, value, timestamp) {
  //send sms
  sendSMS(host, type, typeInstance, grade, value, timestamp);
  //send slack
  var chl = slack.getChannelGroupOrDMByID(process.env.CHANNEL || config.get('slack.channel'));
  logger.info({
    '전송채널': chl.name
  });
  if (chl) {
    var msg = new Message(slack, {
      username: '에이디플로우알림이',
      icon_emoji: ':adflowalert:',
      attachments: [{
        "fallback": host + ' ' + ((type == 'cpu' || type == 'memory') ? type + '사용률' : ((type == 'df') ? typeInstance + '디스크사용률' : ((type == 'process') ? typeInstance + '프로세스' : type))) + ' ' + value,
        //"pretext": resp.aggregations.host.buckets[0].key,
        "title": host,
        "fields": [{
            "title": (type == 'cpu' || type == 'memory') ? type + '사용률' : ((type == 'df') ? typeInstance + '디스크사용률' : ((type == 'process') ? typeInstance + '프로세스' : type)),
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
    logger.info({
      host: host,
      type: type,
      typeInstance: typeInstance,
      grade: grade,
      value: value
    }, 'slack알람이전송되었습니다');
    // //create notified record
    // var d = new Date();
    // client.create({
    //   index: 'alert-' + d.yyyymmdd(),
    //   type: type,
    //   // id: '1',
    //   body: {
    //     host: host,
    //     type: type,
    //     typeInstance: typeInstance,
    //     sendType: 'slack',
    //     timestamp: d,
    //     grade: grade,
    //     status: 'notified'
    //   }
    // }, function(error, response) {
    //   if (error) {
    //     slackLogger.error(error.message);
    //     // Alert slack
    //   } else {
    //     logger.info(response, 'slack전송이기록되었습니다');
    //   }
    // });
  }
}
