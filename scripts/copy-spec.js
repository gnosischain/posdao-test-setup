const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');

async function main() {
  let specFile = await readFile(__dirname + '/../posdao-contracts/spec.json', 'UTF-8');
  assert(typeof specFile === 'string');
  specFile = JSON.parse(specFile);
  assert(specFile.engine.authorityRound.params.stepDuration != null);
  
  // Set step duration map for testing purposes
  specFile.engine.authorityRound.params.stepDuration = {
    "0": 5
  };
  // switch to another duration in 120 seconds
  const newStepDurationTimestamp = Math.round((Date.now() / 1000 + 120) / 10) * 10;
  specFile.engine.authorityRound.params.stepDuration[newStepDurationTimestamp] = 4;
  console.log();
  console.log();
  console.log('STEP DURATION WILL BE CHANGED AT ', new Date(newStepDurationTimestamp * 1000).toLocaleTimeString('en-US'));
  console.log();
  console.log();

  await promisify(fs.writeFile)(__dirname + '/../data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
