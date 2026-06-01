const mongoose = require('mongoose');

const PresenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  currentProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  typingIn: [{
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    isTyping: Boolean,
    updatedAt: Date
  }]
});

module.exports = mongoose.model('Presence', PresenceSchema);