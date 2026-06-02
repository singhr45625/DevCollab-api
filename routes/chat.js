const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// Get messages for a project
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50, before } = req.query;
    
    let query = { projectId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    const messages = await Message.find(query)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .populate('sender', 'name email avatar')
      .populate('mentions', 'name email')
      .populate('replyTo');
    
    res.json(messages.reverse()); // Return chronological order
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
router.post('/', auth, async (req, res) => {
  try {
    const { projectId, content, mentions = [], replyTo = null } = req.body;
    
    const message = new Message({
      projectId,
      sender: req.userId,
      content,
      mentions,
      replyTo
    });
    
    await message.save();
    await message.populate('sender', 'name email avatar');
    
    // Emit to all users in the project
    const io = req.app.get('io');
    io.to(`project-${projectId}`).emit('new-message', message);
    
    // Create notifications for mentioned users
    if (mentions.length > 0) {
      const NotificationService = require('../services/notificationService');
      const notificationService = new NotificationService(req.app.get('io'));
      for (const userId of mentions) {
        await notificationService.createNotification(userId, {
          type: 'mention',
          title: 'You were mentioned',
          message: `${message.sender.name} mentioned you in project chat`,
          metadata: {
            projectId,
            messageId: message._id
          }
        });
      }
    }
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
router.post('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message.readBy.some(r => r.user.toString() === req.userId)) {
      message.readBy.push({ user: req.userId });
      await message.save();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add reaction to message
router.post('/:messageId/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    
    const existingReaction = message.reactions.find(r => r.user.toString() === req.userId);
    if (existingReaction) {
      existingReaction.emoji = emoji;
    } else {
      message.reactions.push({ user: req.userId, emoji });
    }
    
    await message.save();
    
    const io = req.app.get('io');
    io.to(`project-${message.projectId}`).emit('message-reaction', {
      messageId: message._id,
      reactions: message.reactions
    });
    
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;