const { ClinicalProcedure } = require('../template/Procedure');
const Encounter = require("../modelsMongoose/Encounter");
const Procedure = require("../modelsMongoose/Procedure");
const { prosedur_pasien, icd9 } = require("../models");
const { Op } = require("sequelize");
const crypto = require('crypto');
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");

async function kirimICD9(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    console.log("Processing Kirim ICD 9 Date/No Rawat:", dateFormatted);
    const encounters = await Encounter.aggregate([
        {
            // 1. Filter awal berdasarkan tanggal
            $match: {
                'identifier.value': { $regex: new RegExp(`^${dateFormatted}`) }
            }
        },
        {
            $addFields: {
                encounterRef: { $concat: ["Encounter/", "$id"] }
            }
        },
        {
            // 3. Left Outer Join dengan prosedur
            $lookup: {
                from: "procedures", // Pastikan nama collection fisik di MongoDB adalah "procedures"
                localField: "encounterRef",
                foreignField: "encounter.reference",
                as: "matchedProcedures"
            }
        },
        {
            // 4. Anti-Join: Buang Encounter yang memiliki kecocokan (eliminasi)
            // Ini memastikan hanya data yang array matchedProcedures-nya kosong yang lolos
            $match: {
                // Atau bisa juga menggunakan: matchedProcedures: { $eq: [] }
                matchedProcedures: { $size: 0 }
            }
        },
        {
            // 5. Proyeksi data untuk mengurangi payload
            $project: {
                _id: 0,
                id: "$id", // Pastikan field 'id' ini memang eksis di collection Encounter
                noRawat: {
                    $arrayElemAt: ["$identifier.value", 0]
                },
                subject: "$subject"
            }
        }
    ], { allowDiskUse: true });
    let NoRawat = encounters.map(encounter => encounter.noRawat);
    // console.log(NoRawat);
    let cari_prodsedur = await prosedur_pasien.findAll({
        where: {
            no_rawat: { [Op.in]: NoRawat }
        },
        include: [
            {
                model: icd9,
                as: 'prosedur'
            }
        ],
        order: [
            ['no_rawat', 'ASC'],
            ['prioritas', 'ASC']
        ],
        // limit: 2
    })
    console.log("Total Encounter:", encounters.length);
    console.log("Total ICD9:", cari_prodsedur.length);
    let bundel = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": []
    }
    for (let x of cari_prodsedur) {
        let findEncounter = encounters.find(encounter => encounter.noRawat == x.no_rawat);

        const procedureData = new ClinicalProcedure({
            icd9Code: x.prosedur.kode,
            icd9Display: x.prosedur.deskripsi_panjang,
            patientId: findEncounter.subject.reference.split("/")[1],
            patientName: findEncounter.subject.display,
            procedureValue: x.dataValues.no_rawat + "-" + x.dataValues.prioritas,
            encounterId: findEncounter.id,
            encounterDisplay: x.dataValues.no_rawat
        });
        const entry = {
            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
            "resource": procedureData,
            "request": {
                "method": "POST",
                "url": "Procedure"
            }
        };
        bundel.entry.push(entry);
    }
    // console.log(JSON.stringify(bundel, null, 2));
    let kirimBundle = await fetchSatusehatBatch("POST", bundel).catch((err) => {
        console.log(JSON.stringify(err, null, 2));
        return
    });
    console.log(kirimBundle);
    if (kirimBundle.total == 0) {
        console.log(kirimBundle.response);
        // throw new Error(kirimBundle.error);
        return
    }
    for (let i = 0; i < bundel.entry.length; i++) {
        let data = bundel.entry[i].resource;
        data.id = kirimBundle.entry[i].response.resourceID;
        await Procedure.create(data).catch((err) => {
            console.log(err);
        });
    }
    console.log("Total Kirim ICD9:", kirimBundle.entry.length);
    return
}


module.exports = {
    kirimICD9
}