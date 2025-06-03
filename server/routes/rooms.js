const express = require('express');
const {
  getRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom
} = require('../controllers/roomController');

const bookingRouter = require('./bookings');

const router = express.Router({ mergeParams: true });

// Re-router vers les réservations
router.use('/:roomId/bookings', bookingRouter);

router
  .route('/')
  .get(getRooms)
  .post(createRoom);

router
  .route('/:id')
  .get(getRoom)
  .put(updateRoom)
  .delete(deleteRoom);

module.exports = router;
