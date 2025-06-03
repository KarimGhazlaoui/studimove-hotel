const request = require('supertest');
const app = require('../server');

describe('Hotel API', () => {
  it('should get all hotels', async () => {
    const res = await request(app).get('/api/hotels');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success', true);
  });
});