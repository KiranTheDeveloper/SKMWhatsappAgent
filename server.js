require('dotenv').config();
const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');

const { initDatabase } = require('./src/db/index');
const { verifyWebhook } = require('./src/middleware/webhookVerify');
const { handleIncomingWebhook } = require('./src/whatsapp/webhook');
const dashboardRouter = require('./src/dashboard/router');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'skm-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Static files for dashboard
app.use('/dashboard/static', express.static(path.join(__dirname, 'public/dashboard')));

// WhatsApp webhook
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleIncomingWebhook);

// Dashboard
app.use('/dashboard', dashboardRouter);

// Root redirect
app.get('/', (req, res) => res.redirect('/dashboard'));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
  initDatabase();
  app.listen(PORT, () => {
    console.log('');
    console.log('  SKM Financial Services WhatsApp Agent');
    console.log('  ───────────────────────────────────────');
    console.log(`  Server:    http://localhost:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`  Webhook:   http://localhost:${PORT}/webhook`);
    console.log('');
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
