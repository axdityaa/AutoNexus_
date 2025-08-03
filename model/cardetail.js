const mongoose = require("mongoose");

const srcSchema = new mongoose.Schema({
  src: String // image source URL
});

const cardetailSchema = new mongoose.Schema({
  carName: String,
  route: String,
  carHeading: String,
  avaibality: Number,
  milage: String,
  fuelType: String,
  serviceCost: String,
  tankCapacity: String,
  engine: String,
  BHP: String,
  cylinderCount: Number,
  gearCount: Number,
  tranmission: String,
  rearAcVent: String,
  seatingCapicity: Number,
  bootSpace: String,
  Abs: String,
  driverAirbag: String,
  parkingSensor: String,
  AirBag: String,
  discription: String,
  imgsrc: String,
  images: [srcSchema],
  ref: String,
  price: String,
  highlights: [String]
});

module.exports = {
  Cardetail: cardetailSchema,
  Src: srcSchema
};
