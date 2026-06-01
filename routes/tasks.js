const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const auth = require('../middleware/auth');

let notificationService;

// Initialize with socket.io instance (set in server.js)
const setNotificationService = (service) => {
  notificationService = service;
};

// Create a new task
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, priority, deadline, estimatedHours, project, assignedTo } = req.body;
    if (!title || !project) {
      return res.status(400).json({ error: 'Task title and project are required.' });
    }

    const parsedDeadline = deadline ? new Date(deadline) : undefined;
    if (deadline && Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ error: 'Invalid deadline format.' });
    }

    const taskData = {
      title,
      description,
      priority,
      deadline: parsedDeadline,
      estimatedHours: typeof estimatedHours === 'number' && !Number.isNaN(estimatedHours) ? estimatedHours : 0,
      project,
      assignedTo: assignedTo || undefined,
    };

    const task = await Task.create(taskData);
    const populatedTask = await Task.findById(task._id).populate('assignedTo');
    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tasks for a specific project
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ project: req.params.projectId })
      .populate('assignedTo')
      .sort({ createdAt: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task status with notifications
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const normalizedStatus = ['todo', 'in-progress', 'review', 'done'].includes(status)
      ? status
      : status?.toLowerCase() === 'to do'
        ? 'todo'
        : status?.toLowerCase() === 'in progress'
          ? 'in-progress'
          : status?.toLowerCase() === 'review'
            ? 'review'
            : status?.toLowerCase() === 'done'
              ? 'done'
              : status;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { status: normalizedStatus, updatedAt: Date.now() },
      { returnDocument: 'after', runValidators: true }
    ).populate('assignedTo');
    
    // Send notification for task completion
    if (normalizedStatus === 'done' && notificationService) {
      const user = await User.findById(req.userId);
      await notificationService.createTaskCompletedNotification(task, user);
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign task with notification
router.patch('/:id/assign', auth, async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { assignedTo, updatedAt: Date.now() },
      { new: true }
    ).populate('assignedTo');
    
    if (notificationService && assignedTo) {
      const assigner = await User.findById(req.userId);
      await notificationService.createTaskAssignedNotification(task, task.assignedTo, assigner);
    }
    
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check for overdue tasks (run via cron job)
router.post('/check-deadlines', async (req, res) => {
  try {
    const overdueTasks = await Task.find({
      deadline: { $lt: new Date() },
      status: { $ne: 'done' }
    }).populate('assignedTo');
    
    for (const task of overdueTasks) {
      if (notificationService) {
        await notificationService.createOverdueNotification(task);
      }
    }
    
    res.json({ message: `Checked ${overdueTasks.length} overdue tasks` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = Object.assign(router, { setNotificationService });