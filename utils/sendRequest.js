module.exports = function (cmd) {
  return new Promise((resolve, reject) => {
    var exec = require('child_process').exec;
    exec(cmd, function (error, stdout, stderr) {
      if (error !== null) {
        reject(error);
      }
      let resp;
      try {
        resp = JSON.parse(stdout);
      } catch(e) {
        reject(e);
      }
      if (resp.hasOwnProperty('result')) {
        resolve(resp.result);
      } else {
        reject(new Error('result is undefined'));
      }
    });
  })
}
