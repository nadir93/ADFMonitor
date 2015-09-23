var oracledb = require('oracledb');
var should = require('should');
var assert = require('assert');
var request = require('supertest');

describe('smsTest\n\t\tenv :' + url + '\n\t\tfile : smsTest.js',
  function() {

    describe('sms테스트', function() {
      it('sms 테스트 : 응답코드 201', function(done) {
        oracledb.getConnection({
            user: process.env.user,
            password: process.env.password,
            connectString: process.env.connString,
          },
          function(err, connection) {
            if (err) {
              console.error(err.message);
              return;
            }
            connection.execute(
              "insert into sms (sm_number, sm_indate, sm_sdmbno, sm_rvmbno, sm_msg, sm_code1, sm_code2) values (sms_seq.nextval, sysdate, :receiver, :sender, :msg, :code1, :code2)", ['01040269329', '024504079', '한글테스트입니다', 'tivoli', 'tivoli'], // Bind values
              {
                autoCommit: true
              }, // Override the default non-autocommit behavior
              function(err, result) {
                if (err) {
                  console.error(err.message);
                  return;
                }
                console.log("Rows inserted: " + result.rowsAffected); // 1
                done();
              });
          });
      });
    });
  });
