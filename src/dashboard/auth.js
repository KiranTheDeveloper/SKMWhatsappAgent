function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/dashboard/login');
}

function handleLogin(req, res) {
  const { password } = req.body;
  if (password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    req.session.agentName = req.body.agentName || 'Agent';
    res.redirect('/dashboard/app');
  } else {
    res.redirect('/dashboard/login?error=1');
  }
}

function handleLogout(req, res) {
  req.session.destroy();
  res.redirect('/dashboard/login');
}

module.exports = { requireAuth, handleLogin, handleLogout };
