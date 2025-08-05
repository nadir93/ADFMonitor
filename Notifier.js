/**
 * Author @nadir93
 * Date 2017.2.20
 */
'use strict';

const EventEmitter = require('events');
const util = require('util');
const config = require('config');
const LogClass = require('./log_to_bunyan');
const schedule = require('node-schedule');
const elasticsearch = require('elasticsearch');

const log = new LogClass({
  logName: 'Notifier',
  level: config.get('log.level')
});

const client = new elasticsearch.Client({
  host: process.env.HOST || config.get('elasticsearch.host'),
  log: LogClass
});

const serverList = config.get('serverList');
const pluginList = ['cpu', 'memory', 'disk', 'process', 'offline'];

class Notifier extends EventEmitter {
  constructor(serverList, pluginList) {
    super();
    this.serverList = serverList;
    this.pluginList = pluginList;
  }

  execute() {
    client.search({
        index: 'alert-*',
        body: config.get('alert.query')
      })
      .then(resp => {
        log.info({
          수행시간: resp.took + ' ms',
          검색된문서수: resp.hits.total
        }, '알람점검이 완료되었습니다');

        if (resp.hits.total == 0) {
          return;
        }
        const hosts = resp.aggregations.host.buckets;
        for (let hostId in hosts) {
          log.debug('호스트: ', hosts[hostId].key);
          const types = hosts[hostId].type.buckets;
          for (let typesId in types) {
            log.debug('타입: ', hosts[hostId].key + ':' + types[typesId].key);
            const typeInstances = types[typesId].typeInstance.buckets;
            for (let typeInstanceId in typeInstances) {
              log.debug('타입인스턴스: ', hosts[hostId].key +
                ':' + types[typesId].key + ':' +
                typeInstances[typeInstanceId].key);
              let alarm = true;
              let grade;
              let value;
              const grades = typeInstances[typeInstanceId].grade.buckets;
              let timestamp;
              for (let gradeId in grades) {
                log.debug('중요도: ', hosts[hostId].key + ':' +
                  types[typesId].key + ':' +
                  typeInstances[typeInstanceId].key +
                  ':' + grades[gradeId].key);
                grade = grades[gradeId].key;
                const status = grades[gradeId].status.buckets;
                for (let statusId in status) {
                  log.debug('상태: ', hosts[hostId].key + ':' +
                    types[typesId].key + ':' +
                    typeInstances[typeInstanceId].key + ':' +
                    grades[gradeId].key + ':' + status[statusId].key);
                  const hits = status[statusId].top_tag_hits.hits.hits[0];
                  log.debug('hits: ', util.inspect(hits));
                  value = hits._source.value;
                  timestamp = hits._source.timestamp;
                  if (hits && status[statusId].key == 'notified') {
                    alarm = false;
                  }
                }
              }

              if (alarm) {
                this.emit('notify', {
                  host: hosts[hostId].key,
                  type: types[typesId].key,
                  typeInstances: typeInstances[typeInstanceId].key,
                  grade: grade,
                  value: value,
                  timestamp: timestamp
                });
              }
            }
          }
        }
      })
      .catch(err => {
        log.trace(err.message);
      });
  }
}

const notifier = new Notifier(serverList, pluginList);
schedule.scheduleJob(config.get('alert.schedule'), () => notifier.execute());
module.exports = notifier;
