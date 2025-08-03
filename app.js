const express = require("express");
const app = express();
const ejs = require("ejs");
const bodyParser = require("body-parser");
require("dotenv").config();

const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./model/User");
const Car = require("./model/car");
const Query = require("./model/query");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.set("view engine", "ejs");
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
  next();
});

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
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
    if (result) res.render("booking", { Allcar: result });
    else res.redirect("/booking");
  });
});

app.post("/booking", (req, res) => {
  const CAR = req.body.model.split(",");
  if (!req.isAuthenticated()) return res.redirect("/login");
  const UserName = req.user.username;
  Car.findOne({ company: CAR[1] }).then((result) => {
    if (!result) return res.redirect("/");
    const carObj = result.carType.find((car) => car.carName === CAR[0]);
    if (carObj && carObj.avaibality > 0) {
      carObj.avaibality--;
      result.save();
      User.findOne({ username: UserName }).then((user) => {
        if (user) {
          user.cart.push(carObj);
          user.save();
        }
      });
      res.send(
        '<script>alert("Booking Successful"); window.location.href = "/"; </script>'
      );
    } else {
      res.send(
        '<script>alert("Currently Not Available"); window.location.href = "/booking"; </script>'
      );
    }
  });
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
