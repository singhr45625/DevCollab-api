const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Get all users (for task assignment)
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;