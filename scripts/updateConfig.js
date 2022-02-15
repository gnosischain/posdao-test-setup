const fs = require('fs');

main();

async function main() {
  var node_index = process.argv[2].toString();
  if (node_index == 0) {
    const jsonFilepath = `config/node0.nethermind.json`;
    let json = JSON.parse(fs.readFileSync(jsonFilepath, 'utf-8'));
    json.Mining = { "MinGasPrice": "0" };
    fs.writeFileSync(jsonFilepath, JSON.stringify(json, null, 2), 'utf-8');
  } else {
    const jsonFilepath = `config/node${node_index}.nethermind.json`;
    let json = JSON.parse(fs.readFileSync(jsonFilepath, 'utf-8'));
    json.Mining.MinGasPrice = "500000000"; // 0.5 GWei
    fs.writeFileSync(jsonFilepath, JSON.stringify(json, null, 2), 'utf-8');
  }
}
