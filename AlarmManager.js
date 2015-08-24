var util = require('util');
var schedule = require('node-schedule');
var config = require('config');
var LogClass = require('./log_to_bunyan');
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
  host: config.get('elasticsearch.host'),
  log: LogClass
    //'trace'
});

var logger = new LogClass();

// index용 날짜 포맷
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  return yyyy + '.' + (mm[1] ? mm : "0" + mm[0]) + '.' + (dd[1] ? dd : "0" + dd[0]); // padding
};

// healthCheck elasticsearch
schedule.scheduleJob('*/30 * * * * *' /* 30초마다 */ , function() {
  client.ping({
    // ping usually has a 3000ms timeout
    requestTimeout: Infinity,
    //requestTimeout: 3000,
    // undocumented params are appended to the query string
    hello: "elasticsearch!"
  }, function(error, response) {
    if (error) {
      logger.trace('elasticsearchDown!!!');
      // Alert slack
    } else {
      logger.info('elasticsearchIsAlive');
    }
  });
});

// collectd agent offline
schedule.scheduleJob('*/30 * * * * *' /* 1분마다 */ , function() {
  client.search({
    index: 'logstash-*',
    //type: 'tweets',
    body: agentOfflineQuery
  }).then(function(resp) {
      // elasticsearch에 ALERT데이타를 입력
      logger.info({
        queryName: 'offLineTest',
        elapsedtime: resp.took,
        unit: 'ms'
      });
      var hosts = resp.aggregations.host.buckets;
      var temp = [];
      for (hostId in hosts) {
        logger.info({
          host: hosts[hostId].key,
          hostId: hostId
        }, 'serverExist');
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
          logger.error(serverList[id] + '서버에 collectd agent가 offline 상태입니다');
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
schedule.scheduleJob('*/60 * * * * *' /* 1분마다 */ , function() {
  //console.log('The answer to life, the universe, and everything!'+new Date());
  client.search({
    index: 'logstash-*',
    //type: 'tweets',
    body: cpuAndMemoryQuery
  }).then(function(resp) {
      // elasticsearch에 ALERT데이타를 입력
      logger.info({
        queryName: 'cpu&memory',
        elapsedtime: resp.took,
        unit: 'ms'
      });
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

  if (idle < 10) {
    logger.info({
      host: host,
      grade: 'danger',
      status: 'created',
      value: cpuUsage
    });
    alert(host, type, cpuUsage, 'danger', 'created');
  } else if (idle < 30) {
    logger.info({
      host: host,
      grade: 'danger',
      status: 'created',
      value: cpuUsage
    });
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
      logger.info(response, '알람전송결과');
    }
  });
}

function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + sizes[i];
};

var agentOfflineQuery = {
  "query": {
    "filtered": {
      "filter": {
        "bool": {
          "must": {
            "range": {
              "@timestamp": {
                "gte": "now-1m"
              }
            }
          }
        }
      }
    }
  },
  "size": 0,
  "aggs": {
    "host": {
      "terms": {
        "field": "host",
        "size": 100
      }
    }
  }
}

var cpuAndMemoryQuery = {
  "query": {
    "filtered": {
      "filter": {
        "bool": {
          "must": {
            "range": {
              "@timestamp": {
                "gte": "now-3m"
              }
            }
          },
          "should": [{
            "term": {
              "plugin": "cpu"
            }
          }, {
            "term": {
              "plugin": "memory"
            }
          }]
        }
      }
    }
  },
  "size": 0,
  "aggs": {
    "host": {
      "terms": {
        "field": "host",
        "size": 100
      },
      "aggs": {
        "plugin": {
          "terms": {
            "field": "plugin",
            "size": 100
          },
          "aggs": {
            "type_instance": {
              "terms": {
                "field": "type_instance",
                "size": 100
              },
              "aggs": {
                "avg": {
                  "avg": {
                    "field": "value"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

var serverList = ['demo', 'raspberrypi'];

//todo
// 1분간 데이타가 없을경우 offline 이벤트를 발생시킨다.
// 하루 처리 통계치를 슬랙으로 저녁 6시쯤 전송한다.
// delete indices - 일정시간이상 지나는 인덱스 삭제
// logstash 시간 체크해볼것 gmt + 9
