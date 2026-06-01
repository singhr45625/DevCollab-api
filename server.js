const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketio = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors:{
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', "PUT", "DELETE", "PATCH"],
        credentials: true
    }
});

const NotificationService = require('./services/notificationService');
const tasksRoute = require('./routes/tasks');
const notificationService = new NotificationService(io);

tasksRoute.setNotificationService(notificationService);
app.set('io', io);

// Security middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://devcollab-api-yuhm.onrender.com',
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy does not allow this origin'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // higher limit in development
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// mongo db connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Routes

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', tasksRoute);
app.use('/api/comments', require('./routes/comments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/presence', require('./routes/presence'));
app.use('/api/invitations', require('./routes/invitation'));
// app.use('/api/users', require('./routes/users'));
app.use('/api/analytics', require('./routes/analytics'));
// app.use('/api/uploads', require('./routes/uploads'));

// Socket.io for real-time collaboration

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on('joinProject', (projectId) => {
        socket.join(projectId);
        console.log(`Client ${socket.id} joined project ${projectId}`);
    });

    socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Socket ${socket.id} joined user ${userId}`);
    });

    socket.on('task-update', (data) => {
        io.to(data.projectId).emit('task-updated', data);
        io.emit('dashboard-update', data);
    });
    
    socket.on('new-comment', (data) => {
    io.to(data.projectId).emit('comment-added', data);
    });
  
    socket.on('notification', (data) => {
        io.to(`user-${data.userId}`).emit('new-notification', data);
    });
    socket.on('disconnect', () =>{
        console.log(`Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
