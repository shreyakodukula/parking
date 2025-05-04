const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');

// @route   POST api/bookings
// @desc    Create a new booking
router.post(
  '/',
  [
    auth,
    [
      check('slotId', 'Slot ID is required').not().isEmpty(),
      check('startTime', 'Start time is required').not().isEmpty(),
      check('endTime', 'End time is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { slotId, startTime, endTime, paymentMethodId } = req.body;

    try {
      const slot = await ParkingSlot.findById(slotId);
      if (!slot) {
        return res.status(404).json({ msg: 'Slot not found' });
      }

      // Check if slot is available
      if (slot.status !== 'available') {
        return res.status(400).json({ msg: 'Slot is not available' });
      }

      // Check for overlapping bookings
      const overlappingBookings = await Booking.find({
        slot: slotId,
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) },
        status: { $in: ['active'] }
      });

      if (overlappingBookings.length > 0) {
        return res.status(400).json({ msg: 'Slot is already booked for the selected time' });
      }

      // Calculate duration and amount
      const durationHours = (new Date(endTime) - new Date(startTime)) / (1000 * 60 * 60);
      let amount;
      
      if (durationHours >= 24) {
        const days = Math.ceil(durationHours / 24);
        amount = days * slot.dailyRate;
      } else {
        amount = Math.ceil(durationHours) * slot.hourlyRate;
      }

      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // in cents
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        description: `Parking slot ${slot.slotNumber} booking`,
        metadata: {
          userId: req.user.id,
          slotId: slotId
        }
      });

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ msg: 'Payment failed' });
      }

      // Create booking
      const booking = new Booking({
        user: req.user.id,
        slot: slotId,
        startTime,
        endTime,
        duration: durationHours,
        amount,
        paymentStatus: 'paid',
        paymentId: paymentIntent.id,
        status: 'active'
      });

      await booking.save();

      res.json(booking);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   PUT api/bookings/cancel/:id
// @desc    Cancel a booking
router.put('/cancel/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Check if booking can be cancelled (e.g., not already completed or cancelled)
    if (booking.status !== 'active') {
      return res.status(400).json({ msg: 'Booking cannot be cancelled' });
    }

    // Create refund with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: booking.paymentId,
      amount: Math.floor(booking.amount * 100 * 0.8) // 80% refund
    });

    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    await booking.save();

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;