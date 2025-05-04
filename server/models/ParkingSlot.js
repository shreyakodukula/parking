const mongoose = require('mongoose');

const ParkingSlotSchema = new mongoose.Schema({
  slotNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['available', 'booked', 'maintenance'],
    default: 'available'
  },
  type: {
    type: String,
    enum: ['standard', 'disabled', 'family', 'electric'],
    default: 'standard'
  },
  hourlyRate: {
    type: Number,
    required: true,
    default: 5
  },
  dailyRate: {
    type: Number,
    required: true,
    default: 30
  }
});

module.exports = mongoose.model('ParkingSlot', ParkingSlotSchema);