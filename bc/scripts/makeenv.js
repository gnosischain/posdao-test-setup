const fs = require('fs');

async function main() {
  const content = `
XDAI_RPC_URL=http://localhost:8540
PUBLIC_IP=127.0.0.1
LOG_LEVEL=info
  `;
  fs.writeFileSync(`${__dirname}/../nodes/.env`, content.trim(), 'utf8')
}

main();
