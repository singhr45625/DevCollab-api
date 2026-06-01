const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Get user notifications with pagination and filters
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filter = req.query.filter || 'all';
    
    const query = { user: req.userId };
    
    if (filter === 'unread') {
      query.read = false;
    } else if (filter !== 'all') {
      query.type = filter;
    }
    
    const notifications = await Notification.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ user: req.userId, read: false });
    
    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notification statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ user: req.userId, read: false });
    const totalCount = await Notification.countDocuments({ user: req.userId });
    
    const byType = await Notification.aggregate([
      { $match: { user: req.userId } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    
    const byPriority = await Notification.aggregate([
      { $match: { user: req.userId, read: false } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    res.json({
      unreadCount,
      totalCount,
      byType: byType.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
      byPriority: byPriority.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { read: true, readAt: new Date() },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.patch('/read-all', auth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.userId, read: false },
      { read: true, readAt: new Date() }
    );
    
    res.json({ message: `${result.modifiedCount} notifications marked as read` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete single notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.userId
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all read notifications
router.delete('/read/all', auth, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      user: req.userId,
      read: true
    });
    
    res.json({ message: `${result.deletedCount} notifications deleted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;