const mongoose = require('mongoose');

const alergiSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    keyword: { type: String },
    category: { type: String },
    coding_system: { type: String, required: true },
}, { strict: false });

module.exports = mongoose.model('Alergi', alergiSchema);
