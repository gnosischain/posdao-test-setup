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

  // Explicitly activate EIP-2565
  if (process.env.CLIENT == 'openethereum') {
    specFile.accounts["0000000000000000000000000000000000000005"].builtin.pricing["0"].price = { modexp2565: {} };
  } else if (process.env.CLIENT == 'nethermind') {
    specFile.params.eip2565Transition = "0x0";
    specFile.params.eip2718Transition = "0x0";
  }

  await promisify(fs.writeFile)(__dirname + '/../data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
