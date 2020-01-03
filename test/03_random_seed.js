const fs = require('fs');
const path = require('path');

const expect = require('chai')
    .use(require('chai-as-promised'))
    .expect;

const node1Path = '../parity-data/node1';
const seed_fname = path.join(__dirname, `${node1Path}/checkRandomSeed.log`);
const seed_debug_fname = path.join(__dirname, `${node1Path}/checkRandomSeedDebug.log`);

describe('Check log of random seeds to find incorrect seed values', () => {
    it(`file ${seed_fname} should be empty`, async () => {
        const fcontent = fs.readFileSync(seed_fname, 'utf8').trim();
        expect(fcontent.length == 0, `There were errors in seed calculation, check ${path.basename(seed_fname)} for logs`).to.equal(true);
    });
    it(`file ${seed_debug_fname} should not be empty`, async () => {
        const fcontent = fs.readFileSync(seed_debug_fname, 'utf8').trim();
        expect(fcontent.length != 0, `${path.basename(seed_debug_fname)} file is empty. Seems the watchRandomSeed.js script did not work`).to.equal(true);
    });
});
