import request from 'supertest';
import { createComposedApp } from '../../src/composition';

describe('Event Creation', () => {
  let app: any;
  let agent: any;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  const loginAsAdmin = async () => {
    await agent
      .post('/login')
      .type('form')
      .send({ email: 'admin@app.test', password: 'password123' })
      .expect(302);
  };

  const validEventData = {
    title: 'Spring Workshop',
    description: 'A hands-on workshop about web development',
    location: 'Room 101',
    category: 'Workshop',
    status: 'draft',
    capacity: '50',
    startDatetime: '2026-06-01T10:00',
    endDatetime: '2026-06-01T12:00',
  };

  // ── Authentication ─────────────────────────────────────────────

  describe('Authentication', () => {
    it('should redirect to login when accessing GET /events/new without auth', async () => {
      const response = await agent.get('/events/new');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should redirect to login when POSTing to /events/new without auth', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send(validEventData);
      expect(response.status).toBe(401);
    });
  });

  // ── Happy Path ─────────────────────────────────────────────────

  describe('Happy Path', () => {
    beforeEach(loginAsAdmin);

    it('should show the create event form for an authenticated user', async () => {
      const response = await agent.get('/events/new');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Create New Event');
      expect(response.text).toContain('Event Emoji');
      expect(response.text).toContain('🎉');
      expect(response.text).toContain("'🎉': 'Party'");
      expect(response.text).toContain("'🏆': 'Competition'");
      expect(response.text).toContain("fillCategory");
    });

    it('should create an event with valid data and redirect to the detail page', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send(validEventData);

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^\/events\/\d+$/);
    });

    it('should persist the created event with correct data on the detail page', async () => {
      const createResponse = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, emoji: '🎸' });

      const detailResponse = await agent.get(createResponse.headers.location);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.text).toContain('Spring Workshop');
      expect(detailResponse.text).toContain('A hands-on workshop about web development');
      expect(detailResponse.text).toContain('Room 101');
      expect(detailResponse.text).toContain('Workshop');
      expect(detailResponse.text).toContain('🎸');
    });

    it('should create an event with unlimited capacity when capacity is left empty', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, capacity: '' });

      expect(response.status).toBe(302);

      const detailResponse = await agent.get(response.headers.location);
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.text).toContain('Unlimited');
    });

    it('should allow creating an event without an emoji', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, emoji: '' });

      expect(response.status).toBe(302);
    });

    it('should return an HX-Redirect header when submitted via HTMX', async () => {
      const response = await agent
        .post('/events/new')
        .set('HX-Request', 'true')
        .type('form')
        .send(validEventData);

      expect(response.status).toBe(200);
      expect(response.headers['hx-redirect']).toMatch(/^\/events\/\d+$/);
    });

    it('should assign unique IDs to separately created events', async () => {
      const res1 = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, title: 'Event A' });

      const res2 = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, title: 'Event B' });

      expect(res1.headers.location).not.toBe(res2.headers.location);
    });
  });

  // ── Validation Errors (Domain Errors) ──────────────────────────

  describe('Validation Errors', () => {
    beforeEach(loginAsAdmin);

    it('should return 400 when title is missing', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, title: '' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Title is required');
    });

    it('should return 400 when description is missing', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, description: '' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Description is required');
    });

    it('should return 400 when location is missing', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, location: '' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Location is required');
    });

    it('should return 400 when category is missing', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, category: '' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Category is required');
    });

    it('should return 400 when start datetime is invalid', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, startDatetime: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Start date/time is invalid');
    });

    it('should return 400 when end datetime is invalid', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, endDatetime: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('End date/time is invalid');
    });

    it('should return 400 when end datetime is before start datetime', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({
          ...validEventData,
          startDatetime: '2026-06-01T14:00',
          endDatetime: '2026-06-01T10:00',
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('End date/time must be after start date/time');
    });

    it('should return 400 when capacity is zero', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, capacity: '0' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Capacity must be a positive integer');
    });

    it('should return 400 when capacity is negative', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, capacity: '-5' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Capacity must be a positive integer');
    });

    it('should return 400 when emoji is not one of the provided options', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, emoji: '🔥' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Emoji must be selected from the provided options');
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────

  describe('Edge Cases', () => {
    beforeEach(loginAsAdmin);

    it('should reject a whitespace-only title', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({ ...validEventData, title: '   ' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Title is required');
    });

    it('should reject when end datetime equals start datetime', async () => {
      const response = await agent
        .post('/events/new')
        .type('form')
        .send({
          ...validEventData,
          startDatetime: '2026-06-01T10:00',
          endDatetime: '2026-06-01T10:00',
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('End date/time must be after start date/time');
    });

    it('should display error in HTMX partial without the full page layout', async () => {
      const response = await agent
        .post('/events/new')
        .set('HX-Request', 'true')
        .type('form')
        .send({ ...validEventData, title: '' });

      // HTMX error responses render a partial (no layout wrapper)
      expect(response.text).toContain('Title is required');
      expect(response.text).not.toContain('<!doctype html>');
    });
  });
});
