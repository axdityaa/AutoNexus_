const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    carRef: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    carName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number, // store in paise
      required: true,
      min: 1,
    },
    originalAmount: {
      type: Number, // original vehicle amount in paise at booking time
      default: null,
      min: 1,
    },
    isTestCharge: {
      type: Boolean,
      default: false,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);