const fs = require('fs');
const { URL } = require('url');
const process = require('process');
var os = require("os");

main();

async function main() {
  const maxAttempts = 50;
  var node_index = process.argv[2].toString();
  console.log("Registering node " + node_index + " as bootnode");
  const cmd = `curl --data '{"method":"parity_enode","params":[],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST localhost:864`
        + node_index
        + ` 2>/dev/null`;
  console.log(`> ` + cmd);
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const enodeURL = await getEnodeURL(cmd);
      console.log("enode URL: " + enodeURL);
      fs.appendFileSync("data/reserved-peers", enodeURL + os.EOL);

      const bootnodes = fs.readFileSync("data/reserved-peers", 'utf-8').trim().split(os.EOL);

      const tomlFilepath = `config/node${node_index - 0 + 1}.openethereum.toml`;
      if (fs.existsSync(tomlFilepath)) {
        let toml = fs.readFileSync(tomlFilepath, 'utf-8');
        toml = toml.replace('reserved_peers="data/reserved-peers"', `bootnodes = ${JSON.stringify(bootnodes)}`);
        fs.writeFileSync(tomlFilepath, toml, 'utf-8');
      }
      const jsonFilepath = `config/node${node_index - 0 + 1}.nethermind.json`;
      if (fs.existsSync(jsonFilepath)) {
        let json = JSON.parse(fs.readFileSync(jsonFilepath, 'utf-8'));
        delete json.Init.StaticNodesPath;
        json.Discovery = {"Bootnodes" : bootnodes.join(',')};
        fs.writeFileSync(jsonFilepath, JSON.stringify(json, null, 2), 'utf-8');
      }

      break;
    } catch(e) {
      if (i <= maxAttempts) {
        await sleep(500);
      } else {
        console.log(e.message);
      }
    }
  }
}

function getEnodeURL(cmd) {
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
      let result;
      try {
        if (resp.result) {
          result = new URL(resp.result);
          result.host = '127.0.0.1';
          result = result.href;
        } else {
          throw new Error('result is undefined');
        }
      } catch (e) {
        reject(e);
      }
      resolve(result);
    });
  })
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}
