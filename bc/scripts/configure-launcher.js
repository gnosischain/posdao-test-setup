const fs = require('fs');

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
  // ...
}

main();
