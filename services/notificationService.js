const Notification = require('../models/Notification');
const User = require('../models/User');

class NotificationService {
  constructor(io) {
    this.io = io;
  }

  async createNotification(userId, data) {
    try {
      const notification = new Notification({
        user: userId,
        ...data
      });
      
      await notification.save();
      await notification.populate('user', 'name email');
      
      // Emit real-time notification
      if (this.io) {
        this.io.to(`user-${userId}`).emit('new-notification', {
          notification,
          unreadCount: await this.getUnreadCount(userId)
        });
      }
      
      // Send email notification for high priority
      if (data.priority === 'urgent') {
        await this.sendEmailNotification(userId, notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  async getUnreadCount(userId) {
    return await Notification.countDocuments({ user: userId, read: false });
  }

  async sendEmailNotification(userId, notification) {
    // Integrate with email service (SendGrid, Nodemailer, etc.)
    const user = await User.findById(userId);
    if (user && user.email) {
      console.log(`Sending email to ${user.email}: ${notification.title}`);
      // Implement actual email sending here
    }
  }

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );
    
    if (notification && this.io) {
      const unreadCount = await this.getUnreadCount(userId);
      this.io.to(`user-${userId}`).emit('notification-read', { notificationId, unreadCount });
    }
    
    return notification;
  }

  async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );
    
    if (this.io) {
      this.io.to(`user-${userId}`).emit('notifications-read-all', { count: result.modifiedCount });
    }
    
    return result;
  }

  async deleteNotification(notificationId, userId) {
    const notification = await Notification.findOneAndDelete({ _id: notificationId, user: userId });
    
    if (notification && this.io) {
      const unreadCount = await this.getUnreadCount(userId);
      this.io.to(`user-${userId}`).emit('notification-deleted', { notificationId, unreadCount });
    }
    
    return notification;
  }

  async deleteAllRead(userId) {
    const result = await Notification.deleteMany({ user: userId, read: true });
    return result;
  }

  async getNotifications(userId, page = 1, limit = 20, filter = 'all') {
    const query = { user: userId };
    
    if (filter === 'unread') {
      query.read = false;
    } else if (filter !== 'all') {
      query.type = filter;
    }
    
    const notifications = await Notification.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('metadata.taskId', 'title')
      .populate('metadata.projectId', 'name')
      .populate('metadata.userId', 'name avatar');
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await this.getUnreadCount(userId);
    
    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    };
  }

  async createTaskAssignedNotification(task, assignedTo, assignedBy) {
    return await this.createNotification(assignedTo._id, {
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `${assignedBy.name} assigned you to task: "${task.title}"`,
      priority: 'high',
      metadata: {
        taskId: task._id,
        projectId: task.project,
        userId: assignedBy._id,
        actionUrl: `/project/${task.project}/task/${task._id}`
      }
    });
  }

  async createTaskCompletedNotification(task, completedBy) {
    // Notify project owner and task assignee
    const notifications = [];
    
    if (task.assignedTo && task.assignedTo.toString() !== completedBy._id.toString()) {
      notifications.push(await this.createNotification(task.assignedTo, {
        type: 'task_completed',
        title: 'Task Completed',
        message: `${completedBy.name} completed task: "${task.title}"`,
        priority: 'medium',
        metadata: {
          taskId: task._id,
          projectId: task.project,
          userId: completedBy._id,
          actionUrl: `/project/${task.project}/task/${task._id}`
        }
      }));
    }
    
    return notifications;
  }

  async createCommentNotification(comment, task, author, mentionedUsers = []) {
    const notifications = [];
    
    // Notify task assignee (if not the comment author)
    if (task.assignedTo && task.assignedTo.toString() !== author._id.toString()) {
      notifications.push(await this.createNotification(task.assignedTo, {
        type: 'comment_added',
        title: 'New Comment',
        message: `${author.name} commented on "${task.title}"`,
        priority: 'low',
        metadata: {
          taskId: task._id,
          projectId: task.project,
          commentId: comment._id,
          userId: author._id,
          actionUrl: `/project/${task.project}/task/${task._id}`
        }
      }));
    }
    
    // Notify mentioned users
    for (const mentionedUser of mentionedUsers) {
      if (mentionedUser.toString() !== author._id.toString()) {
        notifications.push(await this.createNotification(mentionedUser, {
          type: 'mention',
          title: 'You were mentioned',
          message: `${author.name} mentioned you in a comment on "${task.title}"`,
          priority: 'medium',
          metadata: {
            taskId: task._id,
            projectId: task.project,
            commentId: comment._id,
            userId: author._id,
            actionUrl: `/project/${task.project}/task/${task._id}`
          }
        }));
      }
    }
    
    return notifications;
  }

  async createDeadlineReminder(task) {
    if (!task.assignedTo) return null;
    
    const hoursUntilDeadline = (task.deadline - new Date()) / (1000 * 60 * 60);
    let priority = 'low';
    let title = 'Deadline Approaching';
    
    if (hoursUntilDeadline < 24) {
      priority = 'urgent';
      title = '⚠️ Task Deadline Today!';
    } else if (hoursUntilDeadline < 72) {
      priority = 'high';
      title = 'Deadline Approaching Soon';
    }
    
    return await this.createNotification(task.assignedTo, {
      type: 'deadline_approaching',
      title,
      message: `Task "${task.title}" is due on ${task.deadline.toLocaleDateString()}`,
      priority,
      metadata: {
        taskId: task._id,
        projectId: task.project,
        actionUrl: `/project/${task.project}/task/${task._id}`
      }
    });
  }

  async createOverdueNotification(task) {
    if (!task.assignedTo) return null;
    
    return await this.createNotification(task.assignedTo, {
      type: 'task_overdue',
      title: '❌ Task Overdue!',
      message: `Task "${task.title}" is overdue by ${Math.ceil((new Date() - task.deadline) / (1000 * 60 * 60 * 24))} days`,
      priority: 'urgent',
      metadata: {
        taskId: task._id,
        projectId: task.project,
        actionUrl: `/project/${task.project}/task/${task._id}`
      }
    });
  }

  async checkAndSendDeadlineReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);
    
    // Find tasks with upcoming deadlines
    const tasks = await Task.find({
      deadline: { $gte: tomorrow, $lte: nextWeek },
      status: { $ne: 'done' }
    }).populate('assignedTo');
    
    for (const task of tasks) {
      await this.createDeadlineReminder(task);
    }
  }
}

module.exports = NotificationService;