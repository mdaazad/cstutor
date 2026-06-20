// ============================================================
// CSTUTOR — app.js
// The entire Express server lives in this file.
// ============================================================


// ── STEP 1: LOAD ENVIRONMENT VARIABLES ──────────────────────
// dotenv.config() reads your .env file and loads each line
// into process.env. This MUST be the first line — before any
// other require() calls, because other packages may read
// process.env during their own initialization.
require('dotenv').config();


// ── STEP 2: IMPORT PACKAGES ─────────────────────────────────
const { GoogleGenAI } = require('@google/genai');
const express = require('express');
const session = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
// NOTE: mongoose and the model files are NOT imported here.
// We are using in-memory arrays instead of MongoDB for now.
// When you add MongoDB later, you will restore these imports.


// ── STEP 3: CREATE THE EXPRESS APP ──────────────────────────
// express() returns an application object. All configuration,
// middleware, and routes attach to this object.
const app = express();


// ── STEP 4: IN-MEMORY DATA STORE ────────────────────────────
// Instead of MongoDB, we use plain JavaScript arrays.
// These behave like database collections during testing.
// WARNING: all data resets every time you restart the server.
// This is intentional — we add real MongoDB in the next phase.

const usersStore = [];  // holds user objects
const chatsStore = [];  // holds chat objects

// MongoDB normally auto-generates unique IDs (ObjectId).
// For now we use a simple incrementing counter.
let nextId = 1;
function generateId() {
  return String(nextId++);
}

console.log('✅ In-memory store ready (no MongoDB needed yet)');


// ── STEP 5: IN-MEMORY MODEL HELPERS ─────────────────────────
// These objects expose the same method names that Mongoose uses.
// Your routes call User.findOne(), Chat.find(), etc. — they work
// identically whether the data comes from memory or MongoDB.
// When we switch to MongoDB, only these helpers change —
// the routes stay exactly the same.

// ---- User helpers ----
const User = {
  // Find first user matching the email. Returns object or null.
  // Mirrors Mongoose: await User.findOne({ email })
  findOne: async ({ email }) => {
    return usersStore.find(u => u.email === email.toLowerCase()) || null;
  }
};

// UserDoc mimics what `new User({...})` returns in Mongoose.
// It has a .save() method that inserts into usersStore.
function UserDoc({ username, email, passwordHash }) {
  this._id          = generateId();
  this.username     = username;
  this.email        = email.toLowerCase();
  this.passwordHash = passwordHash;
  this.createdAt    = new Date();

  // .save() pushes this object into the array — like a DB insert
  this.save = async function () {
    usersStore.push(this);
  };
}

// ---- Chat helpers ----
const Chat = {
  // Returns chats for a userId, newest first, max 20.
  // Mirrors Mongoose: await Chat.find({ userId }).sort({ createdAt: -1 }).limit(20)
  find: ({ userId }) => ({
    sort: () => ({
      limit: () => {
        const results = chatsStore
          .filter(c => c.userId === userId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20);
        return Promise.resolve(results);
      }
    })
  }),

  // Deletes the chat that matches both _id AND userId.
  // The userId check means users can only delete their own chats.
  // Mirrors Mongoose: await Chat.findOneAndDelete({ _id, userId })
  findOneAndDelete: async ({ _id, userId }) => {
    const index = chatsStore.findIndex(
      c => c._id === _id && c.userId === userId
    );
    if (index !== -1) chatsStore.splice(index, 1);
  }
};

// ChatDoc mimics what `new Chat({...})` returns in Mongoose.
function ChatDoc({ userId, question, answer }) {
  this._id       = generateId();
  this.userId    = userId;
  this.question  = question;
  this.answer    = answer;
  this.createdAt = new Date();

  this.save = async function () {
    chatsStore.push(this);
  };
}


// ── STEP 6: CONFIGURE EJS AS THE VIEW ENGINE ─────────────────
// 'view engine' tells Express to use EJS to compile .ejs files.
// 'views' tells Express where the template files live.
// __dirname = absolute path to the folder containing app.js.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// ── STEP 7: SERVE STATIC FILES ───────────────────────────────
// Any file inside /public/ is served directly to the browser.
// public/style.css → available at http://localhost:3000/style.css
// Your EJS files link to it with: <link href="/style.css">
app.use(express.static(path.join(__dirname, 'public')));


