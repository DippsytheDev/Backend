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

// Middleware
app.use(bodyParser.json());

/* // configure sendgrid
sgMail.setApiKey(process.env.API_KEY);
 */
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
  "http://localhost:5173",
]; // Add localhost for local testing

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
    credentials: true, // Allows cookies and credentials if needed
  })
);
// Connect to MongoDB using Mongoose
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI);
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
  console.log("received booking data:", bookingData);

  // Combine date and time into a single field
  const bookingDateTime = moment
    .tz(
      `${bookingData.date} ${bookingData.time}`,
      "YYYY-MM-DD HH:mm",
      "America/Edmonton"
    )
    /* .utc() */
    .startOf("minute") // Set to the start of the minute
    .toDate();
  if (isNaN(bookingDateTime.getTime())) {
    return res.status(400).json({ message: "Invalid date or time format" });
  }

  bookingData.date = bookingDateTime; // Update booking data with combined date and time

  // Save booking data to the database
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


  // Prepare the email message with booking details
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
            Date: ${moment(bookingData.date)
              .tz("America/Edmonton")
              .format("YYYY-MM-DD")}
            Time: ${moment(bookingData.date)
              .tz("America/Edmonton")
              .format("HH:mm")}
            Message: ${bookingData.message || "No additional message."}
        `,
  };

  // Send the email notification
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


// Endpoint to fetch unavailable times // Endpoint to fetch unavailable times for a specific date
app.get("/bookings/unavailable-times", async (req, res) => {
  const { date } = req.query;
  try {
    const startOfDay = moment
      .tz(date, "YYYY-MM-DD", "America/Edmonton")
      .startOf("day")
      /* .utc(); */
    const endOfDay = moment
      .tz(date, "YYYY-MM-DD", "America/Edmonton")
      .endOf("day")
      /* .utc(); */

    const bookings = await Booking.find({
      date: {
        $gte: startOfDay.toDate(),
        $lt: endOfDay.toDate(),
      },
    });

    console.log("Bookings found for the date:", bookings);

    // Initialize `timesToBlock` here
    let timesToBlock = [];


    bookings.forEach((booking) => {
      const bookingTimeEdmonton = moment(booking.date).tz("America/Edmonton");
    
      // Block the booked time and the next 2 hours (4 slots of 30 minutes each)
      for (let i = 0; i < 5; i++) { // use < 4 to block 2 hours (4 x 30 mins)
        const blockedTime = moment(bookingTimeEdmonton).clone().add(i * 30, "minutes").format("HH:mm");
        timesToBlock.push(blockedTime);
      }
    });

    // Ensure unique times using a Set
    const unavailableTimes = Array.from(new Set(timesToBlock));

    console.log("Blocked times to send to frontend:", unavailableTimes);

    res.status(200).json(unavailableTimes);
  } catch (error) {
    console.error("Error fetching bookings:", error);hi
    res
      .status(500)
      .send({ error: "Failed to fetch unavailable times", details: error });
  }
});
// Vercel Express Compatibility
import { createServer } from "http";
const server = createServer(app);
export default function handler(req, res) {
  server.emit("request", req, res);
}
app.get("/", (req, res) => {
  console.log("Received request to /");
  res.send("Backend is working!");
});
// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.get("/favicon.ico", (req, res) => res.status(204).end());
