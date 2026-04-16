const express = require("express");
const app = express();
const ejs = require("ejs");
const bodyParser = require("body-parser");
require("dotenv").config();

const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./model/User");
const Car = require("./model/car");
//v1
const Payment = require("./model/payment");
const Query = require("./model/query");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const RAZORPAY_MAX_AMOUNT_PAISE = Number(
  process.env.RAZORPAY_MAX_AMOUNT_PAISE || 50000000
);
const TEST_PAYMENT_MODE =
  String(process.env.TEST_PAYMENT_MODE || "false").toLowerCase() === "true";
const TEST_PAYMENT_AMOUNT_PAISE = Number(
  process.env.TEST_PAYMENT_AMOUNT_PAISE || 10000
);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.set("view engine", "ejs");
//v1
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  require("express-session")({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.cartCount = (req.user && req.user.cart) ? req.user.cart.length : 0;
  next();
});

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}
//v1

function parseCarPriceToRupees(rawPrice) {
  if (rawPrice === null || rawPrice === undefined) return null;
  const text = String(rawPrice).toLowerCase().replace(/,/g, " ").trim();
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;

  // For ranges like "3.95 - 6.35 Lakh", use the first numeric value.
  const baseValue = Number(matches[0]);
  if (!Number.isFinite(baseValue) || baseValue <= 0) return null;

  let multiplier = 1;
  if (/(crore|\bcr\b)/.test(text)) {
    multiplier = 10000000;
  } else if (/(lakh|lac)/.test(text)) {
    multiplier = 100000;
  }

  return baseValue * multiplier;
}

// -------------------- Auth Routes --------------------
app.get("/secret", isLoggedIn, (req, res) => res.render("secret"));
app.get("/login", (req, res) =>
  req.isAuthenticated() ? res.render("index") : res.render("login")
);
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.post("/register", (req, res) => {
  User.register(
    { username: req.body.username, name: req.body.name, role: "customer" },
    req.body.password,
    (err, user) => {
      if (err) return res.redirect("/register");
      req.login(user, (err) =>
        err ? res.redirect("/login") : res.redirect("/")
      );
    }
  );
});

app.get("/logout", (req, res) => {
  req.logout((err) => res.redirect("/"));
});

// -------------------- Static Routes --------------------
app.get("/", (req, res) => res.render("index"));
app.get("/index", (req, res) => res.render("index"));
app.get("/about", (req, res) => res.render("about"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/signup", (req, res) => res.render("register"));

app.post("/contact", async (req, res) => {
  try {
    const { userName, userEmail, userMsg } = req.body;
    const newQuery = new Query({
      name: userName,
      email: userEmail,
      message: userMsg,
      date: new Date(),
    });
    await newQuery.save();
    res.send(
      '<script>alert("Thank you for contacting us!"); window.location.href = "/contact"; </script>'
    );
  } catch (err) {
    res.status(500).send("Error saving your message.");
  }
});

// -------------------- Booking Routes --------------------
app.get("/booking", (req, res) => {
  Car.find({}).then((result) => {
    if (result)
      res.render("booking", {
        Allcar: result,
        testPaymentMode: TEST_PAYMENT_MODE,
      });
    else res.redirect("/booking");
  });
});

app.post("/booking", (req, res) => {
  return res.status(403).send(
    '<script>alert("Direct booking is disabled. Please complete payment to confirm booking."); window.location.href = "/booking"; </script>'
  );
});

// -------------------- Brands Page --------------------
app.get("/brands", async (req, res) => {
  try {
    const brands = await Car.find(
      {},
      { company: 1, logo: 1, carType: { $slice: 1 }, _id: 0 }
    );
    res.render("brands", { brands });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

// -------------------- Cart Routes --------------------
app.get("/cart", isLoggedIn, (req, res) => {
  User.findById(req.user._id)
    .then((user) => {
      const cart = user && user.cart ? user.cart : [];
      res.render("cart", { cart });
    })
    .catch((err) => {
      console.error(err);
      res.redirect("/");
    });
});

app.post("/cart/remove", isLoggedIn, async (req, res) => {
  try {
    const { ref } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.redirect("/login");
    const idx = user.cart.findIndex((item) => item.ref === ref);
    if (idx > -1) {
      const removed = user.cart.splice(idx, 1)[0];
      await user.save();
      // restore availability for the removed car
      const car = await Car.findOne({ "carType.ref": ref });
      if (car) {
        const carType = car.carType.find((ct) => ct.ref === ref);
        if (carType) {
          carType.avaibality = (carType.avaibality || 0) + 1;
          await car.save();
        }
      }
    }
    res.redirect("/cart");
  } catch (err) {
    console.error(err);
    res.redirect("/cart");
  }
});
//v1

// -------------------- Payment Routes --------------------
app.post("/payment/create-order", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Login required" });
    }

    const carRef = req.body.carRef || req.body.ref;
    if (!carRef || typeof carRef !== "string") {
      return res.status(400).json({ message: "carRef is required" });
    }

    const carDoc = await Car.findOne({ "carType.ref": carRef.trim() });
    if (!carDoc) {
      return res.status(404).json({ message: "Selected car not found" });
    }

    const selectedCar = carDoc.carType.find((car) => car.ref === carRef.trim());
    if (!selectedCar) {
      return res.status(404).json({ message: "Selected car not found" });
    }

    if ((selectedCar.avaibality || 0) <= 0) {
      return res.status(409).json({ message: "Car is currently unavailable" });
    }

    const amountInRupees = parseCarPriceToRupees(selectedCar.price);
    if (!amountInRupees) {
      return res.status(400).json({ message: "Invalid car price" });
    }

    const originalAmountInPaise = Math.round(amountInRupees * 100);
    let amountInPaise = originalAmountInPaise;

    if (TEST_PAYMENT_MODE) {
      amountInPaise = Math.min(originalAmountInPaise, TEST_PAYMENT_AMOUNT_PAISE);
      if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
        return res.status(400).json({
          message: "Invalid test payment amount configuration",
        });
      }
    }

    if (amountInPaise > RAZORPAY_MAX_AMOUNT_PAISE) {
      return res.status(400).json({
        message:
          "Selected car amount exceeds online payment limit. Please choose a lower-priced car or contact support.",
      });
    }

    const currency = "INR";
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt: `rcpt_${Date.now()}_${carRef.slice(-6)}`,
      notes: {
        userId: String(req.user._id),
        carRef: selectedCar.ref,
      },
    });

    await Payment.create({
      userId: req.user._id,
      username: req.user.username,
      company: carDoc.company,
      carRef: selectedCar.ref,
      carName: selectedCar.carName,
      amount: amountInPaise,
      originalAmount: originalAmountInPaise,
      isTestCharge: TEST_PAYMENT_MODE,
      currency,
      razorpayOrderId: razorpayOrder.id,
      status: "created",
    });

    return res.json({
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency,
      key: process.env.RAZORPAY_KEY_ID,
      car: {
        ref: selectedCar.ref,
        name: selectedCar.carName,
        company: carDoc.company,
        price: amountInRupees,
        priceDisplay: selectedCar.price,
        image: selectedCar.imgsrc || (selectedCar.images && selectedCar.images[0] ? selectedCar.images[0].src : null),
      },
      paymentMode: TEST_PAYMENT_MODE ? "test-token" : "full-amount",
      originalAmount: originalAmountInPaise,
    });
  } catch (err) {
    console.error("Create order error:", err);
    const razorpayMessage =
      err && err.error && err.error.description
        ? err.error.description
        : "Unable to create payment order";
    return res.status(500).json({ message: razorpayMessage });
  }
});
//v1

