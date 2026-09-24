const mongoose = require("mongoose");

const allergyIntoleranceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    resourceType: {
      type: String,
      required: true,
        default: "AllergyIntolerance",
    },
  },
  { strict: false },
);

module.exports = mongoose.model("Allergyintolerance", allergyIntoleranceSchema);
