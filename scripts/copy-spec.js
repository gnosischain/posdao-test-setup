const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');
const constants = require('../utils/constants');

function fixSpecBuiltin(builtin) {
  let newBuiltin = builtin;
  let newPricing = builtin.pricing;

  delete newBuiltin.activate_at;
  delete newBuiltin.eip1108_transition;
  if (newPricing.alt_bn128_const_operations) {
    newPricing.alt_bn128_const_operations.price = newPricing.alt_bn128_const_operations.eip1108_transition_price;
    delete newPricing.alt_bn128_const_operations.eip1108_transition_price;
  } else if (newPricing.alt_bn128_pairing) {
    newPricing.alt_bn128_pairing.base = newPricing.alt_bn128_pairing.eip1108_transition_base;
    newPricing.alt_bn128_pairing.pair = newPricing.alt_bn128_pairing.eip1108_transition_pair;
    delete newPricing.alt_bn128_pairing.eip1108_transition_base;
    delete newPricing.alt_bn128_pairing.eip1108_transition_pair;
  }
  newBuiltin.pricing = { "0" : { "price" : newPricing } }

  return newBuiltin;
}

function leftTrimAddress(address) {
  return address.replace(/^[0|x]+/, '');
}

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
  console.log('Step duration will be changed at ', new Date(newStepDurationTimestamp * 1000).toLocaleTimeString('en-US'));

  const exec = promisify(require('child_process').exec);
  const { stdout, stderr } = await exec('../../open-ethereum/target/release/parity --version');

  assert(!stderr);

  const version = stdout.match(/v([0-9]+)\.([0-9]+)\.([0-9]+)/);
  const versionMajor = version[1];
  const versionMinor = version[2];
  const versionPatch = version[3];

  function isVersionGte(expectedMajor, expectedMinor, expectedPatch) {
    if (versionMajor < expectedMajor) {
      return false;
    } else if (versionMajor == expectedMajor && versionMinor < expectedMinor) {
      return false;
    } else if (versionMajor == expectedMajor && versionMinor == expectedMinor && versionPatch < expectedPatch) {
      return false;
    }
    return true;
  }



  if (isVersionGte(2,7,0)) { // if this is Open Ethereum >= v2.7.0
    if (!isVersionGte(3,0,0) && stdout.indexOf('posdao') == -1) { // if this is Open Ethereum < v3.0.0 and not v2.7.2-posdao-stable
      // Remove `posdaoTransition` option as it is not released yet.
      delete specFile.engine.authorityRound.params.posdaoTransition;
    }

    // Apply a new format to spec.json (the new format is actual beginning from Open Ethereum 2.6.5-beta)
    const accounts = Object.keys(specFile.accounts);
    for (let i = 0; i < accounts.length; i++) {
      const address = accounts[i];
      const addressTrimmed = leftTrimAddress(accounts[i]);
      if (addressTrimmed >= 1 && addressTrimmed <= 9) {
        const account = '0x' + addressTrimmed.padStart(40, '0')
        const accountObj = specFile.accounts[address];
        delete specFile.accounts[address];
        specFile.accounts[account] = accountObj;
        specFile.accounts[account].builtin = fixSpecBuiltin(specFile.accounts[account].builtin);
      }
    }
  }

  await promisify(fs.writeFile)(__dirname + '/../parity-data/spec.json', JSON.stringify(specFile, null, '  '), 'UTF-8');
}

main();
