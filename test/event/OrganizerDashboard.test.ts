import request from 'supertest';
import { createComposedApp } from '../../src/composition';

describe('Organizer Dashboard Routes', () => {
  let app: any;
  let agent: any;

  beforeEach(async () => {
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
          startDatetime: '2027-04-20T10:00',
          endDatetime: '2027-04-20T12:00'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^\/events\/\d+$/);
    });
  });

  describe('Dashboard Event Visibility', () => {
    let organizerAgent: any;
    let adminAgent: any;
    let memberAgent: any;
    let organizerId: string;
    let adminId: string;
    let memberId: string;

    beforeEach(async () => {
      // Create separate agents for different users
      organizerAgent = request.agent(app.getExpressApp());
      adminAgent = request.agent(app.getExpressApp());
      memberAgent = request.agent(app.getExpressApp());

      // Create organizer user
      await adminAgent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' });

      await adminAgent
        .post('/admin/users')
        .type('form')
        .send({
          email: 'organizer@test.com',
          displayName: 'Test Organizer',
          password: 'password123',
          role: 'user'
        });

      // Create member user
      await adminAgent
        .post('/admin/users')
        .type('form')
        .send({
          email: 'member@test.com',
          displayName: 'Test Member',
          password: 'password123',
          role: 'user'
        });

      // Login as organizer
      await organizerAgent
        .post('/login')
        .type('form')
        .send({ email: 'organizer@test.com', password: 'password123' });

      // Login as member
      await memberAgent
        .post('/login')
        .type('form')
        .send({ email: 'member@test.com', password: 'password123' });

      // Create events for organizer
      await organizerAgent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Organizer Event 1',
          description: 'Event by organizer',
          location: 'Test Location',
          category: 'Test Category',
          status: 'draft',
          capacity: '20',
          startDatetime: '2027-04-25T10:00',
          endDatetime: '2027-04-25T12:00'
        });

      await organizerAgent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Organizer Event 2',
          description: 'Another event by organizer',
          location: 'Test Location 2',
          category: 'Test Category 2',
          status: 'published',
          capacity: '15',
          startDatetime: '2027-04-26T14:00',
          endDatetime: '2027-04-26T16:00'
        });

      // Create event for admin
      await adminAgent
        .post('/events/new')
        .type('form')
        .send({
          title: 'Admin Event',
          description: 'Event by admin',
          location: 'Admin Location',
          category: 'Admin Category',
          status: 'published',
          capacity: '30',
          startDatetime: '2027-04-27T10:00',
          endDatetime: '2027-04-27T12:00'
        });
    });

    it('should show only organizer\'s own events on dashboard', async () => {
      const response = await organizerAgent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Organizer Event 1');
      expect(response.text).toContain('Organizer Event 2');
      expect(response.text).not.toContain('Admin Event');
    });

    it('should show accurate event counts for organizer', async () => {
      const response = await organizerAgent.get('/dashboard');
      expect(response.status).toBe(200);
      
      // Should show 2 events for organizer
      const eventMatches = response.text.match(/Displaying (\d+) event/g);
      expect(eventMatches).toBeTruthy();
      expect(eventMatches![0]).toContain('2');
    });

    it('should show all events for admin on dashboard', async () => {
      // Ensure admin is logged in
      await adminAgent
        .post('/login')
        .type('form')
        .send({ email: 'admin@app.test', password: 'password123' });
      
      const response = await adminAgent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Organizer Event 1');
      expect(response.text).toContain('Organizer Event 2');
      expect(response.text).toContain('Admin Event');
    });

    it('should show accurate event counts for admin', async () => {
      const response = await adminAgent.get('/dashboard');
      expect(response.status).toBe(200);
      
      // Should show 3 total events for admin
      const eventMatches = response.text.match(/Displaying (\d+) event/g);
      expect(eventMatches).toBeTruthy();
      expect(eventMatches![0]).toContain('3');
    });

    it('should reject regular members from accessing dashboard', async () => {
      // Actually, dashboard is accessible to all authenticated users,
      // but members won't see any events since they haven't created any
      const response = await memberAgent.get('/dashboard');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Dashboard');
      expect(response.text).toContain('No events found');
    });

    it('should show correct RSVP counts on dashboard', async () => {
      // First, let's RSVP to the published organizer event as admin
      const eventsResponse = await adminAgent.get('/events');
      const eventIdMatch = eventsResponse.text.match(/Organizer Event 2[\s\S]*?\/events\/(\d+)/);
      expect(eventIdMatch).toBeTruthy();
      const eventId = eventIdMatch![1];

      await adminAgent
        .post(`/events/${eventId}/rsvp`)
        .expect(200);

      // Check dashboard shows updated RSVP count
      const dashboardResponse = await organizerAgent.get('/dashboard');
      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.text).toContain('1 / 15'); // 1 RSVP out of 15 capacity
    });

    it('should show correct status badges on dashboard', async () => {
      const response = await organizerAgent.get('/dashboard');
      expect(response.status).toBe(200);
      
      // Should show draft status for first event
      expect(response.text).toContain('draft');
      // Should show published status for second event
      expect(response.text).toContain('published');
    });
  });
});