const mongoose = require('mongoose');

const Icd10Schema = new mongoose.Schema({
    CODE: {
        type: String,
        unique: true
    }
}, { strict: false, versionKey: false });

module.exports = mongoose.model('Icd10', Icd10Schema);
