// Load mongoose — the library that connects our JavaScript code to MongoDB
const mongoose = require('mongoose');

// A Schema is a blueprint that defines the shape of documents
// in a MongoDB collection. Think of it like defining columns in a SQL table.
const userSchema = new mongoose.Schema({

  username: {
    type: String,       // this field must be a string
    required: true,     // mongoose will refuse to save a document without this
    trim: true          // automatically strips leading/trailing whitespace
  },

  email: {
    type: String,
    required: true,
    unique: true,       // MongoDB creates an index to enforce no duplicate emails
    lowercase: true     // automatically converts to lowercase before saving
  },

  // IMPORTANT: we store passwordHash, NEVER the plain text password.
  // bcrypt will create this hash when the user signs up.
  passwordHash: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now   // automatically set to current time when document is created
  }

});

// mongoose.model() compiles our schema into a Model.
// A Model is a class we use to create and query documents.
// 'User' (capital U) is the model name.
// Mongoose automatically uses the collection named 'users' (lowercase + plural).
const User = mongoose.model('User', userSchema);

// Export the model so app.js can require it
module.exports = User;