const mongoose = require('mongoose');

const radiologiSchema = new mongoose.Schema({
	kategoriKelompokPemeriksaan: { type: String, trim: true },
	namaPemeriksaan: { type: String, required: true, trim: true },
	permintaanHasil: { type: String, trim: true },
	code: { type: String, trim: true },
	display: { type: String, trim: true },
	component: { type: mongoose.Schema.Types.Mixed },
	property: { type: String, trim: true },
	timing: { type: mongoose.Schema.Types.Mixed },
	system: { type: String, trim: true },
	scale: { type: String, trim: true },
	method: { type: String, trim: true },
	unitOfMeasure: { type: String, trim: true },
	codeSystem: { type: String, trim: true },
	bodySiteCode: { type: String, trim: true },
	bodySiteDisplay: { type: String, trim: true },
	bodySiteCodeSystem: { type: String, trim: true },
	versionFirstReleased: { type: String, trim: true },
	versionLastChanged: { type: String, trim: true },
	firstReleasedDate: { type: Date },
	lastChangedDate: { type: Date }
}, { versionKey: false });

module.exports = mongoose.model('Radiologi', radiologiSchema);
