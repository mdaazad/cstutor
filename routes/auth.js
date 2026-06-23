const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

router.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (username.trim().length < 3) {
      return res.render('signup', { error: 'Username must be at least 3 characters.' });
    }
    if (password.length < 6) {
      return res.render('signup', { error: 'Password must be at least 6 characters.' });
    }
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.render('signup', { error: 'An account with that email already exists.' });
    }
    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      return res.render('signup', { error: 'That username is already taken.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username: username.trim(), email, passwordHash });
    await user.save();
    req.session.userId   = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('signup', { error: 'Something went wrong. Please try again.' });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('login', { error: 'Invalid email or password.' });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.render('login', { error: 'Invalid email or password.' });
    }
    req.session.userId   = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/auth/login');
  });
});

module.exports = router;