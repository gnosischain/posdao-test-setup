const fs = require('fs');
const path = require('path');

const expect = require('chai')
    .use(require('chai-as-promised'))
    .expect;

const node0Path = '../parity-data/node0/';
const blocks_fname = path.join(__dirname, `${node0Path}blocks.log`);
const check_fname = path.join(__dirname, `${node0Path}check.log`);

describe('Check log of ordinary node to find block sync issues', () => {
    it('parity-data/node0/check.log file should be empty', async () => {
        let fcontent = fs.readFileSync(check_fname, 'utf8').trim();
        expect(fcontent.length == 0, `Ordinary node had some block sync issue, check ${check_fname} for log`).to.equal(true);
    });
    it('parity-data/node0/blocks.log file should not be empty', async () => {
        let fcontent = fs.readFileSync(blocks_fname, 'utf8').trim();
        expect(fcontent.length != 0, `blocks.log file is empty. Seems the watchOrdinaryNode.js script did not work`).to.equal(true);
    });
});
