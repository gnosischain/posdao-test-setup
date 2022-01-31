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
  
  // Modify docker-compose.yml
  //const dockerComposeYmlPath = `${launcherDir}/docker-compose.yml`;
  //let dockerComposeYmlContent = fs.readFileSync(dockerComposeYmlPath, 'utf8');
  //dockerComposeYmlContent = dockerComposeYmlContent.replace('node:', `node:
  //  extra_hosts:
  //    - "host.docker.internal:host-gateway"`);
  //dockerComposeYmlContent = dockerComposeYmlContent.replace('validator-import:', `validator-import:
  //  extra_hosts:
  //    - "host.docker.internal:host-gateway"`);
  //dockerComposeYmlContent = dockerComposeYmlContent.replace('validator:', `validator:
  //  extra_hosts:
  //    - "host.docker.internal:host-gateway"`);
  //fs.writeFileSync(dockerComposeYmlPath, dockerComposeYmlContent, 'utf8');

  // Create launcher/.env
  let dotEnvContent = `
XDAI_RPC_URL=http://localhost:8640,http://localhost:8641
PUBLIC_IP=127.0.0.1
LOG_LEVEL=trace
  `;
  fs.writeFileSync(`${launcherDir}/.env`, dotEnvContent.trim(), 'utf8');

  // Clear launcher/config/boot_enr.yaml
  // fs.writeFileSync(`${launcherDir}/config/boot_enr.yaml`, '', 'utf8');

  // Remove default launcher/config/boot_enr.yaml
  fs.unlinkSync(`${launcherDir}/config/boot_enr.yaml`);

  // Rewrite launcher/config/deploy_block.txt
  const deployBlock = fs.readFileSync(`${contractsDir}/deploy_block.txt`, 'utf8');
  fs.writeFileSync(`${launcherDir}/config/deploy_block.txt`, deployBlock, 'utf8');

  // Modify launcher/config/config.yaml
  const configYamlPath = `${launcherDir}/config/config.yaml`;
  const numberOfValidators = calcNumberOfValidators();
  const chainId = await web3.eth.getChainId();
  const netId = await web3.eth.net.getId();
  const depositContractAddress = fs.readFileSync(`${contractsDir}/deposit_contract_address.txt`, 'utf8');
  let configYamlContent = fs.readFileSync(configYamlPath, 'utf8');
  configYamlContent = configYamlContent.replace(/DEPOSIT_CONTRACT_ADDRESS: [a-fA-F0-9x]+/, `DEPOSIT_CONTRACT_ADDRESS: ${depositContractAddress}`);
  configYamlContent = configYamlContent.replace(/DEPOSIT_CHAIN_ID: [a-fA-F0-9x]+/, `DEPOSIT_CHAIN_ID: ${chainId}`);
  configYamlContent = configYamlContent.replace(/DEPOSIT_NETWORK_ID: [a-fA-F0-9x]+/, `DEPOSIT_NETWORK_ID: ${netId}`);
  configYamlContent = configYamlContent.replace(/MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: [a-fA-F0-9x]+/, `MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: ${numberOfValidators}`);
  configYamlContent = configYamlContent.replace(/ETH1_FOLLOW_DISTANCE: [a-fA-F0-9x]+/, 'ETH1_FOLLOW_DISTANCE: 8');
  configYamlContent = configYamlContent.replace(/SECONDS_PER_ETH1_BLOCK: [a-fA-F0-9x]+/, 'SECONDS_PER_ETH1_BLOCK: 4');
  configYamlContent = configYamlContent.replace(/GENESIS_DELAY: [a-fA-F0-9x]+/, 'GENESIS_DELAY: 15');
  configYamlContent = configYamlContent.replace(/GENESIS_FORK_VERSION: [a-fA-F0-9x]+/, `GENESIS_FORK_VERSION: ${web3.utils.padLeft(web3.utils.toHex(chainId), 8)}`);
  configYamlContent = configYamlContent.replace(/ALTAIR_FORK_VERSION: [a-fA-F0-9x]+/, `ALTAIR_FORK_VERSION: ${web3.utils.padLeft(web3.utils.toHex(chainId + 0x01000000), 8)}`);
  fs.writeFileSync(configYamlPath, configYamlContent, 'utf8');

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
