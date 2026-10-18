import dotenv from "dotenv";
dotenv.config();
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mongoose from "mongoose";
import moment from "moment-timezone";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 3001;
const TIMEZONE = "America/Edmonton";
const SLOT_MINUTES = 30;
// Longest service duration — used as a before-buffer so a bridal
// session cannot start too close to an existing booking.
const MAX_SERVICE_MINUTES = 120;

// Middleware
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Whitelist Vercel domain
const allowedOrigins = [
  "https://www.makeupbybims.com",
  "https://makeupbybims.com",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI);
mongoose.connection.on("connected", () => {
  console.log("Connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error(`Failed to connect to MongoDB: ${err.message}`);
});

const bookingSchema = new mongoose.Schema({
  name: String,
  email: String,
  number: String,
  address: String,
  message: String,
  service: String,
  additionService: String,
  price: String,
  date: Date,
});

const Booking = mongoose.model("Booking", bookingSchema);

/** Duration in minutes based on service name (applies to ALL service types). */
function getServiceDurationMinutes(serviceName = "") {
  const name = serviceName.toLowerCase();

  if (
    name.includes("bridal session") ||
    name.includes("civil wedding") ||
    name.includes("civil")
  ) {
    return 120;
  }

  if (
    name.includes("non-bridal") ||
    name.includes("bridal train") ||
    name.includes("bridal party") ||
    name.includes("diy")
  ) {
    return 90;
  }

  // Conservative default so unknown services still block enough time
  return MAX_SERVICE_MINUTES;
}

function parseEdmontonDateTime(dateStr, timeStr) {
  return moment.tz(
    `${dateStr} ${timeStr}`,
    "YYYY-MM-DD HH:mm",
    TIMEZONE
  );
}

/** Build every 30-min slot that should be unavailable around a booking. */
function getBlockedSlotsForBooking(bookingStart, durationMinutes) {
  const blocked = [];
  const appointmentEnd = bookingStart.clone().add(durationMinutes, "minutes");

  // Block slots during the appointment itself
  for (
    let slot = bookingStart.clone();
    slot.isBefore(appointmentEnd);
    slot.add(SLOT_MINUTES, "minutes")
  ) {
    blocked.push(slot.format("HH:mm"));
  }

  // Block slots before so a longer service cannot overlap into this one
  const beforeStart = bookingStart
    .clone()
    .subtract(MAX_SERVICE_MINUTES, "minutes");
  for (
    let slot = beforeStart.clone();
    slot.isBefore(bookingStart);
    slot.add(SLOT_MINUTES, "minutes")
  ) {
    blocked.push(slot.format("HH:mm"));
  }

  return blocked;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA.isBefore(endB) && startB.isBefore(endA);
}

app.post("/book", async (req, res) => {
  const bookingData = req.body;
  console.log("received booking data:", bookingData);

  const bookingStart = parseEdmontonDateTime(
    bookingData.date,
    bookingData.time
  ).startOf("minute");

  if (!bookingStart.isValid()) {
    return res.status(400).json({ message: "Invalid date or time format" });
  }

  const durationMinutes = getServiceDurationMinutes(bookingData.service);
  const bookingEnd = bookingStart.clone().add(durationMinutes, "minutes");

  // Reject if this slot overlaps ANY existing booking (all services)
  try {
    const dayStart = bookingStart.clone().startOf("day");
    const dayEnd = bookingStart.clone().endOf("day");

    const existingBookings = await Booking.find({
      date: {
        $gte: dayStart.toDate(),
        $lte: dayEnd.toDate(),
      },
    });

    const hasConflict = existingBookings.some((existing) => {
      const existingStart = moment(existing.date).tz(TIMEZONE);
      const existingEnd = existingStart
        .clone()
        .add(getServiceDurationMinutes(existing.service), "minutes");

      return rangesOverlap(
        bookingStart,
        bookingEnd,
        existingStart,
        existingEnd
      );
    });

    if (hasConflict) {
      return res.status(409).json({
        message:
          "This time slot is no longer available. Please choose another time.",
      });
    }
  } catch (error) {
    console.error("Error checking booking conflicts:", error);
    return res
      .status(500)
      .json({ message: "Failed to verify availability.", error: error.message });
  }

  bookingData.date = bookingStart.toDate();

  const booking = new Booking(bookingData);
  try {
    await booking.save();
    console.log("Booking saved successfully:", booking);
  } catch (error) {
    console.error("Error saving booking:", error.message, error.stack);
    return res
      .status(500)
      .json({ message: "Failed to save booking data.", error: error.message });
  }

  const mailOptions = {
    to: "makeupbybims@gmail.com",
    from: "makeupbybims@gmail.com",
    subject: `New Booking: ${bookingData.service}`,
    text: `
            You have received a new booking.
            Service: ${bookingData.service}
            Additional Service: ${bookingData.additionService || "None"}
            Name: ${bookingData.name}
            Email: ${bookingData.email}
            Number: ${bookingData.number}
            Address: ${bookingData.address}
            Date: ${moment(bookingData.date).tz(TIMEZONE).format("YYYY-MM-DD")}
            Time: ${moment(bookingData.date).tz(TIMEZONE).format("HH:mm")}
            Message: ${bookingData.message || "No additional message."}
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
    return res
      .status(200)
      .json({ message: "Booking data received and email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res
      .status(500)
      .json({ message: "Failed to send booking confirmation email." });
  }
});

app.get("/bookings/unavailable-times", async (req, res) => {
  const { date } = req.query;
  try {
    const startOfDay = moment.tz(date, "YYYY-MM-DD", TIMEZONE).startOf("day");
    const endOfDay = moment.tz(date, "YYYY-MM-DD", TIMEZONE).endOf("day");

    // All bookings for the day — bridal, non-bridal, and every other service
    const bookings = await Booking.find({
      date: {
        $gte: startOfDay.toDate(),
        $lte: endOfDay.toDate(),
      },
    });

    console.log("Bookings found for the date:", bookings);

    const timesToBlock = [];

    bookings.forEach((booking) => {
      const bookingStart = moment(booking.date).tz(TIMEZONE);
      const durationMinutes = getServiceDurationMinutes(booking.service);
      timesToBlock.push(
        ...getBlockedSlotsForBooking(bookingStart, durationMinutes)
      );
    });

    const unavailableTimes = Array.from(new Set(timesToBlock)).sort();

    console.log("Blocked times to send to frontend:", unavailableTimes);

    res.status(200).json(unavailableTimes);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res
      .status(500)
      .send({ error: "Failed to fetch unavailable times", details: error });
  }
});

import { createServer } from "http";
const server = createServer(app);
export default function handler(req, res) {
  server.emit("request", req, res);
}
app.get("/", (req, res) => {
  console.log("Received request to /");
  res.send("Backend is working!");
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.get("/favicon.ico", (req, res) => res.status(204).end());
