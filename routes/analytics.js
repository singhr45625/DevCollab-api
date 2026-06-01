const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Project = require('../models/Project');
const auth = require('../middleware/auth');

router.get('/dashboard', auth, async (req, res) => {
  try {
    // Get user's projects
    const projects = await Project.find({
      $or: [{ owner: req.userId }, { 'members.user': req.userId }]
    });
    
    const projectIds = projects.map(p => p._id);
    
    // Task statistics
    const tasks = await Task.find({ project: { $in: projectIds } });
    
    const stats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'done').length,
      inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
      todoTasks: tasks.filter(t => t.status === 'todo').length,
      reviewTasks: tasks.filter(t => t.status === 'review').length,
      tasksByPriority: {
        low: tasks.filter(t => t.priority === 'low').length,
        medium: tasks.filter(t => t.priority === 'medium').length,
        high: tasks.filter(t => t.priority === 'high').length,
        urgent: tasks.filter(t => t.priority === 'urgent').length,
      },
      overdueTasks: tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done').length,
      completionRate: tasks.length > 0 ? (tasks.filter(t => t.status === 'done').length / tasks.length * 100).toFixed(1) : 0,
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;