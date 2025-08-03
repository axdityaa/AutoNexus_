const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");
const { Cardetail } = require("./cardetail");

const userSchema = new mongoose.Schema({
  username: String,
  name: String,
  role: String,
  cart: [Cardetail], // all cars booked by user
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
