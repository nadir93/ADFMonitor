var should = require('should');
var assert = require('assert');
var request = require('supertest');
//var mongoose = require('mongoose');
//var winston = require('winston');
//var config = require('../../config');
//var url = 'http://127.0.0.1:13532';
var url = 'http://' + process.env.HOST || '127.0.0.1:9200';

// index용 날짜 포맷
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  return yyyy + '.' + (mm[1] ? mm : "0" + mm[0]) + '.' + (dd[1] ? dd : "0" + dd[0]); // padding
};

describe('memoryAlertTest\n\t\tenv :' + url + '\n\t\tfile : memoryAlertTest.js',
  function() {

    //테스트 수행전 선행작업
    //    before(function (done) {
    //        done();
    //    });
    var d = new Date();
    var data = {
      host: "테스트",
      type: "memory",
      typeInstance: 'all',
      timestamp: d,
      value: "92%",
      grade: "danger",
      status: "created"
    };


    describe('memoryAlert테스트', function() {
      it('memoryAlert 테스트 : 응답코드 201', function(done) {
        this.timeout(5000);
        request(url)
          .post('/alert-' + d.yyyymmdd() + '/memory')
          .send(data)
          .expect(201)
          // end handles the response
          .end(function(err, res) {
            if (err) {
              console.error(err);
              //throw err;
            }
            console.log({
              response: res.headers
            });
            //                    // this is should.js syntax, very clear
            //                    //res.should.have.status(200);
            //                    //res.should.have.property('status', 200);
            res.status.should.be.equal(201);
            done();
          });
      });

      //         it('파일다운로드 테스트 : 응답코드 200', function (done) {
      //             this.timeout(5000);
      //             request(url)
      //                 .get('/v1/users/+821099969797/7ae54aaf426a7483e2ae54cc17d9880f.apk')
      //                 .set('token', 'fffbd697e5354b42a9f6628')
      //                 //.set('md5', '7ae54aaf426a7483e2ae54cc17d9880f')
      //                 //.attach('file', __dirname + '/resource/app-debug.apk')
      //                 .expect(200)
      //                 // end handles the response
      //                 .end(function (err, res) {
      //                     if (err) {
      //                         console.error(err);
      //                         //throw err;
      //                     }
      //                     //console.log({response: res});
      // //                    // this is should.js syntax, very clear
      // //                    //res.should.have.status(200);
      // //                    //res.should.have.property('status', 200);
      //                     res.status.should.be.equal(200);
      //                     done();
      //                 });
      //         });

      //http://127.0.0.1:8080/v1/users/fffbd697e5354b42a9f6628/7ae54aaf426a7483e2ae54cc17d9880f

      //        it('가상페이지 수정 테스트 : 응답코드 200', function (done) {
      //            request(url)
      //                .put('/v1/virtualpages/1234567890')
      //                .set('virtual_page_uri', '/test001/TestServlet')
      //                .set('event', '["x=10;y=20;sum(x,y)"]')
      //
      //                //.set('event', '[{"function1":["param1","param2"]},{"function2":["param1","param2"]}]')
      //                //.send(profile)
      //                // end handles the response
      //                .end(function (err, res) {
      //                    if (err) {
      //                        throw err;
      //                    }
      //                    //console.log('response : ',res.text);
      //                    // this is should.js syntax, very clear
      //                    res.should.have.status(200);
      //                    done();
      //                });
      //        });
      //
      //        it('가상페이지 가져오기 테스트 : 응답코드 200', function (done) {
      //            request(url)
      //                .get('/v1/virtualpages/1234567890')
      //                // end handles the response
      //                .end(function (err, res) {
      //                    if (err) {
      //                        throw err;
      //                    }
      //                    //console.log('response : ',res.text);
      //                    // this is should.js syntax, very clear
      //                    res.should.have.status(200);
      //                    done();
      //                });
      //        });
      //
      //        it('가상페이지 삭제 테스트 : 응답코드 200', function (done) {
      //            request(url)
      //                .del('/v1/virtualpages/1234567890')
      //                // end handles the response
      //                .end(function (err, res) {
      //                    if (err) {
      //                        throw err;
      //                    }
      //                    //console.log('response : ',res.text);
      //                    // this is should.js syntax, very clear
      //                    res.should.have.status(200);
      //                    done();
      //                });
      //        });
    });
  });
