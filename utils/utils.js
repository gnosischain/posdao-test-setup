const assert = require('assert');
const fs = require('fs');
const solc = require('solc');

async function compile(dir, contractName) {
  const input = {
    language: 'Solidity',
    sources: {
      '': {
        content: fs.readFileSync(dir + contractName + '.sol').toString()
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "constantinople",
      outputSelection: {
        '*': {
          '*': [ 'abi', 'evm.bytecode.object', 'evm.methodIdentifiers' ]
        }
      }
    }
  }

  const compiled = JSON.parse(solc.compile(JSON.stringify(input), function(path) {
    let content;
    try {
      content = fs.readFileSync(dir + path);
    } catch (e) {
      if (e.code == 'ENOENT') {
        try {
          content = fs.readFileSync(dir + '../' + path);
        } catch (e) {
          content = fs.readFileSync(dir + '../node_modules/' + path);
        }
      }
    }
    return {
      contents: content.toString()
    }
  }));

  const result = compiled.contracts[''][contractName];
  return { abi: result.abi, bytecode: '0x' + result.evm.bytecode.object };
}

function getValidatorSetContractAddress(currentBlock) {
  let vsBlock;
  const spec = readSpec();
  for (const hfBlock in spec.engine.authorityRound.params.validators.multi) {
    if (currentBlock >= hfBlock || !currentBlock) {
      vsBlock = hfBlock;
    }
  }
  const multi = spec.engine.authorityRound.params.validators.multi[vsBlock];
  return multi.contract || multi.safeContract;
}

function isConnected(web3) {
  const connection = web3.currentProvider.connection;
  return connection.readyState == connection.OPEN;
}

function readSpec() {
  const spec = fs.readFileSync(__dirname + '/../parity-data/spec.json', 'utf8');
  assert(typeof spec === 'string');
  return JSON.parse(spec);
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

function writeSpec(spec) {
  fs.writeFileSync(__dirname + '/../parity-data/spec.json', JSON.stringify(spec, null, '  '), 'UTF-8');
}

module.exports = {
  compile,
  getValidatorSetContractAddress,
  isConnected,
  readSpec,
  sleep,
  writeSpec
}
