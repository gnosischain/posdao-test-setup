const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function main() {
  let specFile = await readFile(__dirname + '/../posdao-contracts/spec.json', 'UTF-8');
  specFile = JSON.parse(specFile);
  await writeFile(__dirname + '/../parity-data/spec.json',
                  JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
