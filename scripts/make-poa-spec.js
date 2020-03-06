const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const assert = require('assert');
const solc = require('solc');
const Web3 = require('web3');
const web3 = new Web3();

async function main() {
  let spec = await readFile(__dirname + '/../templates/spec.json', 'UTF-8');
  assert(typeof spec === 'string');
  spec = JSON.parse(spec);

  spec.name = process.env.NETWORK_NAME;
  spec.params.networkID = process.env.NETWORK_ID;

  const validatorSetAddress = spec.engine.authorityRound.params.validators.multi[0].safeContract;
  const blockRewardAddress = spec.engine.authorityRound.params.blockRewardContractAddress;
  const certifierAddress = '0x61f399be19c115d5ae400b1943d0df8c952ff9d6';
  const registryAddress = spec.params.registrar;

  // Get addresses of initial validators
  let initialValidators = process.env.INITIAL_VALIDATORS.split(',');
  for (let i = 0; i < initialValidators.length; i++) {
    initialValidators[i] = initialValidators[i].trim();
  }

  // Swap first and second validators (to emulate the same situation on xDai)
  const firstValidator = initialValidators[0];
  initialValidators[0] = initialValidators[1];
  initialValidators[1] = firstValidator;

  // Compile contracts
  const poaContractsDir = __dirname + '/../poa-contracts/';
  const validatorSetCompiled = await compile(poaContractsDir, 'ValidatorSet');
  const blockRewardCompiled = await compile(poaContractsDir, 'BlockReward');
  const certifierCompiled = await compile(poaContractsDir, 'Certifier');
  const registryCompiled = await compile(poaContractsDir, 'Registry');

  // Build ValidatorSet contract
  let contract = new web3.eth.Contract(validatorSetCompiled.abi);
  let deploy = await contract.deploy({data: validatorSetCompiled.bytecode, arguments: [
    initialValidators
  ]});
  spec.accounts[validatorSetAddress] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };

  // Build BlockReward contract
  contract = new web3.eth.Contract(blockRewardCompiled.abi);
  spec.accounts[blockRewardAddress] = {
    balance: '0',
    constructor: blockRewardCompiled.bytecode
  };

  // Build Certifier contract
  contract = new web3.eth.Contract(certifierCompiled.abi);
  deploy = await contract.deploy({data: certifierCompiled.bytecode, arguments: [
    [process.env.OWNER]
  ]});
  spec.accounts[certifierAddress] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };

  // Build Registry contract
  contract = new web3.eth.Contract(registryCompiled.abi);
  deploy = await contract.deploy({data: registryCompiled.bytecode, arguments: [
    certifierAddress,
    process.env.OWNER
  ]});
  spec.accounts[registryAddress] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };

  // Save spec.json
  await promisify(fs.writeFile)(__dirname + '/../parity-data/spec.json', JSON.stringify(spec, null, '  '), 'UTF-8');
}

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

main();