app.post("/payment/verify", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Login required" });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing Razorpay verification fields" });
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest("hex");

    const isSignatureValid =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpay_signature)
      );

    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    if (String(payment.userId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Unauthorized payment verification" });
    }

    if (!isSignatureValid) {
      payment.status = "failed";
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.razorpaySignature = razorpay_signature;
      await payment.save();
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    if (!razorpayOrder) {
      return res.status(400).json({ message: "Unable to fetch Razorpay order" });
    }

    if (
      Number(razorpayOrder.amount) !== Number(payment.amount) ||
      String(razorpayOrder.currency || "").toUpperCase() !==
        String(payment.currency || "").toUpperCase()
    ) {
      payment.status = "failed";
      payment.razorpayPaymentId = razorpay_payment_id;
      payment.razorpaySignature = razorpay_signature;
      await payment.save();
      return res.status(400).json({ message: "Order amount/currency mismatch" });
    }

    if (payment.status === "paid") {
      return res.json({ message: "Payment already verified", status: "paid" });
    }

    if (!payment.carRef) {
      return res.status(400).json({ message: "Missing selected car information" });
    }

    const carDoc = await Car.findOne({
      company: String(payment.company || "").toLowerCase(),
      "carType.ref": payment.carRef,
    });

    const fallbackCarDoc =
      carDoc || (await Car.findOne({ "carType.ref": payment.carRef }));

    if (!fallbackCarDoc) {
      return res.status(404).json({ message: "Selected car not found" });
    }

    const carItem = fallbackCarDoc.carType.find((c) => c.ref === payment.carRef);
    if (!carItem) {
      return res.status(404).json({ message: "Selected car not found" });
    }

    if ((carItem.avaibality || 0) <= 0) {
      return res.status(409).json({ message: "Car is currently unavailable" });
    }

    carItem.avaibality -= 1;
    await fallbackCarDoc.save();

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existsInCart = user.cart.some((item) => item.ref === payment.carRef);
    if (!existsInCart) {
      user.cart.push(carItem);
      await user.save();
    }

    payment.status = "paid";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    await payment.save();

    return res.json({
      message: "Payment verified and booking confirmed",
      status: "paid",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      car: {
        ref: carItem.ref,
        name: carItem.carName,
        company: fallbackCarDoc.company,
      },
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    return res.status(500).json({ message: "Unable to verify payment" });
  }
});

// -------------------- Company Page --------------------
app.get("/:companyName", (req, res) => {
  const companyName = req.params.companyName.toLowerCase();
  if (companyName === "favicon.ico") return;
  Car.findOne({ company: companyName }).then((rslt) => {
    if (rslt) {
      res.render("company", {
        result: rslt.carType, // now showing all cars
        companyName: companyName,
      });
    } else {
      res.redirect("/");
    }
  });
});

// -------------------- Car Detail Page --------------------
app.get("/:companyName/:route", (req, res) => {
  const { companyName, route } = req.params;
  Car.findOne({ company: companyName.toLowerCase() }).then((result) => {
    if (result) {
      const car = result.carType.find((c) => c.route === route);
      if (car) return res.render("cardetail", { data: car });
      else return res.redirect(`/${companyName}`);
    } else {
      res.send(
        '<script>alert("Not available"); window.location.href = "/"; </script>'
      );
    }
  });
});

// -------------------- Server --------------------
app.listen(3000, () => console.log("Server started at 3000"));
