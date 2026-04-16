import request from 'supertest';
import { createComposedApp } from '../../src/composition';

describe('Organizer Dashboard Routes', () => {
  let app: any;
  let agent: request.SuperAgentTest;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  describe('Authentication', () => {
    it('should redirect to login when accessing dashboard without auth', async () => {
      const response = await agent.get('/dashboard');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should allow login with valid credentials', async () => {
      const response = await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' });
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/home');
    });

    it('should show dashboard for authenticated user', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Dashboard');
    });
  });

  describe('GET /events (All Events)', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/events');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show all events page for authenticated user', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('All Events');
    });
  });

  describe('Event Creation', () => {
    it('should show create form for authenticated user', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events/new');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Create New Event');
    });

    it('should create event successfully', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Test Event',
          description: 'Test Description',
          location: 'Test Location',
          category: 'Test Category',
          status: 'draft',
          capacity: '10',
          startDatetime: '2026-04-20T10:00',
          endDatetime: '2026-04-20T12:00'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^\/events\/\d+$/);
    });
  });
});