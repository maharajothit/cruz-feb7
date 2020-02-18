const crypto = require('crypto');
module.exports = {
    id_key: () => {
        return crypto.randomBytes(4).readUInt32BE(0, true);
    },
    id: (name) => {
        return `${name}`+crypto.randomBytes(20).toString('hex');
    }
}