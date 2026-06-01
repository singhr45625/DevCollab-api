const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: [
      'created_task',
      'updated_task',
      'completed_task',
      'deleted_task',
      'commented',
      'joined_project',
      'left_project',
      'changed_status',
      'uploaded_file'
    ],
    required: true
  },
  details: {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    taskTitle: String,
    oldStatus: String,
    newStatus: String,
    comment: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);