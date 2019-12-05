const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');
const constants = require('../utils/constants');

async function main() {
  let specFile = await readFile(__dirname + '/../posdao-contracts/spec.json', 'UTF-8');
  assert(typeof specFile === 'string');
  specFile = JSON.parse(specFile);
  assert(specFile.engine.authorityRound.params.stepDuration != null);
  specFile.engine.authorityRound.params.stepDuration = 4;
  
  // This is a temporary patch until `randomness_contract_address` option
  // in https://github.com/poanetwork/parity-ethereum/tree/aura-pos
  // is changed from `Option<Address>` to `Option<BTreeMap<Uint, Address>>`
  specFile.engine.authorityRound.params.randomnessContractAddress = specFile.engine.authorityRound.params.randomnessContractAddress[0];
  
  await promisify(fs.writeFile)(__dirname + '/../parity-data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
