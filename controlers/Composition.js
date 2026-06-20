require('dotenv').config()
const mongoose = require('mongoose');
const Practitioner = require("../modelsMongoose/Practitioner");
const Patient = require("../modelsMongoose/Patient");
const Encounter = require("../modelsMongoose/Encounter");
const Composition = require("../modelsMongoose/Composition");
const { catatan_adime_gizi, pemeriksaan_ralan, pemeriksaan_ranap, pegawai } = require("../models");
const { Op } = require("sequelize");
const { getPesertabyKatu } = require("../helpersfetch/bpjs");
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");
const { MedicalComposition } = require("../template/Composition");
const { getPractitioner } = require("./identitas");
const crypto = require('crypto');


async function kirimInstuksiDiet(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    console.log("Processing Composition Date/No Rawat:", dateFormatted);
    const result = await Encounter.aggregate([
        {
            // 1. Tahap Pertama: Filter Encounter berdasarkan awalan tanggal
            $match: {
                'identifier.value': { $regex: new RegExp(`^${dateFormatted}`) }
            }
        },
        {
            // 2. Format ID: Buat field referensi untuk dicocokkan dengan Composition.
            // Catatan: Jika '_id' di database adalah ObjectId, gunakan $toString. 
            // Jika field 'id' sudah tersimpan eksplisit sebagai string, ganti menjadi "$id".
            $addFields: {
                encounterRef: { $concat: ["Encounter/", { $toString: "$id" }] }
            }
        },
        {
            // 3. Left Outer Join: Relasikan dengan collection Composition
            // Pastikan nama "compositions" sesuai dengan nama fisik collection di MongoDB.
            $lookup: {
                from: "compositions",
                localField: "encounterRef",
                foreignField: "encounter.reference",
                as: "matchedCompositions"
            }
        },
        {
            // 4. Anti-Join: Buang semua Encounter yang memiliki kecocokan di Composition
            $match: {
                matchedCompositions: { $size: 0 }
            }
        },
        {
            // 5. Proyeksi: Ambil hanya value dari array identifier indeks ke-0 (No Rawat)
            // Ini mengurangi payload data yang dikirim dari MongoDB ke Node.js
            $project: {
                _id: 0,
                noRawat: { $arrayElemAt: ["$identifier.value", 0] }
            }
        }
    ]);
    // Hasil akhir sudah terfilter bersih dari database.
    // Cukup map array object [{ noRawat: "..." }] menjadi array of strings ["..."]
    let mapNoRawat = result.map(doc => doc.noRawat);

    let findinstuksidet = await catatan_adime_gizi.findAll({
        where: {
            no_rawat: {
                [Op.in]: mapNoRawat
            }
        },
        include: [{
            model: pegawai,
            as: 'pegawai',
            attributes: ['no_ktp', 'nama']
        }],
        attributes: ['no_rawat', 'tanggal', 'intervensi', 'evaluasi', 'instruksi']
    })
    // console.log(JSON.stringify(findinstuksidet, null, 2))
    let bundel = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": []
    }
    if (findinstuksidet.length === 0) {
        console.log("No instuksi diet Found")
        return
    }
    console.log("Total Composition:", findinstuksidet.length);
    for (let x of findinstuksidet) {
        let dataEncounter = await Encounter.findOne({
            'identifier.value': x.no_rawat
        }, 'id subject')
        let dataPractitioner = await getPractitioner(x.pegawai.no_ktp, 'id name')
        const compositionData = new MedicalComposition({
            compositionValue: x.no_rawat,
            patientId: dataEncounter.subject.reference.split("/")[1],
            patientName: dataEncounter.subject.display,
            encounterId: dataEncounter.id,
            encounterDisplay: x.no_rawat,
            practitionerId: dataPractitioner.id,
            practitionerName: x.pegawai.nama,
            date: x.tanggal,
            dietText: `Intervensi: ${x.intervensi}\nEvaluasi: ${x.evaluasi}\nInstruksi: ${x.instruksi}`
        });

        const MedicalCompositionEntry = {
            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
            "resource": compositionData,
            "request": {
                "method": "POST",
                "url": "Composition"
            }
        };
        bundel.entry.push(MedicalCompositionEntry);

    }
    let kirim = await fetchSatusehatBatch("POST", bundel).catch((err) => {
        console.log(JSON.stringify(err, null, 2));
        return
    });
    if (kirim.total === 0) {
        console.log(JSON.stringify(kirim.response.issue, null, 2));
        return

    }
    for (let i = 0; i < bundel.entry.length; i++) {
        if (kirim.entry[i] && kirim.entry[i].response) {
            if (kirim.entry[i].response.resourceType === 'Composition') {
                let dataComposition = bundel.entry[i].resource;
                dataComposition.id = kirim.entry[i].response.resourceID;
                let x = await Composition.create(dataComposition)
                // console.log(x)

            }
        }
    }
    console.log("Total Kirim Composition: ", bundel.entry.length, "dari: ", findinstuksidet.length);
    return

}


module.exports = { kirimInstuksiDiet }
// kirimInstuksiDiet('2026-05-02')