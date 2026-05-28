const express = require('express');
const path = require('path');
const db = require('./database');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const paymentRoutes = require('./routes/payments');
const announcementRoutes = require('./routes/announcements');
const departmentRoutes = require('./routes/departments');
const adminRoutes = require('./routes/admin');
const financeRoutes = require('./routes/finance');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (main site + portal)
app.use(express.static(path.join(__dirname)));
app.use('/portal', express.static(path.join(__dirname, 'portal')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/finance', financeRoutes);

// Portal pages
app.get('/portal/register', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'register.html')));
app.get('/portal/login', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'login.html')));
app.get('/portal/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'dashboard.html')));
app.get('/portal/profile', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'profile.html')));
app.get('/portal/card', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'card.html')));
app.get('/portal/payments', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'payments.html')));
app.get('/portal/announcements', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'announcements.html')));
app.get('/portal/departments', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'departments.html')));
app.get('/portal/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'admin-login.html')));
app.get('/portal/admin-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'admin-dashboard.html')));
app.get('/portal/finance-login', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'finance-login.html')));
app.get('/portal/finance-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'portal', 'finance-dashboard.html')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
