const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const Project = require('../models/Project');
const auth = require('../middleware/auth');

// Get activities for a specific project
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Verify user has access to this project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const hasAccess = project.owner.toString() === req.userId ||
                      project.members.some(m => m.user?.toString() === req.userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Fetch activity logs for this project, sorted by newest first
    const activities = await ActivityLog.find({ projectId })
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(activities);
  } catch (error) {
    console.error('Failed to fetch project activities:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all activities for user's projects
router.get('/dashboard', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.userId }, { 'members.user': req.userId }]
    });
    
    const projectIds = projects.map(p => p._id);
    
    // Fetch recent activities from all user's projects
    const activities = await ActivityLog.find({ projectId: { $in: projectIds } })
      .populate('user', 'name email avatar')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json(activities);
  } catch (error) {
    console.error('Failed to fetch dashboard activities:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
