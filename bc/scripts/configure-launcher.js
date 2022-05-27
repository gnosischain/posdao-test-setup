const fs = require('fs');
const os = require('os');
const calcNumberOfValidators = require('./calc-validators-number.js');
const constants = require('../../utils/constants');
const Web3 = require('web3');
const web3 = new Web3('http://localhost:8641');

async function main() {
  const contractsDir = `${__dirname}/../contracts`;
  const launcherDir = `${__dirname}/../launcher`;
  const depositScriptDir = `${__dirname}/../deposit-script`;

  // Add host.docker.internal to docker-compose.yml for Linux
  if (os.platform() === 'linux') {
    const dockerComposeYmlPath = `${launcherDir}/docker-compose.yml`;
    let dockerComposeYmlContent = fs.readFileSync(dockerComposeYmlPath, 'utf8');
    dockerComposeYmlContent = dockerComposeYmlContent.replace('node:', `node:
    extra_hosts:
      - "host.docker.internal:host-gateway"`);
    dockerComposeYmlContent = dockerComposeYmlContent.replace('node2:', `node2:
    extra_hosts:
      - "host.docker.internal:host-gateway"`);
    fs.writeFileSync(dockerComposeYmlPath, dockerComposeYmlContent, 'utf8');
  }

  // Create launcher/config/deploy_block.txt, launcher/config2/deploy_block.txt
  const deployBlock = fs.readFileSync(`${contractsDir}/deploy_block.txt`, 'utf8');
  fs.writeFileSync(`${launcherDir}/config/deploy_block.txt`, deployBlock, 'utf8');
  fs.writeFileSync(`${launcherDir}/config2/deploy_block.txt`, deployBlock, 'utf8');

  // Modify launcher/config/config.yaml, launcher/config2/config.yaml
  const configYamlPath = `${launcherDir}/config/config.yaml`;
  const config2YamlPath = `${launcherDir}/config2/config.yaml`;
  const numberOfValidators = calcNumberOfValidators();
  const chainId = await web3.eth.getChainId();
  const netId = await web3.eth.net.getId();
  const depositContractAddress = fs.readFileSync(`${contractsDir}/deposit_contract_address.txt`, 'utf8');
  let configYamlContent = fs.readFileSync(configYamlPath, 'utf8');
  configYamlContent = configYamlContent.replace(/DEPOSIT_CONTRACT_ADDRESS: [a-fA-F0-9x]+/, `DEPOSIT_CONTRACT_ADDRESS: ${depositContractAddress}`);
  configYamlContent = configYamlContent.replace(/DEPOSIT_CHAIN_ID: [a-fA-F0-9x]+/, `DEPOSIT_CHAIN_ID: ${chainId}`);
  configYamlContent = configYamlContent.replace(/DEPOSIT_NETWORK_ID: [a-fA-F0-9x]+/, `DEPOSIT_NETWORK_ID: ${netId}`);
  configYamlContent = configYamlContent.replace(/MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: [a-fA-F0-9x]+/, `MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: ${numberOfValidators}`);
  configYamlContent = configYamlContent.replace(/GENESIS_FORK_VERSION: [a-fA-F0-9x]+/, `GENESIS_FORK_VERSION: ${web3.utils.padLeft(web3.utils.toHex(chainId), 8)}`);
  configYamlContent = configYamlContent.replace(/ALTAIR_FORK_VERSION: [a-fA-F0-9x]+/, `ALTAIR_FORK_VERSION: ${web3.utils.padLeft(web3.utils.toHex(chainId + 0x01000000), 8)}`);
  fs.writeFileSync(configYamlPath, configYamlContent, 'utf8');
  fs.writeFileSync(config2YamlPath, configYamlContent, 'utf8');

  // Create key and enr.dat files in launcher/node_db/beacon/network directory
  const node1NetworkDir = `${launcherDir}/node_db/beacon/network`;
  const node1ENR = 'enr:-Ly4QHa-nybnrkWwqvyhviWZGXYpoKIcFDOptvMh9lU44NFXHximNNyU4UYVxe9VM1bR4ueQ9w8mYacWPWQHWQUl3FIBh2F0dG5ldHOIAAAAAAAAAACEZXRoMpDxAPPaAQBkZAACAAAAAAAAgmlkgnY0gmlwhKwRAAGJc2VjcDI1NmsxoQOMGR7bRyjn3WtDVB13geF1AO4tYn3fb3b4zN5LjD31sYhzeW5jbmV0cwCDdGNwgjLIg3VkcIIu4A';
  fs.mkdirSync(node1NetworkDir, { recursive: true });
  fs.writeFileSync(`${node1NetworkDir}/key`, Buffer.from('a970f0c1' + 'a3ffbcc3' + '8a88e985' + 'f68c3f9e' + 'ff52cfb3' + 'cf876ddc' + 'e5ec65ce' + '22c4d0d3', 'hex'), 'binary');
  //fs.writeFileSync(`${node1NetworkDir}/enr.dat`, node1ENR, 'utf8');
  // ENR details:
  // ip: 172.17.0.1
  // tcp: 13000
  // udp: 12000
  // node id: 74cc1f1aebfc4b956187b0190b2f5e2f3cbd864eaa2c642e3769c1582361caf6
  // peer id: 16Uiu2HAmN5seNB3AYkTo4qRC3oWsPTEGiR68w5suCcuqG3pSf4Ze

  // Create key and enr.dat files in launcher/node2_db/beacon/network directory
  const node2NetworkDir = `${launcherDir}/node2_db/beacon/network`;
  const node2ENR = 'enr:-Ly4QFlxKuaMr8x7s-DYmdEIwCmezmusanK8nXgD3XEitHPLRtxvCNFpTWBL3Z4MnjEVb9cgZL7abu3D_IlFPqV3J5ABh2F0dG5ldHOIAAAAAAAAAACEZXRoMpDxAPPaAQBkZAACAAAAAAAAgmlkgnY0gmlwhKwRAAGJc2VjcDI1NmsxoQNwC21AnKIefXbvJERML-wwByE96eH1xRcPG8kdgeD0AIhzeW5jbmV0cwCDdGNwgjLJg3VkcIIu4Q';
  fs.mkdirSync(node2NetworkDir, { recursive: true });
  fs.writeFileSync(`${node2NetworkDir}/key`, Buffer.from('c00282b9' + '1d8eec3e' + '4dbd7e7f' + '51662f0b' + 'c540dff8' + 'e71ac862' + 'c80aa2c7' + 'f676be82', 'hex'), 'binary');
  //fs.writeFileSync(`${node2NetworkDir}/enr.dat`, node2ENR, 'utf8');
  // ENR details:
  // ip: 172.17.0.1
  // tcp: 13001
  // udp: 12001
  // node id: 2e31221cfbc6e3aeba53637eaa94b687d3f9552a453b81b2834ca53778980dc0
  // peer id: 16Uiu2HAmLCN7qTEBuknCa6R7thyTdUjALjYTpkSsrHhq3FKEL5q9

  // Create launcher/config/boot_enr.yaml, launcher/config2/boot_enr.yaml
  //fs.writeFileSync(`${launcherDir}/config/boot_enr.yaml`, `- "${node2ENR}"`, 'utf8');
  //fs.writeFileSync(`${launcherDir}/config2/boot_enr.yaml`, `- "${node1ENR}"`, 'utf8');

  // Create deposit-script/.env
  const localhost = os.platform() === 'darwin' ? 'host.docker.internal' : 'localhost';
  const ownerKeystoreJson = require(`${__dirname}/../../accounts/keystore/${web3.utils.stripHexPrefix(constants.OWNER)}.json`);
  const ownerKeystorePassword = fs.readFileSync(`${__dirname}/../../config/password`, 'utf8').trim();
  const ownerPrivateKey = web3.eth.accounts.decrypt(ownerKeystoreJson, ownerKeystorePassword).privateKey;
  const tokenContractAddress = fs.readFileSync(`${contractsDir}/token_contract_address.txt`, 'utf8');
  fs.mkdirSync(depositScriptDir);
  dotEnvContent = `
STAKING_ACCOUNT_PRIVATE_KEY=${ownerPrivateKey}
RPC_URL=http://${localhost}:8640
GAS_PRICE=0
BATCH_SIZE=64
N=${numberOfValidators}
OFFSET=0
META_TOKEN_ADDRESS=${tokenContractAddress}
DEPOSIT_CONTRACT_ADDRESS=${depositContractAddress}
START_BLOCK_NUMBER=${deployBlock}
  `;
  fs.writeFileSync(`${depositScriptDir}/.env`, dotEnvContent.trim(), 'utf8');

  // Copy deposit_data*.json file
  const validatorKeysPath = `${launcherDir}/keys/validator_keys`;
  const validatorKeysList = fs.readdirSync(validatorKeysPath);
  const depositDataFile = validatorKeysList.find(item => {
    return item.match(/deposit_data.*\.json/ig);
  });
  fs.copyFileSync(`${validatorKeysPath}/${depositDataFile}`, `${depositScriptDir}/deposit_data.json`);
}

main();
