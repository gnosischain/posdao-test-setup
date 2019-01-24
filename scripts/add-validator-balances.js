const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');
async function main() {
  let specFile = await readFile(__dirname + '/../pos-contracts/spec.json', 'UTF-8');
  assert.ok(typeof specFile === 'string');
  specFile = JSON.parse(specFile);
  const accounts = specFile.accounts;
  assert.ok(accounts != null && Object.getPrototypeOf(accounts) === Object.prototype);
  for (const validator of process.env.INITIAL_VALIDATORS.split(',')) {
    assert(!Object.prototype.hasOwnProperty.call(accounts, validator));
    accounts[validator] = { balance: '0x100000000000000000' };
  }
  await promisify(fs.writeFile)(__dirname + '/../parity-data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
