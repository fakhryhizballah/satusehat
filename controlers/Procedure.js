const { ClinicalProcedure } = require('../template/Procedure');
const Encounter = require("../modelsMongoose/Encounter");
const Procedure = require("../modelsMongoose/Procedure");
const { diagnosa_pasien, penyakit } = require("../models");
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");

async function kirimICD9(date) {
    const encounters = await Encounter.find({
        'identifier.value': { $regex: new RegExp(`^${dateFormatted}`) },
        'diagnosis': { '$exists': false }
    }, 'identifier subject id');
    console.log("Total Encounter:", encounters.length);
}