// ── STEP 8: PARSE REQUEST BODIES ─────────────────────────────
// urlencoded: decodes HTML form submissions into req.body
// json: decodes fetch() JSON payloads into req.body
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// ── STEP 9: CONFIGURE SESSIONS ───────────────────────────────
// express-session adds req.session to every request.
// After login we write req.session.userId = user._id.
// On every future request, Express reads the browser cookie
// and restores req.session automatically — keeping user logged in.
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24  // 1 day in milliseconds
  }
}));


// ── STEP 10: AUTH MIDDLEWARE ──────────────────────────────────
// Protects routes that require login.
// Usage: app.get('/dashboard', requireAuth, handler)
// If the user has a session → next() → route handler runs.
// If not → redirect to /login → route handler never runs.
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}


// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────


// ── GET / ─────────────────────────────────────────────────────
// Root — redirect based on whether user is logged in.
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});


// ── GET /signup ───────────────────────────────────────────────
// Render the signup page.
// We always pass { error: null } so the EJS template has
// the variable available even when there is no error.
// Without it, EJS throws "error is not defined".
app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});


// ── POST /signup ──────────────────────────────────────────────
// Process the signup form submission.
app.post('/signup', async (req, res) => {
  // req.body fields match the name="..." attributes in signup.ejs
  const { username, email, password } = req.body;

  try {
    // Check if this email is already registered.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('signup', {
        error: 'An account with that email already exists.'
      });
    }

    // Hash the password with bcrypt before saving.
    // 10 = salt rounds. A salt is random data mixed into the
    // password before hashing — so two users with the same
    // password produce different hashes.
    const passwordHash = await bcrypt.hash(password, 10);

    // Create a new user document and save it to the store.
    const user = new UserDoc({ username, email, passwordHash });
    await user.save();

    // Store identity in the session.
    // This is what "being logged in" means — userId exists in session.
    req.session.userId   = user._id;
    req.session.username = user.username;

    res.redirect('/dashboard');

  } catch (err) {
    console.error('Signup error:', err);
    res.render('signup', {
      error: 'Something went wrong. Please try again.'
    });
  }
});


// ── GET /login ────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});


// ── POST /login ───────────────────────────────────────────────
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    // SECURITY: Same error for wrong email OR wrong password.
    // Never reveal which field failed — that helps attackers.
    if (!user) {
      return res.render('login', {
        error: 'Invalid email or password.'
      });
    }

    // bcrypt.compare() hashes the submitted password and checks
    // it against the stored hash. Returns true or false.
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.render('login', {
        error: 'Invalid email or password.'
      });
    }

    // Valid — create the session.
    req.session.userId   = user._id;
    req.session.username = user.username;

    res.redirect('/dashboard');

  } catch (err) {
    console.error('Login error:', err);
    res.render('login', {
      error: 'Something went wrong. Please try again.'
    });
  }
});


// ── POST /logout ──────────────────────────────────────────────
// Must be POST, not GET. A GET logout can be triggered by
// browser link prefetching — accidentally logging users out.
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});


// ── GET /dashboard ────────────────────────────────────────────
// requireAuth is the second argument — runs before the handler.
// No session → redirect to /login. Session → handler runs.
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


// ── POST /ask ─────────────────────────────────────────────────
// Called when the user submits a question on the dashboard.
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
    // Call Gemini from the server — API key never reaches the browser.
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: 'gemini-3.5-flash',
  contents: `You are a computer science tutor helping a university student.
Give a clear, educational answer with examples where helpful.
Keep your response concise but complete.

Student question: ${question.trim()}`
});
const answer = response.text;

    // Save the Q&A — this is the CREATE operation in CRUD.
    const chat = new ChatDoc({
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


// ── POST /chat/:id/delete ─────────────────────────────────────
// :id is a URL parameter. Example: POST /chat/3/delete
app.post('/chat/:id/delete', requireAuth, async (req, res) => {
  try {
    // Filter by BOTH _id AND userId — critical security check.
    // Without userId, anyone could delete anyone else's chat
    // by guessing a different ID in the URL.
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

app.get('/test-gemini', async (req, res) => {
  try {
    // Initialize the Gemini client with your API key
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: 'gemini-3.5-flash',
  contents: 'Explain what a linked list is in simple terms. Use an analogy.'
});
const answer = response.text;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gemini Test</title>
        <style>
          body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
          h2 { color: #2563eb; }
          .answer { background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; line-height: 1.7; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h2>✅ Gemini is working</h2>
        <div class="answer">${answer}</div>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('Gemini error:', err);
    res.send('<h2 style="color:red;">Error: ' + err.message + '</h2>');
  }
});


// ── STEP 11: START THE SERVER ─────────────────────────────────
// process.env.PORT lets Render inject its own port on deployment.
// || 3000 is the fallback for local development.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});