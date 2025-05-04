const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');

// Middleware to check if user is admin
const adminCheck = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Admin access required' });
  }
  next();
};

// @route   GET api/admin/users
// @desc    Get all users (admin only)
router.get('/users', [auth, adminCheck], async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/admin/bookings
// @desc    Get all bookings (admin only)
router.get('/bookings', [auth, adminCheck], async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user', 'name email')
      .populate('slot', 'slotNumber type')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/admin/occupancy
// @desc    Get current occupancy stats (admin only)
router.get('/occupancy', [auth, adminCheck], async (req, res) => {
  try {
    const totalSlots = await ParkingSlot.countDocuments();
    const availableSlots = await ParkingSlot.countDocuments({ status: 'available' });
    const bookedSlots = await ParkingSlot.countDocuments({ status: 'booked' });
    const maintenanceSlots = await ParkingSlot.countDocuments({ status: 'maintenance' });

    const activeBookings = await Booking.countDocuments({ status: 'active' });

    res.json({
      totalSlots,
      availableSlots,
      bookedSlots,
      maintenanceSlots,
      activeBookings,
      occupancyRate: ((totalSlots - availableSlots) / totalSlots) * 100
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/admin/slots
// @desc    Add a new parking slot (admin only)
router.post(
  '/slots',
  [
    auth, 
    adminCheck,
    [
      check('slotNumber', 'Slot number is required').not().isEmpty(),
      check('type', 'Type is required').not().isEmpty(),
      check('hourlyRate', 'Hourly rate is required').isNumeric(),
      check('dailyRate', 'Daily rate is required').isNumeric()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { slotNumber, type, status, hourlyRate, dailyRate } = req.body;

    try {
      let slot = await ParkingSlot.findOne({ slotNumber });

      if (slot) {
        return res.status(400).json({ msg: 'Slot already exists' });
      }

      slot = new ParkingSlot({
        slotNumber,
        type,
        status: status || 'available',
        hourlyRate,
        dailyRate
      });

      await slot.save();

      res.json(slot);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/admin/slots/:id
// @desc    Update a parking slot (admin only)
router.put(
  '/slots/:id',
  [
    auth, 
    adminCheck,
    [
      check('slotNumber', 'Slot number is required').not().isEmpty(),
      check('type', 'Type is required').not().isEmpty(),
      check('hourlyRate', 'Hourly rate is required').isNumeric(),
      check('dailyRate', 'Daily rate is required').isNumeric()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { slotNumber, type, status, hourlyRate, dailyRate } = req.body;

    try {
      let slot = await ParkingSlot.findById(req.params.id);

      if (!slot) {
        return res.status(404).json({ msg: 'Slot not found' });
      }

      // Check if slot number is being changed to one that already exists
      if (slot.slotNumber !== slotNumber) {
        const existingSlot = await ParkingSlot.findOne({ slotNumber });
        if (existingSlot) {
          return res.status(400).json({ msg: 'Slot number already in use' });
        }
      }

      slot.slotNumber = slotNumber;
      slot.type = type;
      slot.status = status || slot.status;
      slot.hourlyRate = hourlyRate;
      slot.dailyRate = dailyRate;

      await slot.save();

      res.json(slot);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   DELETE api/admin/slots/:id
// @desc    Delete a parking slot (admin only)
router.delete('/slots/:id', [auth, adminCheck], async (req, res) => {
  try {
    const slot = await ParkingSlot.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({ msg: 'Slot not found' });
    }

    // Check if slot has active bookings
    const activeBookings = await Booking.countDocuments({
      slot: req.params.id,
      status: 'active'
    });

    if (activeBookings > 0) {
      return res.status(400).json({ msg: 'Cannot delete slot with active bookings' });
    }

    await slot.remove();

    res.json({ msg: 'Slot removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;