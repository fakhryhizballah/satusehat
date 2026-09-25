const mongoose = require("mongoose");
const Alergi = require("../modelsMongoose/Alergi");
const Encounter = require("../modelsMongoose/Encounter");
const Allergyintolerance = require("../modelsMongoose/allergyintolerance");
const { pemeriksaan_ralan, pegawai } = require("../models");
const { retrieveContextAlergy } = require("../helpers/findAlergy");
const PatientAllergyIntolerance = require("../template/AllergyIntolerance");
const { fetchSatusehatBatch } = require("../helpersfetch/satusehat");
const { getPractitioner } = require("./identitas");
const { convertToISO2 } = require("../helpers/");
const { Op } = require("sequelize");
async function kirimAllergyintolerance(date) {
  // let cek = await Allergyintolerance.find();
  // console.log(cek);
  let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
  console.log("Processing Allergyintolerance Date:", dateFormatted);
  const encounters = await Encounter.aggregate(
    [
      {
        // 1. Filter awal berdasarkan prefix identifier
        $match: {
          "identifier.value": { $regex: `^${dateFormatted}` },
        },
      },
      {
        // 2. Buat reference dinamis untuk matching
        $addFields: {
          encounterRef: { $concat: ["Encounter/", "$id"] },
        },
      },
      {
        // 3. Left Outer Join dengan koleksi Allergyintolerance
        $lookup: {
          from: "allergyintolerances", // Sesuaikan case-sensitive nama koleksi fisik
          localField: "encounterRef",
          foreignField: "encounter.reference",
          as: "matchedAlergy",
        },
      },
      {
        // 4. Exclude data yang memiliki pasangan (hanya ambil array kosong)
        $match: {
          matchedAlergy: { $eq: [] }, // Alternatif { $size: 0 }
        },
      },
      {
        // 5. Proyeksi data akhir
        $project: {
          _id: 0,
          id: "$id",
          noRawat: { $arrayElemAt: ["$identifier.value", 0] },

          subject: 1,
        },
      },
    ],
    { allowDiskUse: true },
  );
  let NoRawat = encounters.map(encounter => encounter.noRawat);
  let findDataAlergy = await pemeriksaan_ralan.findAll({
    where: {
      no_rawat: { [Op.in]: NoRawat },
      alergi: {
        [Op.and]: [
          { [Op.notLike]: '%ada%' },
          { [Op.notLike]: 'makan%' },
          { [Op.notIn]: ['-', '', 'tidak ada', 'Ada', 'makan'] }
        ]
      }
    },
    include: [{
      model: pegawai,
      as: 'pegawai',
      attributes: ['nama', 'no_ktp'],
    }],
    attributes: ['no_rawat', 'alergi', 'nip', 'tgl_perawatan', 'jam_rawat'],
    order: [['jam_rawat', 'DESC']],
  })
  console.log(findDataAlergy);
  let bundel = {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": []
  }
  for (let dataAlergi of findDataAlergy) {
    console.log(dataAlergi);
    let resultretrieveContextAlergy = await retrieveContextAlergy(dataAlergi.alergi, 1);
    if (!resultretrieveContextAlergy) {
      continue
    }
    console.log(resultretrieveContextAlergy);
    let findEncounter = encounters.find(encounter => encounter.noRawat == dataAlergi.no_rawat);
    let dataPractitioner = await getPractitioner(dataAlergi.pegawai.no_ktp, 'id name')
    const allergyData = new PatientAllergyIntolerance({
      allergyValue: dataAlergi.no_rawat + "-" + dataAlergi.nip,
      category: resultretrieveContextAlergy[0].data.category,
      snomedCode: resultretrieveContextAlergy[0].data.coding_code,
      snomedDisplay: resultretrieveContextAlergy[0].data.coding_display,
      textNote: dataAlergi.alergi,
      patientId: findEncounter.subject.reference.split("/")[1],
      patientName: findEncounter.subject.display,
      encounterId: findEncounter.id,
      encounterDisplay: dataAlergi.no_rawat,
      practitionerId: dataPractitioner.id,
      practitionerName: dataPractitioner.name[0].text,
      recordedDate: convertToISO2(dataAlergi.tgl_perawatan + " " + dataAlergi.jam_rawat),
    });
    const entry = {
      "fullUrl": "urn:uuid:" + crypto.randomUUID(),
      "resource": allergyData,
      "request": {
        "method": "POST",
        "url": "AllergyIntolerance"
      }
    };
    bundel.entry.push(entry);
  }
  console.log(JSON.stringify(bundel, null, 2));

  let kirimBundle = await fetchSatusehatBatch("POST", bundel).catch((err) => {
    console.log(JSON.stringify(err, null, 2));
    return
  });

  if (kirimBundle.total == 0 || kirimBundle == undefined) {
    // console.log(kirimBundle.response);
    console.log(JSON.stringify(bundel, null, 2));
    console.log(JSON.stringify(kirimBundle, null, 2));
    throw new Error(kirimBundle.error);
  }
  const AllergyIntolerancesData = bundel.entry.map((entry, i) => {
    const data = { ...entry.resource };
    data.id = kirimBundle.entry[i]?.response?.resourceID;
    return data;
  });

  // 2. Eksekusi bulk insert ke MongoDB
  try {
    const result = await Allergyintolerance.insertMany(AllergyIntolerancesData, { ordered: false });
    console.log(`Berhasil insert ${result.length} dokumen AllergyIntolerance.`);
  } catch (err) {
    console.error("Gagal melakukan bulk insert:", err);
  }
  console.log("Total Kirim AllergyIntolerance:", kirimBundle.entry.length);
  return

}

module.exports = {
  kirimAllergyintolerance,
};
