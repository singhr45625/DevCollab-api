const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Get comments for a task
router.get('/task/:taskId', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ task: req.params.taskId })
      .populate('author', 'name email avatar')
      .sort('-createdAt');
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment to task
router.post('/', auth, async (req, res) => {
  try {
    const { content, taskId, attachments } = req.body;
    
    const comment = new Comment({
      content,
      task: taskId,
      author: req.userId,
      attachments: attachments || [],
    });
    
    await comment.save();
    
    // Populate author info
    await comment.populate('author', 'name email avatar');
    
    // Get task to find assigned user
    const task = await Task.findById(taskId).populate('assignedTo');
    
    // Create notification for task assignee
    if (task.assignedTo && task.assignedTo._id.toString() !== req.userId) {
      const NotificationService = require('../services/notificationService');
      const notificationService = new NotificationService(req.app.get('io'));
      await notificationService.createNotification(task.assignedTo._id, {
        type: 'comment_added',
        title: 'New Comment',
        message: `New comment on task: ${task.title}`,
        metadata: {
          taskId: task._id,
          projectId: task.project,
          commentId: comment._id,
        },
      });
    }
    
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;