const express = require('express');
const router = express.Router();
const Presence = require('../models/Presence');
const auth = require('../middleware/auth');

// Update user presence
router.post('/update', auth, async (req, res) => {
  try {
    const { status, currentProject } = req.body;
    
    const presence = await Presence.findOneAndUpdate(
      { user: req.userId },
      { status, currentProject, lastSeen: new Date() },
      { upsert: true, new: true }
    );
    
    // Broadcast to all users in same project
    if (currentProject) {
      const io = req.app.get('io');
      io.to(`project-${currentProject}`).emit('presence-update', {
        user: req.userId,
        status,
        lastSeen: new Date()
      });
    }
    
    res.json(presence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get online users in a project
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const presences = await Presence.find({
      currentProject: req.params.projectId,
      status: { $in: ['online', 'away', 'busy'] }
    }).populate('user', 'name email avatar');
    
    res.json(presences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;