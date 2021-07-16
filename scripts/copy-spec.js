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

  specFile.engine.authorityRound.params.blockRewardContractTransition = "1000000";
  specFile.engine.authorityRound.params.posdaoTransition = "1000000";
  specFile.engine.authorityRound.params.blockGasLimitContractTransitions = { "1000000" : "0x4000000000000000000000000000000000000001" };
  specFile.engine.authorityRound.params.randomnessContractAddress[1000000] = specFile.engine.authorityRound.params.randomnessContractAddress[0];
  specFile.params.transactionPermissionContractTransition = "1000000";
  delete specFile.engine.authorityRound.params.randomnessContractAddress[0];
  specFile.params.eip1559Transition = "10";
  specFile.params.eip3198Transition = "10";
  specFile.params.eip3529Transition = "10";
  specFile.params.eip3541Transition = "10";

  await promisify(fs.writeFile)(__dirname + '/../data/spec-ne.json', JSON.stringify(specFile, null, '  '), 'UTF-8');

  specFile.params.eip1559BaseFeeMaxChangeDenominator = "0x8";
  specFile.params.eip1559ElasticityMultiplier = "0x2";
  specFile.params.eip1559BaseFeeInitialValue = "0x3b9aca00";
  //specFile.genesis.baseFeePerGas = "0x3b9aca00";

  await promisify(fs.writeFile)(__dirname + '/../data/spec-oe.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
