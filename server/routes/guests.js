const express = require('express');
const {
  getGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest
} = require('../controllers/guestController');

const bookingRouter = require('./bookings');

const router = express.Router();

// Re-router vers les réservations
router.use('/:guestId/bookings', bookingRouter);

router
  .route('/')
  .get(getGuests)
  .post(createGuest);

router
  .route('/:id')
  .get(getGuest)
  .put(updateGuest)
  .delete(deleteGuest);

module.exports = router;