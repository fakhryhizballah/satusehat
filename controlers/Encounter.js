const mongoose = require('mongoose');
// const Encounter = require("../modelsMongoose/Encounter");
// const Location = require("../modelsMongoose/Location");
// const { satu_sehat_encounter, satu_sehat_mapping_lokasi_ralan, satu_sehat_mapping_lokasi_ranap, resume_pasien_ranap, bangsal, poliklinik, reg_periksa, kamar_inap, kamar, pasien, kelurahan, kecamatan, kabupaten, propinsi, pegawai, referensi_mobilejkn_bpjs_taskid, diagnosa_pasien, penyakit } = require("../models");
// const { Op } = require("sequelize");
const { getPractitioner , getPatient } = require("./identitas");

async function kirimEncounter(params) {
    let ihsPetugas = await getPractitioner('617105111198007', 'id name')
    console.log(ihsPetugas)
    
}
// kirimEncounter('x')
module.exports = { 
    kirimEncounter
 }