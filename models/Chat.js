const mongoose = require('mongoose');

// Each Chat document represents one question-and-answer exchange.
// We keep it simple: one document per Q&A pair.
const chatSchema = new mongoose.Schema({

  // userId links this chat to the user who asked it.
  // ObjectId is MongoDB's special unique ID type.
  // ref: 'User' tells Mongoose this refers to the User model —
  // useful later if you ever want to "populate" (join) user data.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },

  question: {
    type: String,
    required: true
  },

  answer: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;