const mongoose = require('mongoose');
const crypto = require('crypto');
const Encounter = require("../modelsMongoose/Encounter");
const Location = require("../modelsMongoose/Location");
const { satu_sehat_encounter, satu_sehat_mapping_lokasi_ralan, satu_sehat_mapping_lokasi_ranap, resume_pasien_ranap, bangsal, poliklinik, reg_periksa, kamar_inap, kamar, pasien, kelurahan, kecamatan, kabupaten, propinsi, pegawai, referensi_mobilejkn_bpjs_taskid, diagnosa_pasien, penyakit } = require("../models");
const { Op } = require("sequelize");
const { fetchSatusehat, fetchSatusehatBatch } = require("../helpersfetch/satusehat");
const { getPractitioner , getPatient } = require("./identitas");

async function kirimEncounter(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    console.log(dateFormatted);
    let notIn = await blukEncounter(dateFormatted);
    let dataReg = await reg_periksa.findAll({
        where: {
            tgl_registrasi: date,
            no_rawat: {
                [Op.notIn]: notIn
            },
            stts: {
                [Op.not]: 'batal'
            }
        },
        attributes: ['no_rawat', 'no_rkm_medis', 'kd_dokter', 'kd_poli', 'status_lanjut', 'tgl_registrasi', 'jam_reg'],
        include: [{
            model: pasien,
            as: 'pasien',
            attributes: ['no_ktp', 'nm_pasien']
        },
        {
            model: pegawai,
            as: 'pegawai',
            attributes: ['nama', 'no_ktp'],
        }, {
            model: satu_sehat_mapping_lokasi_ralan,
            as: 'satu_sehat_mapping_lokasi_ralan',
            attributes: ['id_organisasi_satusehat', 'id_lokasi_satusehat'],
            required: true,
        }, {
            model: poliklinik,
            as: 'poliklinik',
            attributes: ['kd_poli', 'nm_poli']
        }
        ],
    })
    let bundel = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": []
    }
    for (let x of dataReg) {

        let ihsPasen = await getPatient(x.pasien.no_ktp, 'id name')
        if (!ihsPasen) {
            console.log("pasien tidak ada")
            continue
        }
        let dataEncounter = await getEncounter(ihsPasen.id, x.no_rawat)
        if (dataEncounter) {
            console.log(dataEncounter)
            console.log("encounter sudah ada")
            continue
        }
        let ihsPetugas = await getPractitioner(x.pegawai.no_ktp, 'id name')
        if (!ihsPetugas) {
            console.log(x.pegawai)
            console.log("petugas tidak ada")
            return
            // continue
        }
        let datetime = new Date(x.dataValues.tgl_registrasi + "T" + x.dataValues.jam_reg + ".000Z").toISOString();
        let newEncounter = {
            "resourceType": "Encounter",
            "status": "arrived",
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "AMB",
                "display": "ambulatory"
            },
            "subject": {
                "reference": "Patient/" + ihsPasen.id,
                "display": x.pasien.nm_pasien
            },
            "participant": [
                {
                    "type": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                                    "code": "ATND",
                                    "display": "attender"
                                }
                            ]
                        }
                    ],
                    "individual": {
                        "reference": "Practitioner/" + ihsPetugas.id,
                        "display": ihsPetugas.name[0].text
                    }
                }
            ],
            "period": {
                "start": datetime,
                "end": datetime
            },
            "location": [
                {
                    "location": {
                        "reference": "Location/" + x.dataValues.satu_sehat_mapping_lokasi_ralan.id_lokasi_satusehat,
                        "display": x.dataValues.poliklinik.nm_poli
                    }
                }
            ],
            "statusHistory": [
                {
                    "status": "arrived",
                    "period": {
                        "start": datetime,
                        "end": datetime
                    }
                }
            ],
            "serviceProvider": {
                "reference": "Organization/" + process.env.Organization_id_SATUSEHAT
            },
            "identifier": [
                {
                    "system": "http://sys-ids.kemkes.go.id/encounter/" + process.env.Organization_id_SATUSEHAT,
                    "value": x.dataValues.no_rawat
                }
            ]
        }
        if (x.dataValues.kd_poli == 'IGDK') {
            newEncounter.class.code = "EMER"
            newEncounter.class.display = "emergency"
        }
        if (x.dataValues.status_lanjut == 'Ranap') {
            newEncounter.class.code = "IMP"
            newEncounter.class.display = "inpatient encounter"
        }
        const encounterEntry = {
            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
            "resource": newEncounter,
            "request": {
                "method": "POST",
                "url": "Encounter"
            }
        };
        bundel.entry.push(encounterEntry);
    }
    console.log(bundel.entry.length);
    if (bundel.entry.length > 0) {
        let kirimBundle = await fetchSatusehatBatch("POST", bundel);
        if (kirimBundle.error) {
            console.log(kirimBundle.error);
            return
        }
        for (let i = 0; i < bundel.entry.length; i++) {
            let data = bundel.entry[i].resource;
            data.id = kirimBundle.entry[i].response.resourceID;
            let x = await Encounter.create(data)
            console.log(x)
            // await Encounter.create(kirimBundle);
        }
    }

    return
    // mongoose.disconnect();
}

async function getEncounter(subject, identifier, attributes) {
    let isexist = await Encounter.findOne({
        'identifier.value': identifier,
        'subject.reference': `Patient/${subject}`,
    }, attributes)
    if (isexist) {
        return isexist
    }
    let cariEncounter = await fetchSatusehat("GET", `/Encounter?subject=${subject}&identifier=${identifier}`)
    if (cariEncounter.total > 0) {
        let dataEncounter = await Encounter.create(cariEncounter.entry[0].resource);
        console.log(dataEncounter)
        return dataEncounter
    }
    return false
}
async function blukEncounter(noRawat) {
    let isexist = await Encounter.find({
        'identifier.value': { $regex: noRawat, $options: 'i' }
    }, 'identifier')
    if (isexist) {
        let dataEncounter = isexist.map(encounter => encounter.identifier.map(identifier => identifier.value).reduce((acc, cur) => acc.concat(cur),));
        return dataEncounter
    }
    return [];
}
// kirimEncounter('x')
module.exports = { 
    kirimEncounter,
    blukEncounter
 }