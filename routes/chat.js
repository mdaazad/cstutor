const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const Chat = require('../models/Chat');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/auth/login');
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 }).limit(20);
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
      chats: [],
      error: 'Could not load chat history.',
      answer: null
    });
  }
});

router.post('/ask', requireAuth, async (req, res) => {
  const { question } = req.body;
  if (!question || question.trim() === '') {
    const chats = await Chat.find({ userId: req.session.userId })
      .sort({ createdAt: -1 }).limit(20);
    return res.render('dashboard', {
      username: req.session.username,
      chats,
      error: 'Please enter a question.',
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
      error: 'The AI service is unavailable. Please try again.',
      answer: null
    });
  }
});

router.post('/:id/delete', requireAuth, async (req, res) => {
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

module.exports = router;