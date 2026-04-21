import request from 'supertest';
import { createComposedApp } from '../../src/composition';

describe('Event Search Routes', () => {
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

  describe('Authentication', () => {
    it('should require auth for GET /events/search', async () => {
      const response = await agent.get('/events/search').query({ q: 'music' });
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should require auth for GET /events/search/results', async () => {
      const response = await agent.get('/events/search/results').query({ q: 'music' });
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });
  });

  describe('GET /events/search', () => {
    beforeEach(async () => {
      await loginAsAdmin();
    });

    it('returns matching events when the query hits', async () => {
      const uniqueTitle = `Searchable Event ${Date.now()}`;

      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: uniqueTitle,
          description: 'Searchable description for automated testing.',
          location: 'Test Location',
          category: 'Test Category',
          status: 'published',
          capacity: '50',
          startDatetime: '2026-06-01T10:00',
          endDatetime: '2026-06-01T12:00'
        })
        .expect(302);

      const response = await agent.get('/events/search').query({ q: 'Searchable' });

      expect(response.status).toBe(200);
      expect(response.text).toContain(uniqueTitle);
    });

    it('shows a “no results” message when nothing matches', async () => {
      const response = await agent.get('/events/search').query({ q: `NoMatches-${Date.now()}` });

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/no results found/i);
    });

    it('returns validation feedback for invalid queries', async () => {
      const cases = [
        { query: ' ', message: 'Search query cannot be empty.' },
        { query: 'a', message: 'Search query must be at least 2 characters long.' },
        { query: 'x'.repeat(101), message: 'Search query must not exceed 100 characters.' }
      ];

      for (const { query, message } of cases) {
        const response = await agent.get('/events/search').query({ q: query });

        expect(response.status).toBe(400);
        expect(response.text).toMatch(/no results found/i);
        expect(response.text).toContain(message);
      }
    });
  });

  describe('GET /events/search/results (partial)', () => {
    beforeEach(async () => {
      await loginAsAdmin();
    });

    it('returns a partial with matching events', async () => {
      const uniqueTitle = `Partial Search Event ${Date.now()}`;

      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: uniqueTitle,
          description: 'Partial search description for automated testing.',
          location: 'Partial Test Location',
          category: 'Partial Category',
          status: 'published',
          capacity: '25',
          startDatetime: '2026-07-01T10:00',
          endDatetime: '2026-07-01T11:00'
        })
        .expect(302);

      const response = await agent.get('/events/search/results').query({ q: 'Partial Search' });

      expect(response.status).toBe(200);
      expect(response.text).toContain(uniqueTitle);
      // The partial renders without the main layout; ensure we still get content.
      expect(response.text).not.toMatch(/<!DOCTYPE html>/i);
    });

    it('shows a “no results” message when the partial query has no matches', async () => {
      const response = await agent
        .get('/events/search/results')
        .query({ q: `PartialNoMatch-${Date.now()}` });

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/no results found/i);
    });

    it('returns validation feedback for invalid partial queries', async () => {
      const cases = [
        { query: ' ', message: 'Search query cannot be empty.' },
        { query: 'a', message: 'Search query must be at least 2 characters long.' },
        { query: 'x'.repeat(101), message: 'Search query must not exceed 100 characters.' }
      ];

      for (const { query, message } of cases) {
        const response = await agent.get('/events/search/results').query({ q: query });

        expect(response.status).toBe(400);
        expect(response.text).toMatch(/no results found/i);
        expect(response.text).toContain(message);
      }
    });
  });
});