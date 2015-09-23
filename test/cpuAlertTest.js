var should = require('should');
var assert = require('assert');
var request = require('supertest');
//var mongoose = require('mongoose');
//var winston = require('winston');
//var config = require('../../config');
var host = process.env.HOST || '127.0.0.1:9200';
var url = 'http://' + host;

// index용 날짜 포맷
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  return yyyy + '.' + (mm[1] ? mm : "0" + mm[0]) + '.' + (dd[1] ? dd : "0" + dd[0]); // padding
};

describe('cpu알람테스트\n\t\tenv :' + url + '\n\t\tfile : cpuAlertTest.js',
  function() {

    //테스트 수행전 선행작업
    //    before(function (done) {
    //        done();
    //    });
    var d = new Date();
    var data = {
      host: "테스트",
      type: "cpu",
      typeInstance: 'all',
      timestamp: d,
      value: "92%",
      grade: "danger",
      status: "created"
    };


    describe('cpu알람테스트', function() {
      it('cpu알람테스트', function(done) {
        this.timeout(5000);
        request(url)
          .post('/alert-' + d.yyyymmdd() + '/cpu')
          .send(data)
          .expect(201)
          .end(function(err, res) {
            console.log({
              응답결과: res.body
            });
            if (err) throw err;
            done();
          });
      });
    });
  });
