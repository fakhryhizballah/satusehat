const { EncounterDiagnosis } = require('../template/Condition');
const Encounter = require("../modelsMongoose/Encounter");
const Condition = require("../modelsMongoose/Condition");
const { diagnosa_pasien, penyakit } = require("../models");
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");
async function kirimICD10(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    console.log("Processing Kirim ICD 10 Date/No Rawat:", dateFormatted);
    const encounters = await Encounter.find({
        'identifier.value': { $regex: new RegExp(`^${dateFormatted}`) },
        'diagnosis': { '$exists': false }
    }, 'identifier subject id');
    console.log("Total Encounter:", encounters.length);
    for (let x of encounters) {
        let dataCondition = await diagnosa_pasien.findAll({
            where: {
                no_rawat: x.identifier[0].value
            },
            order: [
                ['prioritas', 'ASC']
            ],
            attributes: ['no_rawat', 'kd_penyakit', 'status', 'prioritas', 'status_penyakit'],
            include: [{
                model: penyakit,
                as: 'penyakit',
                attributes: ['kd_penyakit', 'nm_penyakit','im']
            }]
        })
        let bundel = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": []
        }
        for (let y of dataCondition) {
            if (y.dataValues.penyakit.dataValues.im == '1') {
               let kodePenyakit = await penyakit.findOne({
                   where: {
                       kd_penyakit: y.dataValues.kd_penyakit.split('.')[0] + '.0'
                   },
                   attributes: ['kd_penyakit', 'nm_penyakit'],
               })
               if (kodePenyakit) {
                   y.dataValues.kd_penyakit = kodePenyakit.dataValues.kd_penyakit
                   y.dataValues.penyakit.dataValues.nm_penyakit = kodePenyakit.dataValues.nm_penyakit
               }
            }
            const diagnosisData = new EncounterDiagnosis({
                icdCode: y.dataValues.kd_penyakit,
                icdDisplay: y.dataValues.penyakit.dataValues.nm_penyakit,
                patientId: x.subject.reference.split("/")[1],
                patientName: x.subject.display,
                encounterId: x.id,
                encounterDisplay: x.identifier[0].value,
            });
            bundel.entry.push({
                "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                "resource": diagnosisData,
                "request": {
                    "method": "POST",
                    "url": `Condition`
                }
            });
        }
        if (bundel.entry.length > 0) {
            console.log(JSON.stringify(bundel, null, 2));
            let kirimBundle = await fetchSatusehatBatch("POST", bundel).catch((err) => {
                console.log(JSON.stringify(err, null, 2));
                return
            });
            if (kirimBundle.total === 0) {
                console.log(kirimBundle.error);
                // throw new Error(kirimBundle.error);
                return
            }
            let diagnosa_pasien = []
            for (let i = 0; i < bundel.entry.length; i++) {
                let data = bundel.entry[i].resource;
                data.id = kirimBundle.entry[i].response.resourceID;
                let x = await Condition.create(data).catch(err => console.log(err));
                diagnosa_pasien.push({
                    "condition": {
                        "display": data.code.coding[0].display,
                        "reference": "Condition/" + kirimBundle.entry[i].response.resourceID
                    },
                    "use": {
                        "coding": [
                            {
                                "code": "DD",
                                "display": "Discharge diagnosis",
                                "system": "http://terminology.hl7.org/CodeSystem/diagnosis-role"
                            }
                        ]
                    }
                })
            }
            let addDiagnosis = [
                {
                    "op": "add",
                    "path": "/diagnosis",
                    "value": diagnosa_pasien
                }
            ]
            let updateEncounter = await fetchSatusehatPatch("PATCH", `Encounter/${x.id}`, addDiagnosis);
            await Encounter.updateOne({ id: x.id }, { diagnosis: updateEncounter.diagnosis, meta: updateEncounter.meta })
            console.log("Finish Kirim ICD 10 Date/No Rawat:", x.identifier[0].value);
        }


    }
    console.log("Selesai Kirim ICD 10");
    return
}

module.exports = {
    kirimICD10
}