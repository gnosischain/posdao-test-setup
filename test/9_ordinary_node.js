const fs = require('fs');
const path = require('path');

const expect = require('chai')
    .use(require('chai-as-promised'))
    .expect;

const node0Path = '../parity-data/node0';
const node1Path = '../parity-data/node1';
const blocks_fname = path.join(__dirname, `${node0Path}/blocks.log`);
const check_fname = path.join(__dirname, `${node0Path}/check.log`);
const seed_fname = path.join(__dirname, `${node1Path}/checkRandomSeed.log`);

describe('Check log of ordinary node to find block sync issues', () => {
    it(`file ${check_fname} should be empty`, async () => {
        let fcontent = fs.readFileSync(check_fname, 'utf8').trim();
        expect(fcontent.length == 0, `Ordinary node had some block sync issue, check ${check_fname} for logs`).to.equal(true);
    });
    it(`file ${blocks_fname} should not be empty`, async () => {
        let fcontent = fs.readFileSync(blocks_fname, 'utf8').trim();
        expect(fcontent.length != 0, `blocks.log file is empty. Seems the watchOrdinaryNode.js script did not work`).to.equal(true);
    });
});

describe('Check log of random seeds to find incorrect seed values', () => {
    it(`file ${seed_fname} should be empty`, async () => {
        let fcontent = fs.readFileSync(seed_fname, 'utf8').trim();
        expect(fcontent.length == 0, `There were errors in seed calculation, check ${seed_fname} for logs`).to.equal(true);
    });
});
