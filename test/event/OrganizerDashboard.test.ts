import request from 'supertest';
import { createComposedApp } from '../../src/composition';
import { CreateInMemoryUserRepository } from '../../src/auth/InMemoryUserRepository';
import { CreatePasswordHasher } from '../../src/auth/PasswordHasher';
import { CreateAuthService } from '../../src/auth/AuthService';

describe('Organizer Dashboard Routes', () => {
  let app: any;
  let agent: request.SuperAgentTest;

  beforeEach(() => {
    // Create a fresh app for each test
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  describe('GET /dashboard', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/dashboard');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show dashboard for authenticated user', async () => {
      // First, login
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Dashboard');
      expect(response.text).toContain('Your Events');
    });

    it('should display user events on dashboard', async () => {
      // Login
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create an event first
      await agent
        .post('/events/new')
        .send({
          title: 'Test Event',
          description: 'Test Description',
          location: 'Test Location',
          category: 'Test Category',
          status: 'draft',
          capacity: '10',
          startDatetime: '2026-04-20T10:00',
          endDatetime: '2026-04-20T12:00'
        })
        .expect(302);

      const response = await agent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Test Event');
      expect(response.text).toContain('Test Category');
    });
  });

  describe('GET /events', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/events');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show all events page for authenticated user', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('All Events');
      expect(response.text).toContain('Available Events');
    });
  });

  describe('GET /events/new', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/events/new');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show create event form for authenticated user', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events/new');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Create New Event');
      expect(response.text).toContain('Event Title');
    });
  });

  describe('POST /events/new', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent
        .post('/events/new')
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
      expect(response.headers.location).toBe('/login');
    });

    it('should create event and redirect for authenticated user', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent
        .post('/events/new')
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

    it('should handle validation errors', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent
        .post('/events/new')
        .send({
          title: '', // Invalid: empty title
          description: 'Test Description',
          location: 'Test Location',
          category: 'Test Category',
          status: 'draft',
          capacity: '10',
          startDatetime: '2026-04-20T10:00',
          endDatetime: '2026-04-20T12:00'
        });

      expect(response.status).toBe(200); // Renders form with error
      expect(response.text).toContain('Error');
      expect(response.text).toContain('Create New Event'); // Still on form
    });
  });

  describe('GET /events/:id', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/events/1');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show event detail for authenticated user', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create event first
      const createResponse = await agent
        .post('/events/new')
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

      const eventId = createResponse.headers.location.match(/\/events\/(\d+)/)?.[1];

      const response = await agent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Test Event');
      expect(response.text).toContain('Test Description');
    });

    it('should return 404 for non-existent event', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events/99999');
      expect(response.status).toBe(404);
      expect(response.text).toContain('Error');
    });
  });

  describe('GET /Event/:id/Edit', () => {
    it('should redirect to login when not authenticated', async () => {
      const response = await agent.get('/Event/1/Edit');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });

    it('should show edit form for authenticated user', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create event first
      const createResponse = await agent
        .post('/events/new')
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

      const eventId = createResponse.headers.location.match(/\/events\/(\d+)/)?.[1];

      const response = await agent.get(`/Event/${eventId}/Edit`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Edit Event');
      expect(response.text).toContain('Test Event');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid event ID gracefully', async () => {
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events/invalid');
      expect(response.status).toBe(500); // Or appropriate error status
    });

    it('should handle server errors in dashboard', async () => {
      // This would require mocking the service to throw an error
      // For now, test that the route exists and handles auth
      await agent
        .post('/login')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/dashboard');
      expect(response.status).toBe(200);
    });
  });
});