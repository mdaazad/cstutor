require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const { GoogleGenAI } = require('@google/genai');

const User = require('./models/User');
const Chat = require('./models/Chat');

const app = express();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err.message));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('signup', { error: 'An account with that email already exists.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, email, passwordHash });
    await user.save();
    req.session.userId   = user._id;
    req.session.username = user.username;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('signup', { error: 'Something went wrong. Please try again.' });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
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

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(20);
    res.render('dashboard', {
      username: req.session.username,
      chats,
      error:  null,
      answer: null
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('dashboard', {
      username: req.session.username,
      chats:  [],
      error:  'Could not load chat history.',
      answer: null
    });
  }
});

app.post('/ask', requireAuth, async (req, res) => {
  const { question } = req.body;

  if (!question || question.trim() === '') {
    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 }).limit(20);
    return res.render('dashboard', {
      username: req.session.username,
      chats,
      error:  'Please enter a question.',
      answer: null
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `You are a computer science tutor helping a university student.
Give a clear, educational answer with examples where helpful.
Keep your response concise but complete.

Student question: ${question.trim()}`
    });
    const answer = response.text;

    const chat = new Chat({
      userId:   req.session.userId,
      question: question.trim(),
      answer
    });
    await chat.save();

    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 }).limit(20);

    res.render('dashboard', {
      username: req.session.username,
      chats,
      error:  null,
      answer
    });
  } catch (err) {
    console.error('Ask error:', err);
    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 }).limit(20);
    res.render('dashboard', {
      username: req.session.username,
      chats,
      error:  'The AI service is unavailable. Please try again.',
      answer: null
    });
  }
});

app.post('/chat/:id/delete', requireAuth, async (req, res) => {
  try {
    await Chat.findOneAndDelete({
      _id:    req.params.id,
      userId: req.session.userId
    });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Delete error:', err);
    res.redirect('/dashboard');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});