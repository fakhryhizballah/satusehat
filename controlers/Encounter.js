const mongoose = require('mongoose');
const crypto = require('crypto');
const Encounter = require("../modelsMongoose/Encounter");
const Location = require("../modelsMongoose/Location");
const { bangsal, poliklinik, reg_periksa, kamar_inap, kamar, pasien, kelurahan, kecamatan, kabupaten, propinsi, pegawai, referensi_mobilejkn_bpjs_taskid, diagnosa_pasien, penyakit } = require("../models");
const { Op } = require("sequelize");
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");
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
        }
        ],
    })
    let bundel = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": []
    }
    let pasienNotExist = 0;
    for (let x of dataReg) {

        let ihsPasen = await getPatient(x.pasien.no_ktp, 'id name')
        if (!ihsPasen) {
            pasienNotExist++
            console.log("pasien tidak ada", pasienNotExist)
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
        let findLocation = await Location.findOne({
            'identifier.value': x.dataValues.kd_poli
        }, 'name id')
        if (!findLocation) {
            console.log(x.dataValues.kd_poli);
            console.log("location tidak ada")
            continue
        }
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
                        "reference": "Location/" + findLocation.id,
                        "display": findLocation.name
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
        console.log("data yang akan dikirim :", bundel.entry.length, "dari total data:", dataReg.length);
    }
    console.log(bundel.entry.length);
    if (bundel.entry.length > 0) {
        let kirimBundle = await fetchSatusehatBatch("POST", bundel).catch((err) => {
            console.log(JSON.stringify(err, null, 2));
            return
        });
        console.log(kirimBundle);
        if (kirimBundle.total == 0) {
            console.log(kirimBundle.error);
            // throw new Error(kirimBundle.error);
            return
        }
        for (let i = 0; i < bundel.entry.length; i++) {
            let data = bundel.entry[i].resource;
            data.id = kirimBundle.entry[i].response.resourceID;
            let x = await Encounter.create(data).catch(err => console.log(err));
            // console.log(x)
        }
    }
    console.log("selesai", "pasien tidak ada", pasienNotExist, "data yang akan dikirim :", bundel.entry.length, "dari total data:", dataReg.length);

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
async function updateEncounter(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    let dataEncounter = await Encounter.find({
        'identifier.value': { $regex: dateFormatted, $options: 'i' },
        'status': { $ne: 'finished' },
        'class.code': 'AMB'
    });
    console.log(`Found ${dataEncounter.length} encounters to update`);

    const taskIdToStatus = {
        '1': 'arrived',
        '2': 'arrived',
        '3': 'arrived',
        '4': 'in-progress',
        '5': 'finished',
        '6': 'finished',
        '7': 'finished'
    };

    for (let encounter of dataEncounter) {
        try {
            let noRawat = encounter.identifier[0].value;
            let taskRecords = await referensi_mobilejkn_bpjs_taskid.findAll({
                where: {
                    no_rawat: noRawat
                },
                attributes: ['taskid', 'waktu'],
                order: [['waktu', 'ASC']]
            });

            if (taskRecords.length < 2) {
                console.log(`No sufficient task records for ${noRawat}`);
                continue;
            }
            console.log(`Updating encounter for ${noRawat}`);

            let waktuStart = taskRecords[0].dataValues.waktu;
            let waktuEnd = taskRecords[taskRecords.length - 1].dataValues.waktu;

            let statusHistory = [];
            for (let i = 0; i < taskRecords.length - 1; i++) {
                const status = taskIdToStatus[taskRecords[i].dataValues.taskid] || 'arrived';
                statusHistory.push({
                    period: {
                        start: waktuStart,
                        end: taskRecords[i + 1].dataValues.waktu
                    },
                    status: status
                });
            }

            statusHistory.push({
                period: {
                    start: waktuEnd,
                    end: waktuEnd
                },
                status: 'finished'
            });

            encounter.status = 'finished';
            encounter.period = {
                start: waktuStart,
                end: waktuEnd
            };
            encounter.statusHistory = statusHistory;
            const patchData = [
                {
                    "op": "replace",
                    "path": "/status",
                    "value": "finished"
                },
                {
                    "op": "replace",
                    "path": "/statusHistory",
                    "value": statusHistory
                },
                {
                    "op": "replace",
                    "path": "/period",
                    "value": {
                        "start": waktuStart,
                        "end": waktuEnd
                    }
                }
            ];
            let updatePatch = await fetchSatusehatPatch("PATCH", `Encounter/${encounter.id}`, patchData);
            if (updatePatch.total == 0) {
                console.log(`Failed to update encounter for ${noRawat}`);
                continue;
            }
            let updateDataEndounter = await Encounter.findByIdAndUpdate(
                encounter._id,
                {
                    status: 'finished',
                    period: encounter.period,
                    statusHistory: encounter.statusHistory
                },
                { new: true }
            );
            console.log(`Updated encounter ${noRawat}`);
        } catch (err) {
            console.log(`Error updating encounter: ${err.message}`);
        }

    }
    console.log("Selesai Update Encounter Rawat Jalan " + date);
    return
}
async function updateEncounterRanap(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    let dataEncounter = await Encounter.find({
        'identifier.value': { $regex: dateFormatted, $options: 'i' },
        'status': { $ne: 'finished' },
        'class.code': 'IMP'
    });
    console.log(dateFormatted);
    console.log(`Found ${dataEncounter.length} encounters to update`);

    for (let encounter of dataEncounter) {
        try {
            let noRawat = encounter.identifier[0].value;
            let kamarData = await kamar_inap.findOne({
                where: {
                    no_rawat: noRawat,
                    stts_pulang: { [Op.notIn]: ['-', 'Pindah Kamar'] }
                },
                attributes: ['tgl_masuk', 'jam_masuk', 'tgl_keluar', 'jam_keluar', 'kd_kamar'],
                include: [{
                    model: kamar,
                    as: 'kode_kamar',
                    attributes: ['kd_kamar', 'kd_bangsal']
                }]
            });

            if (!kamarData) {
                console.log(`No kamar_inap data found for ${noRawat}`);
                continue;
            }

            let startDateTime = new Date(kamarData.dataValues.tgl_masuk + "T" + kamarData.dataValues.jam_masuk + ".000Z").toISOString();
            let endDateTime = kamarData.dataValues.tgl_keluar && kamarData.dataValues.jam_keluar
                ? new Date(kamarData.dataValues.tgl_keluar + "T" + kamarData.dataValues.jam_keluar + ".000Z").toISOString()
                : startDateTime;

            let locationPatch = null;
            let kodeKamar = kamarData.dataValues.kd_kamar;
            let mappingLokasi = await Location.find({
                'identifier.value': kodeKamar
            });

            if (mappingLokasi) {
                locationPatch = {
                    "op": "add",
                    "path": "/location/-",
                    "value": {
                        "location": {
                            "reference": "Location/" + mappingLokasi[0].id,
                            "display": mappingLokasi[0].description
                        }
                    }
                };
            }

            let statusHistory = [
                {
                    status: "arrived",
                    period: {
                        start: encounter.period.start,
                        end: encounter.period.end
                    }
                },
                {
                    status: "in-progress",
                    period: {
                        start: encounter.period.end,
                        end: kamarData.dataValues.tgl_keluar && kamarData.dataValues.jam_keluar ? endDateTime : startDateTime
                    }
                }
            ];

            if (kamarData.dataValues.tgl_keluar && kamarData.dataValues.jam_keluar) {
                statusHistory.push({
                    status: "finished",
                    period: {
                        start: endDateTime,
                        end: endDateTime
                    }
                });
            }

            let newStatus = kamarData.dataValues.tgl_keluar && kamarData.dataValues.jam_keluar ? 'finished' : 'in-progress';

            const patchData = [
                {
                    "op": "replace",
                    "path": "/status",
                    "value": newStatus
                },
                {
                    "op": "replace",
                    "path": "/period",
                    "value": {
                        "start": startDateTime,
                        "end": endDateTime
                    }
                },
                {
                    "op": "replace",
                    "path": "/statusHistory",
                    "value": statusHistory
                }
            ];

            if (locationPatch) {
                patchData.push(locationPatch);
            }

            let updatePatch = await fetchSatusehatPatch("PATCH", `Encounter/${encounter.id}`, patchData);
            if (updatePatch.total == 0) {
                console.log(`Failed to update encounter for ${noRawat}`);
                continue;
            }

            let updateDataEncounter = await Encounter.findByIdAndUpdate(
                encounter._id,
                {
                    status: newStatus,
                    period: {
                        start: startDateTime,
                        end: endDateTime
                    },
                    statusHistory: statusHistory
                },
                { new: true }
            );

            if (locationPatch) {
                await Encounter.updateOne(
                    { _id: encounter._id },
                    { $push: { location: locationPatch.value } }
                );
            }
            console.log(`Updated encounter ${noRawat} with status: ${newStatus}`);
            // return
        } catch (err) {
            console.log(`Error updating encounter: ${err.message}`);
        }
    }
    console.log("Selesai Update Encounter Rawat Inap " + date);
    return
}
// kirimEncounter('x')
module.exports = { 
    kirimEncounter,
    blukEncounter,
    updateEncounter,
    updateEncounterRanap
 }