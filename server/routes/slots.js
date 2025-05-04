const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');

// @route   GET api/slots
// @desc    Get all available parking slots
router.get('/', auth, async (req, res) => {
  try {
    const slots = await ParkingSlot.find({ status: 'available' });
    res.json(slots);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/slots/available
// @desc    Check slot availability for a time period
router.get('/available', auth, async (req, res) => {
  const { startTime, endTime } = req.query;

  try {
    // Find all slots
    const allSlots = await ParkingSlot.find();

    // Find bookings that overlap with the requested time period
    const overlappingBookings = await Booking.find({
      $or: [
        {
          startTime: { $lt: new Date(endTime) },
          endTime: { $gt: new Date(startTime) },
          status: { $in: ['active'] }
        }
      ]
    });

    // Get IDs of booked slots
    const bookedSlotIds = overlappingBookings.map(booking => booking.slot.toString());

    // Filter available slots
    const availableSlots = allSlots.filter(slot => 
      slot.status === 'available' && !bookedSlotIds.includes(slot._id.toString())
    );

    res.json(availableSlots);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;