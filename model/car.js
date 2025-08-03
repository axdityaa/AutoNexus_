const mongoose = require("mongoose");
const { Cardetail } = require("./cardetail");

const carSchema = new mongoose.Schema({
  company: {
    type: String
  },
  logo: {
    type: String,
    required: true
  },
  carType: [Cardetail] 
});

module.exports = mongoose.model("Car", carSchema);

