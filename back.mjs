require("dotenv").config();

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import sgMail from "@sendgrid/mail";
import mongoose from "mongoose";
import moment from "moment-timezone"; // Import moment-timezone

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());

// configure sendgrid
sgMail.setApiKey(process.env.API_KEY);
// Configure Cors

// Whitelist Vercel domain

app.use(cors()); // Enable CORS for your frontend URL

// Connect to MongoDB using Mongoose
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
  ssl: process.env.NODE_ENV === "production", // Use SSL in production
});
mongoose.connection.on("connected", () => {
  console.log("Connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error(`Failed to connect to MongoDB: ${err.message}`);
});

// Define your Mongoose schema and model here
const bookingSchema = new mongoose.Schema({
  name: String,
  email: String,
  number: String,
  address: String,
  message: String,
  service: String,
  additionService: String,
  date: Date, // Store the date and time together
});

const Booking = mongoose.model("Booking", bookingSchema);

// Endpoint to handle booking data and send an email
app.post("/book", async (req, res) => {
  const bookingData = req.body;
  console.log("Booking data received in backend:", bookingData);

  // Combine date and time
  const bookingDateTime = moment
    .tz(
      `${bookingData.date} ${bookingData.time}`,
      "YYYY-MM-DD HH:mm",
      "Africa/Lagos"
    )
    .toDate();
  bookingData.date = bookingDateTime; // Save date and time as a single field

  const booking = new Booking(bookingData);

  try {
    await booking.save();

    // Compose the email message with the booking details
    const msg = {
      to: "Bimstudios@yahoo.com", // Your email address to receive the booking info
      from: "snbadmus@gmail.com", // The sender email address
      subject: `New Booking: ${bookingData.service}`, // Email subject with the service name
      text: `
        You have received a new booking.

        Service: ${bookingData.service}
        Additional Service: ${bookingData.additionService || "None"}
        Name: ${bookingData.name}
        Email: ${bookingData.email}
        Number: ${bookingData.number}
        Address: ${bookingData.address}
        Date: ${moment(bookingData.date).format("YYYY-MM-DD")}
        Time: ${moment(bookingData.date).format("HH:mm")}
        Message: ${bookingData.message || "No additional message."}
      `,
    };

    // Send the email
    await sgMail.send(msg);

    res
      .status(200)
      .send({ message: "Booking data received and email sent successfully" });
  } catch (error) {
    console.error("Error saving booking data or sending email:", error);
    res.status(500).send({
      error: "Failed to save booking data or send email",
      details: error,
    });
  }
});

// Endpoint to fetch unavailable times // Endpoint to fetch unavailable times for a specific date
app.get("/bookings/unavailable-times", async (req, res) => {
  const { date } = req.query;
  try {
    const startOfDay = moment(date, "YYYY-MM-DD").startOf("day").toDate();
    const endOfDay = moment(date, "YYYY-MM-DD").endOf("day").toDate();

    const bookings = await Booking.find({
      date: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    console.log("Bookings found for the date:", bookings);

    // Initialize `timesToBlock` here
    let timesToBlock = [];

    const bookedTimes = bookings.map((booking) => {
      const bookingTime = moment(booking.date).format("HH:mm");

      // Block the booked time and the next 2 hours (4 slots of 30 minutes each)
      for (let i = 0; i < 4; i++) {
        timesToBlock.push(
          moment(bookingTime, "HH:mm")
            .add(i * 30, "minutes")
            .format("HH:mm")
        );
      }
    });

    // Ensure unique times using a Set
    const unavailableTimes = Array.from(new Set(timesToBlock));

    console.log("Blocked times to send to frontend:", unavailableTimes);

    res.status(200).json(unavailableTimes);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res
      .status(500)
      .send({ error: "Failed to fetch unavailable times", details: error });
  }
});
app.get("/", (req, res) => {
  console.log("Received request to /");
  res.send("Backend is working!");
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
