const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['text', 'file', 'image', 'code'],
    default: 'text'
  },
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    type: String
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Message', MessageSchema);