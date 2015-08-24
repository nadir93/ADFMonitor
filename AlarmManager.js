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

var logger = new LogClass();
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
      logger.trace('검색엔진에문제가발생하였습니다');
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
        수행시간: resp.took,
        unit: 'ms'
      }, '오프라인점검이완료되었습니다');
      var hosts = resp.aggregations.host.buckets;
      var temp = [];
      for (hostId in hosts) {
        logger.info({
          host: hosts[hostId].key,
          hostId: hostId
        }, '서버가존재합니다');
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
        elapsedtime: resp.took,
        unit: 'ms'
      }, 'cpu&memory점검이완료되었습니다');
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
  logger.info({
    host: host,
    totalMemory: bytesToSize(total),
    freeMemory: bytesToSize(free),
    utilization: (free / total * 100).toFixed(2) + '%'
  });
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
    cpu사용량: cpuUsage
  });

  if (idle < config.get('cpu.danger')) {
    logger.info({
      host: host,
      grade: 'danger',
      status: 'created',
      value: cpuUsage
    }, 'cpu위험발생');
    alert(host, type, cpuUsage, 'danger', 'created');
  } else if (idle < config.get('cpu.warning')) {
    logger.info({
      host: host,
      grade: 'warning',
      status: 'created',
      value: cpuUsage
    }, 'cpu경고발생');
    alert(host, type, cpuUsage, 'warning', 'created');
  }
}

//alerting
function alert(host, type, value, grade, status) {
  var d = new Date();
  client.create({
    index: 'alert-' + d.yyyymmdd(),
    type: type,
    // id: '1',
    body: {
      host: host,
      type: type,
      timestamp: d,
      value: value,
      grade: grade,
      status: status
    }
  }, function(error, response) {
    if (error) {
      logger.trace(error.message);
      // Alert slack
    } else {
      logger.info(response, '알람생성결과');
    }
  });
}

function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + sizes[i];
};

//todo
// 1분간 데이타가 없을경우 offline 이벤트를 발생시킨다.
// 하루 처리 통계치를 슬랙으로 저녁 6시쯤 전송한다.
// delete indices - 일정시간이상 지나는 인덱스 삭제
// logstash 시간 체크해볼것 gmt + 9
