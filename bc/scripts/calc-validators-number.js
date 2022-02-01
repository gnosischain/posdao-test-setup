const fs = require('fs');

module.exports = function () {
    let keysPath;
    let fileList;
    try {
        keysPath = `${__dirname}/../keys/validator_keys`;
        fileList = fs.readdirSync(keysPath);
    } catch (e) {
        keysPath = `${__dirname}/../launcher/keys/validator_keys`;
        fileList = fs.readdirSync(keysPath);
    }
    const depositDataFile = fileList.find(item => {
        return item.match(/deposit_data.*\.json/ig);
    });
    const depositData = JSON.parse(fs.readFileSync(`${keysPath}/${depositDataFile}`, 'utf8'));
    return depositData.length;
}
