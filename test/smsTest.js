var oracledb = require('oracledb');
var assert = require('assert');

describe('smsTest\n\t\tenv :' + '\n\t\tfile : smsTest.js',
  function() {
    describe('sms테스트', function() {
      it('sms 테스트', function(done) {
        this.timeout(5000);
        oracledb.getConnection({
            user: process.env.user,
            password: process.env.password,
            connectString: process.env.connString,
          },
          function(err, connection) {
            if (err) {
              console.error(err.message);
              throw err;
            }
            connection.execute(
              "insert into sms (sm_number, sm_indate, sm_sdmbno, sm_rvmbno, sm_msg, sm_code1, sm_code2) values (sms_seq.nextval, sysdate, :receiver, :sender, :msg, :code1, :code2)", ['01040269329', '024504079', '한글테스트입니다', 'tivoli', 'tivoli'], // Bind values
              {
                autoCommit: true
              }, // Override the default non-autocommit behavior
              function(err, result) {
                if (err) {
                  console.error(err.message);
                  throw err;
                }
                console.log("Rows inserted: " + result.rowsAffected); // 1
                assert(result.rowsAffected === 1, '한개의레코드가입력되야함');
                done();
              });
          });
      });
    });
  });
