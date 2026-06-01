const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const auth = require('../middleware/auth');

// Get all projects for a user (owned + shared)
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { owner: req.userId },
        { 'members.user': req.userId }
      ]
    })
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort('-createdAt');

    const ownedProjects = projects.filter(p => p.owner._id.toString() === req.userId);
    const sharedProjects = projects.filter(p => p.owner._id.toString() !== req.userId);

    res.json({
      owned: ownedProjects,
      shared: sharedProjects,
      total: projects.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new project
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;

    const project = new Project({
      name,
      description,
      owner: req.userId,
      members: [{ user: req.userId, role: 'admin' }]
    });

    await project.save();
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project (with access check)
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasAccess = project.owner._id.toString() === req.userId ||
      project.members.some(m => m.user._id.toString() === req.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    let userRole = 'owner';
    if (project.owner._id.toString() !== req.userId) {
      const member = project.members.find(m => m.user._id.toString() === req.userId);
      userRole = member ? member.role : 'none';
    }

    res.json({
      ...project.toObject(),
      userRole
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;