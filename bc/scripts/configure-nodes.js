const fs = require('fs');

async function main() {
  const nodesDir = `${__dirname}/../nodes`;
  const dockerComposeYmlPath = `${nodesDir}/docker-compose.yml`;

  let dockerComposeYmlContent = fs.readFileSync(dockerComposeYmlPath, 'utf8');
  dockerComposeYmlContent = dockerComposeYmlContent.replace('validator-import:', `validator-import:
    extra_hosts:
      - "host.docker.internal:host-gateway"`);
  fs.writeFileSync(dockerComposeYmlPath, dockerComposeYmlContent, 'utf8');

  const dotEnvContent = `
XDAI_RPC_URL=http://host.docker.internal:8540
PUBLIC_IP=127.0.0.1
LOG_LEVEL=info
  `;
  fs.writeFileSync(`${nodesDir}/.env`, dotEnvContent.trim(), 'utf8')
}

main();
