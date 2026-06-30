const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerName: {
    type: String,
    required: true,
    minlength: 2
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    default: ''
  },
  pickupDate: {
    type: String,
    required: true
  },
  pickupTime: {
    type: String,
    required: true
  },
  garmentCount: {
    type: Number,
    required: true,
    min: 1,
    max: 50,
    default: 1
  },
  garmentTypes: {
    type: [String],
    default: ['General Garments']
  },
  specialInstructions: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: ['Scheduled', 'Picked Up', 'In Cleaning', 'Ready', 'Completed'],
    default: 'Scheduled'
  }
}, {
  // Automatically manage createdAt and updatedAt fields
  timestamps: true
});

module.exports = mongoose.model('Order', OrderSchema);
