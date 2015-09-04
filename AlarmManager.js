var util = require('util');
var schedule = require('node-schedule');
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
    logName: 'AlarmManager',
    level: 'info'
  });

var BunyanSlack = require('bunyan-slack'),
  slackLogger = bunyan.createLogger({
    name: "AlarmManager",
    stream: new BunyanSlack({
      webhook_url: "https://hooks.slack.com/services/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",
      channel: "#monitoring",
      username: "에이디플로우알림이",
      customFormatter: function(record, levelName) {
        return {
          attachments: [{
            fallback: 'ADFMonitorNotification',
            "title": "ADFMonitor - AlarmManager",
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
//slackLogger.error("알람매니저가시작되었습니다");
var serverList = config.get('serverList');

// index용 날짜 포맷
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  return yyyy + '.' + (mm[1] ? mm : "0" + mm[0]) + '.' + (dd[1] ? dd : "0" + dd[0]); // padding
};

// healthCheck elasticsearch
logger.info('검색엔진핑주기=' + config.get('ping.schedule'));
schedule.scheduleJob(config.get('ping.schedule') /* 30초마다 */ , function() {
  client.ping({
    // ping usually has a 3000ms timeout
    requestTimeout: Infinity,
    //requestTimeout: 3000,
    // undocumented params are appended to the query string
    hello: "elasticsearch!"
  }, function(error, response) {
    if (error) {
      slackLogger.error('검색엔진에문제가발생하였습니다');
      // Alert slack
    } else {
      logger.info('검색엔진이정상입니다');
    }
  });
});

// collectd agent offline
logger.info('오프라인점검주기=' + config.get('offline.schedule'));
schedule.scheduleJob(config.get('offline.schedule') /* 1분마다 */ , function() {
  client.search({
    index: 'logstash-*',
    //type: 'tweets',
    body: config.get('offline.query')
  }).then(function(resp) {
      // elasticsearch에 ALERT데이타를 입력
      logger.info({
        수행시간: resp.took + 'ms',
        검색된문서: resp.hits.total
      }, '오프라인점검이완료되었습니다');

      if (resp.hits.total == 0) {
        logger.error('오프라인검색문서가존재하지않습니다');
        alert('allAgents', 'offline', '', 'danger', 'created');
        return;
      }
      var hosts = resp.aggregations.host.buckets;
      logger.info({
        count: hosts.length
      }, '점검된총서버수');
      var temp = [];
      for (hostId in hosts) {
        logger.info({
          host: hosts[hostId].key,
          hostId: hostId
        }, '점검된서버');
        temp.push(hosts[hostId].key);
      }
      for (id in serverList) {
        var exists = false;
        for (hostId in hosts) {
          if (temp[hostId] == serverList[id]) {
            exists = true;
          }
        }
        if (!exists) {
          logger.error(serverList[id] + '서버agent가offline입니다');
          //send alert
          alert(serverList[id], 'offline', '', 'danger', 'created');
        }
      }
    },
    function(err) {
      slackLogger.error(err.message);
      //문제발생 slack으로 푸시
    });
});

// 디스크
logger.info('disk점검주기=' + config.get('disk.schedule'));
schedule.scheduleJob(config.get('disk.schedule') /* 1분마다 */ , function() {
  client.search({
    index: 'logstash-*',
    //type: 'tweets',
    body: config.get('disk.query')
  }).then(function(resp) {
      // elasticsearch에 ALERT데이타를 입력
      logger.info({
        수행시간: resp.took + 'ms',
        검색된문서: resp.hits.total
      }, 'disk점검이완료되었습니다');

      if (resp.hits.total == 0) {
        logger.error('disk검색문서가존재하지않습니다');
        return;
      }

      var hosts = resp.aggregations.host.buckets;
      for (hostId in hosts) {
        logger.debug('호스트=' + hosts[hostId].key);
        var plugins = hosts[hostId].plugin.buckets
        for (pluginId in plugins) {
          logger.debug('플러그인인스턴스=' + hosts[hostId].key + ':' + plugins[pluginId].key);
          var pluginTypes = plugins[pluginId].type_instance.buckets;
          //디스크처리
          processDisk(hosts[hostId].key, 'df', plugins[pluginId].key, pluginTypes);
        }
      }
    },
    function(err) {
      logger.trace(err.message);
      //문제발생 slack으로 푸시
    });
});

// cpu& memory
logger.info('cpu&memory점검주기=' + config.get('cpu&memory.schedule'));
schedule.scheduleJob(config.get('cpu&memory.schedule') /* 1분마다 */ , function() {
  //console.log('The answer to life, the universe, and everything!'+new Date());
  client.search({
    index: 'logstash-*',
    //type: 'tweets',
    body: config.get('cpu&memory.query')
  }).then(function(resp) {
      // elasticsearch에 ALERT데이타를 입력
      logger.info({
        수행시간: resp.took + 'ms',
        검색된문서: resp.hits.total
      }, 'cpu&memory점검이완료되었습니다');

      if (resp.hits.total == 0) {
        logger.error('cpu&memory검색문서가존재하지않습니다');
        return;
      }

      var hosts = resp.aggregations.host.buckets;
      for (hostId in hosts) {
        logger.debug('호스트=' + hosts[hostId].key);
        var plugins = hosts[hostId].plugin.buckets
        for (pluginId in plugins) {
          logger.debug('플러그인=' + hosts[hostId].key + ':' + plugins[pluginId].key);
          var pluginTypes = plugins[pluginId].type_instance.buckets
          if (plugins[pluginId].key == 'memory') {
            // 메모리 처리
            processMemory(hosts[hostId].key, plugins[pluginId].key, pluginTypes);
          } else if (plugins[pluginId].key == 'cpu') {
            //cpu처리
            processCPU(hosts[hostId].key, plugins[pluginId].key, pluginTypes);
          } else if (plugins[pluginId].key == 'df') {
            //디스크처리
            processDisk(hosts[hostId].key, plugins[pluginId].key, pluginTypes);
          }
        }
      }
    },
    function(err) {
      logger.trace(err.message);
      //문제발생 slack으로 푸시
    });
});

//memory 처리
function processMemory(host, type, instance) {
  logger.debug(instance);
  var total = 0;
  var free;
  for (id in instance) {
    total = total + instance[id].avg.value;
    if (instance[id].key == 'free') {
      free = instance[id].avg.value;
    }
  }
  var memoryUsage = (100 - (free / total * 100)).toFixed(2) + '%';
  logger.info({
    host: host,
    totalMemory: bytesToSize(total),
    freeMemory: bytesToSize(free),
    메모리사용률: memoryUsage
  });
}

//disk 처리
function processDisk(host, type, typeInstance, instance) {
  logger.debug(instance);
  var total, free, used, reserved;
  for (id in instance) {
    if (instance[id].key == 'free') {
      free = instance[id].avg.value;
    } else if (instance[id].key == 'used') {
      used = instance[id].avg.value;
    } else if (instance[id].key == 'reserved') {
      reserved = instance[id].avg.value;
    }
  }
  total = free + used + reserved;
  result = (free / total * 100).toFixed(2);
  var diskUsage = (100 - result).toFixed(2) + '%';

  logger.info({
    host: host,
    type: type,
    typeInstance: typeInstance,
    디스크사용률: diskUsage
  });

  if (config.get(host + '.disk.' + typeInstance)) {
    if (result < config.get(host + '.disk.' + typeInstance + '.danger')) {
      logger.error({
        host: host,
        typeInstance: typeInstance,
        grade: 'danger',
        status: 'created',
        value: diskUsage
      }, 'disk위험발생');
      alert(host, type, diskUsage, 'danger', 'created', typeInstance);
    } else if (result < config.get(host + '.disk.' + typeInstance + '.warning')) {
      logger.error({
        host: host,
        typeInstance: typeInstance,
        grade: 'warning',
        status: 'created',
        value: diskUsage
      }, 'disk경고발생');
      alert(host, type, diskUsage, 'warning', 'created', typeInstance);
    }
  }
}

//cpu 처리
function processCPU(host, type, instance) {
  logger.debug(instance);

  var idle;
  for (id in instance) {
    if (instance[id].key == 'idle') {
      idle = instance[id].avg.value;
    }
  }

  var cpuUsage = (100 - idle).toFixed(2) + '%';
  logger.info({
    host: host,
    cpu사용률: cpuUsage
  });

  if (idle < config.get('default.cpu.danger')) {
    logger.error({
      host: host,
      grade: 'danger',
      status: 'created',
      value: cpuUsage
    }, 'cpu위험발생');
    alert(host, type, cpuUsage, 'danger', 'created');
  } else if (idle < config.get('default.cpu.warning')) {
    logger.error({
      host: host,
      grade: 'warning',
      status: 'created',
      value: cpuUsage
    }, 'cpu경고발생');
    alert(host, type, cpuUsage, 'warning', 'created');
  }
}

//alerting
function alert(host, type, value, grade, status, typeInstance) {
  var d = new Date();
  client.create({
    index: 'alert-' + d.yyyymmdd(),
    type: type,
    // id: '1',
    body: {
      host: host,
      type: type,
      typeInstance: typeInstance,
      timestamp: d,
      value: value,
      grade: grade,
      status: status
    }
  }, function(error, response) {
    if (error) {
      slackLogger.error(error.message);
      // Alert slack
    } else {
      logger.error(response, '알람생성결과');
    }
  });
}

function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + sizes[i];
};

// todo
// 1. 표본데이타가 너무적은경우 alert을 스킵하게해야함 - 예) 부팅하자마자 high cpu usage는 의미가 없음
// 2. 로그를 반복되는 파일로 처리해야함
// 2. offline& online event 발생
// 3. 하루 처리 통계치를 슬랙으로 저녁 6시쯤 전송한다.
// 4. delete indices - 일정시간이상 지나는 인덱스 삭제
// 5. logstash 시간 체크해볼것 gmt + 9
