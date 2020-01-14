const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');

const constants = require('../utils/constants');
const OWNER = constants.OWNER;

async function main() {
  let specFile = await readFile(__dirname + '/../parity-data/spec.json', 'UTF-8');

  assert(typeof specFile === 'string');
  specFile = JSON.parse(specFile);

  if (specFile.engine.authorityRound.params.posdaoTransition === undefined) {
    console.log('posdaoTransition is not defined in spec.json, so emitInitiateChange will be called manually');

    const Web3 = require('web3');
    const web3 = new Web3('http://localhost:8541');
    const validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3).instance;

    while (true) {
      const emitInitiateChangeCallable = await validatorSetContract.methods.emitInitiateChangeCallable().call();
      if (emitInitiateChangeCallable) {
        const validators = await validatorSetContract.methods.getValidators().call();
        await validatorSetContract.methods.emitInitiateChange().send({
          from: OWNER,
          gas: '1600000',
          gasPrice: '0'
        })
      }
      await sleep(3000);
    }
  }
}

async function sleep(ms) {
    await new Promise(r => setTimeout(r, ms));
}

main();
