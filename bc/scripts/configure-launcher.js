const fs = require('fs');
const calcNumberOfValidators = require('./calc-validators-number.js');
const Web3 = require('web3');
const web3 = new Web3('http://localhost:8541');

async function main() {
  const contractsDir = `${__dirname}/../contracts`;
  const launcherDir = `${__dirname}/../launcher`;
  const dockerComposeYmlPath = `${launcherDir}/docker-compose.yml`;

  // Modify docker-compose.yml
  let dockerComposeYmlContent = fs.readFileSync(dockerComposeYmlPath, 'utf8');
  dockerComposeYmlContent = dockerComposeYmlContent.replace('validator-import:', `validator-import:
    extra_hosts:
      - "host.docker.internal:host-gateway"`);
  fs.writeFileSync(dockerComposeYmlPath, dockerComposeYmlContent, 'utf8');

  // Create .env
  const dotEnvContent = `
XDAI_RPC_URL=http://host.docker.internal:8540
PUBLIC_IP=127.0.0.1
LOG_LEVEL=info
  `;
  fs.writeFileSync(`${launcherDir}/.env`, dotEnvContent.trim(), 'utf8');

  // Clear config/boot_enr.yaml
  // fs.writeFileSync(`${launcherDir}/config/boot_enr.yaml`, '', 'utf8');

  // Remove default config/boot_enr.yaml
  fs.unlinkSync(`${launcherDir}/config/boot_enr.yaml`);

  // Rewrite config/deploy_block.txt
  const deployBlock = fs.readFileSync(`${contractsDir}/deploy_block.txt`, 'utf8');
  fs.writeFileSync(`${launcherDir}/config/deploy_block.txt`, deployBlock, 'utf8');

  // Modify config/config.yaml
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
  fs.writeFileSync(configYamlPath, configYamlContent, 'utf8');
  // ...
}

main();
