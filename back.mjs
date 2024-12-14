import dotenv from "dotenv";
dotenv.config();
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import sgMail from "@sendgrid/mail";
import mongoose from "mongoose";
import moment from "moment-timezone"; // Import moment-timezone
import swaggerUi from "swagger-ui-express";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerSpec from "./swagger.js";


const app = express();


// Middleware to serve Swagger docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
  console.log("Swagger Docs available at http://localhost:3001/api-docs");
});



const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());

// configure sendgrid
sgMail.setApiKey(process.env.API_KEY);
// Configure Cors

// Whitelist Vercel domain
const allowedOrigins = [
  "https://www.makeupbybims.com",
  "http://localhost:5173",
  "http://localhost:3001"
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

console.log(bookingSchema);
// Endpoint to handle booking data and send an email
// app.post("/book", async (req, res) => {
//   const bookingData = req.body;

//   // Combine date and time into a single field
//   const bookingDateTime = moment
//     .tz(
//       `${bookingData.date} ${bookingData.time}`,
//       "YYYY-MM-DD HH:mm",
//       "Africa/Lagos"
//     )
//     .toDate();

// const moment = require("moment-timezone");


app.post("/book", async (req, res) => {

  debugger;
  const bookingData = req.body;

  // Combine date and time into a single field and adjust to Calgary time
   // Combine date and time into a single field without any timezone conversion
   const bookingDateTime = moment(`${bookingData.date} ${bookingData.time}`, "YYYY-MM-DD HH:mm").toDate();
  //  const bookingDateTime = moment(`${bookingData.date} ${bookingData.time}`, "YYYY-MM-DD HH:mm")
  //  .add(1, 'hours')  // Add 1 hour to the time
  //  .toDate();

  bookingData.date = bookingDateTime; // Update booking data with combined date and time

  // Save booking data to the database
  const booking = new Booking(bookingData);
  try {
    await booking.save();
    console.log("Booking saved successfully:", booking);
  } catch (error) {
    console.error("Error saving booking:", error);
    return res.status(500).json({ message: "Failed to save booking data." });
  }

  // Prepare the email message with booking details
  const msg = {
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
            Date: ${moment(bookingData.date).format("YYYY-MM-DD")}
            Time: ${moment(bookingData.date).format("HH:mm")}
            Message: ${bookingData.message || "No additional message."}
        `,
  };

  // Send the email notification
  try {
    await sgMail.send(msg);
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

    bookings.map((booking) => {
      const bookingTime = moment(booking.date);
      console.log("Booking time:", bookingTime);

      // Block the booked time and the next 2 hours (4 slots of 30 minutes each)
      for (let i = 0; i <= 4; i++) {
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
// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });
