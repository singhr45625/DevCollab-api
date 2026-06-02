const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { sendMail, smtpEnabled } = require('../services/mailerService');

// Generate invite link for a project
router.post('/project/:projectId/invite', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, role = 'member' } = req.body;
    
    // Check if user is project owner or admin
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isAdmin = project.owner?.toString() === req.userId || 
                    project.members.some(m => m.user?.toString() === req.userId && m.role === 'admin');
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can invite users' });
    }
    
    // Check if user already exists in system
    const existingUser = await User.findOne({ email });
    
    // Generate invite token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days
    
    project.inviteTokens.push({
      token,
      email,
      role,
      expiresAt,
      createdBy: req.userId
    });
    
    await project.save();
    
    // Build the invitation URL using the configured frontend URL or request origin.
    // In production, set FRONTEND_URL to your Vercel app so email links never point to localhost.
    const frontendEnvUrl = process.env.FRONTEND_URL?.trim();
    const frontendBase = (frontendEnvUrl && frontendEnvUrl !== 'http://localhost:3000'
      ? frontendEnvUrl
      : req.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
    const inviteUrl = `${frontendBase}/invite/${token}`;
    let emailQueued = false;

    console.log(`Invite request: user=${req.userId} project=${projectId} email=${email} smtpEnabled=${smtpEnabled}`);

    const mailOptions = {
      to: email,
      subject: `Invitation to join ${project.name}`,
      text: `You have been invited to join the project \"${project.name}\". Accept your invitation here: ${inviteUrl}`,
      html: `
            <p>You have been invited to join the project <strong>${project.name}</strong>.</p>
            <p><a href="${inviteUrl}">Click here to accept the invitation</a></p>
            <p>This link expires in 7 days.</p>
          `,
    };

    if (smtpEnabled) {
      emailQueued = true;
      sendMail(mailOptions)
        .then(() => {
          console.log(`✓ Invite email sent to ${email}`);
        })
        .catch((err) => {
          console.error(`✗ Failed to send invite email to ${email}:`, err.message || err);
        });
    } else {
      console.warn('⚠ SMTP is not configured. Invitation created but email NOT sent.');
    }

    // If user already exists, send real-time notification (non-blocking)
    if (existingUser) {
      const NotificationService = require('../services/notificationService');
      const notificationService = new NotificationService(req.app.get('io'));
      notificationService.createNotification(existingUser._id, {
        type: 'project_invite',
        title: 'Project Invitation',
        message: `You've been invited to join project: ${project.name}`,
        priority: 'high',
        metadata: {
          projectId: project._id,
          inviteToken: token,
          actionUrl: `/invite/${token}`
        }
      }).catch((err) => {
        console.error('Failed to save notification:', err);
      });
    }
    
    res.json({ 
      message: smtpEnabled
        ? 'Invitation created. Email delivery has been queued.'
        : 'Invitation created. SMTP is not configured, so email was not sent.',
      inviteUrl,
      token,
      emailQueued,
      smtpEnabled
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify invitation token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const project = await Project.findOne({
      'inviteTokens.token': token,
      'inviteTokens.expiresAt': { $gt: new Date() }
    });

    if (!project) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const invite = project.inviteTokens.find(t => t.token === token);
    if (!invite) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    const inviter = await User.findById(invite.createdBy);

    res.json({
      projectName: project.name,
      description: project.description || 'Project invitation',
      invitedBy: inviter ? inviter.name : 'Project owner',
      expiresAt: invite.expiresAt,
      email: invite.email,
      role: invite.role
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept invitation
router.post('/accept/:token', auth, async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find project with this invite token
    const project = await Project.findOne({
      'inviteTokens.token': token,
      'inviteTokens.expiresAt': { $gt: new Date() }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    
    const invite = project.inviteTokens.find(t => t.token === token);
    if (!invite) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Check if email matches logged in user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.email !== invite.email) {
      return res.status(403).json({ error: 'This invitation is for a different email address' });
    }
    
    // Check if already a member
    const alreadyMember = project.members.some(m => m.user?.toString() === req.userId);
    if (alreadyMember) {
      return res.status(400).json({ error: 'Already a member of this project' });
    }
    
    // Add user as member
    project.members.push({
      user: req.userId,
      role: invite.role,
      joinedAt: new Date()
    });
    
    // Remove used invite token
    project.inviteTokens = project.inviteTokens.filter(t => t.token !== token);
    
    await project.save();
    
    // Create activity log
    const ActivityLog = require('../models/ActivityLog');
    await ActivityLog.create({
      projectId: project._id,
      user: req.userId,
      action: 'joined_project',
      details: {}
    });
    
    // Notify project owner
    const NotificationService = require('../services/notificationService');
    const notificationService = new NotificationService(req.app.get('io'));
    await notificationService.createNotification(project.owner, {
      type: 'project_invite',
      title: 'New Team Member',
      message: `${user.name} joined ${project.name}`,
      metadata: {
        projectId: project._id
      }
    });
    
    const io = req.app.get('io');
    io.to(`project-${project._id}`).emit('member-joined', { user, role: invite.role });
    
    res.json({ 
      message: 'Successfully joined project',
      project: {
        _id: project._id,
        name: project.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project members
router.get('/project/:projectId/members', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('members.user', 'name email avatar')
      .populate('owner', 'name email avatar');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check access
    const hasAccess = project.owner._id.toString() === req.userId ||
                      project.members.some(m => m.user && m.user._id.toString() === req.userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const members = project.members
      .filter(m => m.user) // Only include members with valid user data
      .map(m => ({
        _id: m.user._id,
        name: m.user.name,
        email: m.user.email,
        avatar: m.user.avatar,
        role: m.role,
        joinedAt: m.joinedAt
      }));
    
    res.json({
      owner: {
        _id: project.owner._id,
        name: project.owner.name,
        email: project.owner.email,
        avatar: project.owner.avatar
      },
      members,
      totalMembers: members.length + 1
    });
  } catch (error) {
    console.error('Failed to fetch project members:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove member from project
router.delete('/project/:projectId/members/:userId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if requester is owner or admin
    const isOwner = project.owner?.toString() === req.userId;
    const isAdmin = project.members.some(m => m.user?.toString() === req.userId && m.role === 'admin');
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only owners/admins can remove members' });
    }
    
    project.members = project.members.filter(m => m.user?.toString() !== req.params.userId);
    await project.save();
    
    const io = req.app.get('io');
    io.to(`project-${project._id}`).emit('member-removed', { userId: req.params.userId });
    
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leave project
router.post('/project/:projectId/leave', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if owner cannot leave (must transfer ownership first)
    if (project.owner?.toString() === req.userId) {
      return res.status(400).json({ error: 'Project owner cannot leave. Transfer ownership first or delete project.' });
    }
    
    project.members = project.members.filter(m => m.user?.toString() !== req.userId);
    await project.save();
    
    const io = req.app.get('io');
    io.to(`project-${project._id}`).emit('member-left', { userId: req.userId });
    
    res.json({ message: 'Left project successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transfer project ownership
router.post('/project/:projectId/transfer/:newOwnerId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Only current owner can transfer
    if (project.owner?.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can transfer ownership' });
    }
    
    // Check if new owner is a member
    const isMember = project.members.some(m => m.user?.toString() === req.params.newOwnerId);
    if (!isMember) {
      return res.status(400).json({ error: 'New owner must be a project member' });
    }
    
    // Transfer ownership
    project.owner = req.params.newOwnerId;
    
    // Add current owner as admin member if not already
    const isCurrentOwnerMember = project.members.some(m => m.user?.toString() === req.userId);
    if (!isCurrentOwnerMember) {
      project.members.push({
        user: req.userId,
        role: 'admin'
      });
    }
    
    await project.save();
    
    const io = req.app.get('io');
    io.to(`project-${project._id}`).emit('ownership-transferred', { newOwnerId: req.params.newOwnerId });
    
    res.json({ message: 'Ownership transferred successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;