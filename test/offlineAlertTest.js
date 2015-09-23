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

describe('오프라인알람테스트\n\t\tenv :' + url + '\n\t\tfile : offlineAlertTest.js',
  function() {

    //테스트 수행전 선행작업
    //    before(function (done) {
    //        done();
    //    });
    var d = new Date();
    var data = {
      host: "테스트",
      type: "offline",
      typeInstance: 'off',
      timestamp: d,
      value: "",
      grade: "danger",
      status: "created"
    };


    describe('오프라인알람테스트', function() {
      it('오프라인알람테스트', function(done) {
        this.timeout(5000);
        request(url)
          .post('/alert-' + d.yyyymmdd() + '/offline')
          .send(data)
          .expect(201)
          // end handles the response
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
