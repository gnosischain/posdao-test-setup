const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');
const constants = require('../utils/constants');

async function main() {
  let specFile = await readFile(__dirname + '/../posdao-contracts/spec.json', 'UTF-8');
  assert.ok(typeof specFile === 'string');
  specFile = JSON.parse(specFile);
  const accounts = specFile.accounts;
  assert.ok(accounts != null && Object.getPrototypeOf(accounts) === Object.prototype);
  for (const candidate of constants.CANDIDATES) {
    assert(!Object.prototype.hasOwnProperty.call(accounts, candidate));
    accounts[candidate] = { balance: '0x100000000000000000' };
  }
  await promisify(fs.writeFile)(__dirname + '/../parity-data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
