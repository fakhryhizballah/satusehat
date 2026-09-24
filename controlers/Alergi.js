const mongoose = require("mongoose");
const Alergi = require("../modelsMongoose/Alergi");
const Encounter = require("../modelsMongoose/Encounter");
const Allergyintolerance = require("../modelsMongoose/allergyintolerance");
const { pemeriksaan_ralan, pegawai } = require("../models");
const { Op } = require("sequelize");
async function kirimAllergyintolerance(date) {
  // let cek = await Allergyintolerance.find();
  // console.log(cek);
  let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
  console.log("Processing Kirim ICD 9 Date/No Rawat:", dateFormatted);
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
     console.log(encounters);
    let NoRawat = encounters.map(encounter => encounter.noRawat);
    let findDataAlergy = await pemeriksaan_ralan.findAll({
        where: {
            no_rawat: { [Op.in]: NoRawat },
            alergi: {
                [Op.notLike]: '%ada%',
                [Op.notIn]: ['-', '', 'tidak ada', 'Ada'],
            },
        },
        include: [{
            model: pegawai,
            as: 'pegawai',
            attributes: ['nama', 'no_ktp'],
        }],
        attributes: ['no_rawat', 'alergi'],
        order: [['jam_rawat', 'DESC']],
    })
    console.log(findDataAlergy);
}

module.exports = {
  kirimAllergyintolerance,
};
