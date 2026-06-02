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
    let emailSent = false;
    let emailError = null;

    if (smtpEnabled) {
      try {
        await sendMail({
          to: email,
          subject: `Invitation to join ${project.name}`,
          text: `You have been invited to join the project \"${project.name}\". Accept your invitation here: ${inviteUrl}`,
          html: `
            <p>You have been invited to join the project <strong>${project.name}</strong>.</p>
            <p><a href="${inviteUrl}">Click here to accept the invitation</a></p>
            <p>This link expires in 7 days.</p>
          `,
        });

        emailSent = true;
        console.log(`Invite email sent to ${email}: ${inviteUrl}`);
      } catch (err) {
        emailError = err.message || 'Unknown error sending email';
        console.error('Failed to send invite email:', err);
      }
    } else {
      console.warn('SMTP is not configured. Invitation will still be created and invite URL returned.');
    }

    // If user already exists, send real-time notification
    if (existingUser) {
      const notification = new Notification({
        user: existingUser._id,
        type: 'project_invite',
        title: 'Project Invitation',
        message: `You've been invited to join project: ${project.name}`,
        priority: 'high',
        metadata: {
          projectId: project._id,
          inviteToken: token,
          actionUrl: `/invite/${token}`
        }
      });
      await notification.save();
      
      const io = req.app.get('io');
      io.to(`user-${existingUser._id}`).emit('new-notification', { notification });
    }
    
    res.json({ 
      message: emailSent ? 'Invitation sent successfully' : 'Invitation created. Email sending is disabled or failed.',
      inviteUrl,
      token,
      emailSent,
      emailError
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
    const notification = new Notification({
      user: project.owner,
      type: 'project_invite',
      title: 'New Team Member',
      message: `${user.name} joined ${project.name}`,
      metadata: {
        projectId: project._id
      }
    });
    await notification.save();
    
    const io = req.app.get('io');
    io.to(`user-${project.owner}`).emit('new-notification', { notification });
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
    
    // Check access
    const hasAccess = project.owner.toString() === req.userId ||
                      project.members.some(m => m.user._id.toString() === req.userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const members = project.members.map(m => ({
      ...m.user.toObject(),
      role: m.role,
      joinedAt: m.joinedAt
    }));
    
    res.json({
      owner: project.owner,
      members,
      totalMembers: members.length + 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove member from project
router.delete('/project/:projectId/members/:userId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    // Check if requester is owner or admin
    const isOwner = project.owner.toString() === req.userId;
    const isAdmin = project.members.some(m => m.user.toString() === req.userId && m.role === 'admin');
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only owners/admins can remove members' });
    }
    
    project.members = project.members.filter(m => m.user.toString() !== req.params.userId);
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
    
    // Check if owner cannot leave (must transfer ownership first)
    if (project.owner.toString() === req.userId) {
      return res.status(400).json({ error: 'Project owner cannot leave. Transfer ownership first or delete project.' });
    }
    
    project.members = project.members.filter(m => m.user.toString() !== req.userId);
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
    
    // Only current owner can transfer
    if (project.owner.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only project owner can transfer ownership' });
    }
    
    // Check if new owner is a member
    const isMember = project.members.some(m => m.user.toString() === req.params.newOwnerId);
    if (!isMember) {
      return res.status(400).json({ error: 'New owner must be a project member' });
    }
    
    // Transfer ownership
    project.owner = req.params.newOwnerId;
    
    // Add current owner as admin member if not already
    const isCurrentOwnerMember = project.members.some(m => m.user.toString() === req.userId);
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