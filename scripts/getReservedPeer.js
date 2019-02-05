const fs = require('fs');
const { promisify } = require('util');
const appendFile = promisify(fs.appendFile);
const { exec } = require('child_process');
const { URL } = require('url');
const process = require('process');
const os = require("os");

main();

const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
async function main() {
  inner_main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}

async function inner_main() {
  const maxAttempts = 5;
  const node_index = process.argv[2].toString();

  // Stop any injection attacks
  const whitelist = /^[0-9]+$/s;
  if (!whitelist.test(node_index) || typeof node_index !== 'string')
    throw new Error('Invalid node index');
  console.log("Registering node " + node_index + " as reserved peer");
  const cmd = `curl --data '{"method":"parity_enode","params":[],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST localhost:854`
        + node_index
        + ` 2>/dev/null`;
  console.log(`> ` + cmd);
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const enodeURL = await getEnodeURL(cmd);
      console.log("enode URL: " + enodeURL);
      await appendFile(__dirname + "/../parity-data/reserved-peers", enodeURL + os.EOL);
      break;
    } catch(e) {
      if (i <= maxAttempts) {
        await sleep(5000);
      } else {
        console.log(e);
        console.error(e);
        process.exitCode = 1;
      }
    }
  }
}

function getEnodeURL(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, function (error, stdout, stderr) {
      if (error !== null) {
        reject(error);
      }
      try {
        const resp = JSON.parse(stdout);
        for (let i in resp) {
          switch (i) {
          case 'error':
            throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error));
          case 'result':
          case 'jsonrpc':
          case 'id':
            break;
          default:
            throw new SyntaxError('unknown field in JSON-RPC response');
          }
        }
        if (1 !== resp.id)
          throw new SyntaxError('invalid JSON-RPC response ID');
        if ('2.0' !== resp.jsonrpc)
          throw new SyntaxError('invalid JSON-RPC response version');
        if (typeof resp.result !== 'string')
          throw new TypeError('wrong type for resp.result');
        const result = new URL(resp.result);
        result.host = '127.0.0.1';
        resolve(result.href);
      } catch (e) {
        reject(e);
      }
    });
  })
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

main();
