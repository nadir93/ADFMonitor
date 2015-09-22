var should = require('should');
var assert = require('assert');
var request = require('supertest');
//var mongoose = require('mongoose');
//var winston = require('winston');
//var config = require('../../config');
//var url = 'http://127.0.0.1:13532';
var url = 'https://slack.com';

describe('getSlackChannelList\n\t\tenv : https://slack.com/api/channels.list\n\t\tfile : getSlackChannelList.js', function() {

  //테스트 수행전 선행작업
  //    before(function (done) {
  //        done();
  //    });

  describe('slackChannelList', function() {
    it('슬랙채널리스트가져오기 : 응답코드 201', function(done) {
      this.timeout(5000);
      request(url)
        .get('/api/channels.list?token=xoxp-6688128693-6688024209-9362611556-e70615')
        //    .set('token', 'xoxp-6688128693-6688024209-9362611556-e70615')
        .expect(200)
        // end handles the response
        .end(function(err, res) {
          console.log({
            response: res.body.channels
          });
          if (err) return done(err);
          done();
        });
    });
  });
});
