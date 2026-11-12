const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('./async');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error to console
  console.error('Error:', err.message);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue ? err.keyValue[field] : '';
    let message = 'Duplicate field value entered';
    if (field === 'email') {
      message = `Login ID '${value}' already exists. Please use a different Login ID.`;
    } else if (field) {
      message = `${field} '${value}' already exists`;
    }
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    message: error.message || 'Server Error'
  });
};

module.exports = errorHandler;
