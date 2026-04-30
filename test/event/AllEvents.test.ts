import request from 'supertest';
import { createComposedApp } from '../../src/composition';
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "file:./prisma/test.db";

describe('All Events Routes', () => {
  let app: any;
  let agent: request.SuperAgentTest;
  
  const databaseUrl = process.env.DATABASE_URL;
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  beforeEach(async()  => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
    await prisma.comment.deleteMany();
    await prisma.eventRsvp.deleteMany();
    await prisma.event.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Authentication', () => {
    it('should redirect to login when accessing /events without auth', async () => {
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

    it('should display authenticated user info on all events page', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Signed in as');
      expect(response.text).toContain('admin');
    });
  });

  describe('Event Display', () => {
    it('should show empty state when no events exist', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('No events available at this time');
    });

    it('should display created event in all events list', async () => {
      // Login
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create an event
      const createResponse = await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Test Conference',
          description: 'A test conference event',
          location: 'Conference Hall',
          category: 'Conference',
          status: 'published',
          capacity: '100',
          startDatetime: '2026-05-15T09:00',
          endDatetime: '2026-05-15T17:00'
        });

      expect(createResponse.status).toBe(302);

      // View all events
      const allEventsResponse = await agent.get('/events');
      expect(allEventsResponse.status).toBe(200);
      expect(allEventsResponse.text).toContain('Test Conference');
      expect(allEventsResponse.text).toContain('Conference');
      expect(allEventsResponse.text).toContain('Available Events');
    });

    it('should show event count correctly', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create two events
      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Event 1',
          description: 'First test event',
          location: 'Location 1',
          category: 'Category 1',
          status: 'published',
          capacity: '50',
          startDatetime: '2026-05-15T10:00',
          endDatetime: '2026-05-15T12:00'
        });

      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Event 2',
          description: 'Second test event',
          location: 'Location 2',
          category: 'Category 2',
          status: 'published',
          capacity: '75',
          startDatetime: '2026-05-16T14:00',
          endDatetime: '2026-05-16T16:00'
        });

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Displaying 2 events');
      expect(response.text).toContain('Event 1');
      expect(response.text).toContain('Event 2');
    });

    it('should display event details correctly', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Music Festival',
          description: 'Annual music festival',
          location: 'Central Park',
          category: 'Music',
          status: 'published',
          capacity: '500',
          startDatetime: '2026-06-01T18:00',
          endDatetime: '2026-06-01T23:00'
        });

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Music Festival');
      expect(response.text).toContain('Music');
      expect(response.text).toContain('published');
    });

    it('should display draft events alongside published events', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Create a draft event
      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Draft Event',
          description: 'Not yet published',
          location: 'Location',
          category: 'Category',
          status: 'draft',
          capacity: '20',
          startDatetime: '2026-05-20T10:00',
          endDatetime: '2026-05-20T12:00'
        });

      // Create a published event
      await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Published Event',
          description: 'Already published',
          location: 'Location',
          category: 'Category',
          status: 'published',
          capacity: '30',
          startDatetime: '2026-05-21T10:00',
          endDatetime: '2026-05-21T12:00'
        });

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Draft Event');
      expect(response.text).toContain('Published Event');
      expect(response.text).toContain('Displaying 2 events');
    });
  });

  describe('Event Details Link', () => {
    it('should have clickable View Details links for each event', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      const createResponse = await agent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Linked Event',
          description: 'Test linking functionality',
          location: 'Test Location',
          category: 'Test',
          status: 'published',
          capacity: '40',
          startDatetime: '2026-05-25T15:00',
          endDatetime: '2026-05-25T17:00'
        });

      expect(createResponse.status).toBe(302);
      const eventIdMatch = createResponse.headers.location.match(/\/events\/(\d+)/);
      expect(eventIdMatch).not.toBeNull();

      const response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toMatch(/href="\/events\/\d+"/);
      expect(response.text).toContain('View Details');
    });
  });

  describe('Navigation', () => {
    it('should allow navigation between authenticated pages', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Access all events
      let response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('All Events');

      // Navigate to dashboard
      response = await agent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Dashboard');

      // Navigate back to all events
      response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('All Events');
    });

    it('should allow logout from all events page', async () => {
      await agent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' })
        .expect(302);

      // Verify logged in
      let response = await agent.get('/events');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Signed in as');

      // Logout
      response = await agent.post('/logout');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');

      // Verify logged out
      response = await agent.get('/events');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });
  });
});
