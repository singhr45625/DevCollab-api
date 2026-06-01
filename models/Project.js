const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  inviteTokens: [{
    token: String,
    email: String,
    role: String,
    expiresAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  settings: {
    allowPublicView: {
      type: Boolean,
      default: false,
    },
    defaultRole: {
      type: String,
      enum: ['member', 'viewer'],
      default: 'member',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Project', ProjectSchema);