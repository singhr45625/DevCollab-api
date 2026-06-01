const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['task_assigned', 'task_completed', 'task_review', 'comment_added', 'project_invite', 'deadline_approaching', 'task_overdue', 'mention'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  metadata: {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    actionUrl: String,
    thumbnail: String,
  },
  delivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: Date,
  readAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30*24*60*60*1000) // 30 days
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
});

// Auto-delete old notifications
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', NotificationSchema);