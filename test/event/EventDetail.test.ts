import request from 'supertest';
import { createComposedApp } from '../../src/composition';

describe('Event Detail Page', () => {
  let app: any;
  let agent: any;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  /** Login helper – works with any agent instance. */
  const loginAs = async (
    agentInstance: any,
    email: string,
    password = 'password123',
  ) => {
    await agentInstance
      .post('/login')
      .type('form')
      .send({ email, password })
      .expect(302);
  };

  /** Create an event through the HTTP layer and return its numeric ID. */
  const createEventAs = async (
    agentInstance: request.SuperAgentTest,
    overrides: Record<string, string> = {},
  ): Promise<number> => {
    const data = {
      title: 'Test Event',
      description: 'A test event description',
      location: 'Test Hall',
      category: 'Testing',
      status: 'published',
      capacity: '100',
      startDatetime: '2026-07-01T09:00',
      endDatetime: '2026-07-01T17:00',
      ...overrides,
    };

    const res = await agentInstance.post('/events/new').type('form').send(data);
    const match = res.headers.location?.match(/\/events\/(\d+)/);
    return match ? Number(match[1]) : 0;
  };

  // ── Authentication ─────────────────────────────────────────────

  describe('Authentication', () => {
    it('should redirect to login when accessing event detail without auth', async () => {
      const response = await agent.get('/events/1');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/login');
    });
  });

  // ── Published Event — Happy Path ───────────────────────────────

  describe('Published Event — Happy Path', () => {
    let eventId: number;

    beforeEach(async () => {
      await loginAs(agent, 'admin@app.test');
      eventId = await createEventAs(agent, {
        title: 'Annual Conference',
        description: 'A large conference about technology trends',
        location: 'Convention Center',
        category: 'Conference',
        status: 'published',
        capacity: '200',
        startDatetime: '2026-08-10T09:00',
        endDatetime: '2026-08-10T18:00',
      });
    });

    it('should return 200 for an existing published event', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
    });

    it('should display the event title', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.text).toContain('Annual Conference');
    });

    it('should display the event description', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.text).toContain('A large conference about technology trends');
    });

    it('should display the event location and category', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.text).toContain('Convention Center');
      expect(response.text).toContain('Conference');
    });

    it('should display the organizer name', async () => {
      const response = await agent.get(`/events/${eventId}`);
      // Admin (Avery Admin) created the event
      expect(response.text).toContain('Avery Admin');
    });

    it('should display the event status', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.text).toContain('published');
    });

    it('should display capacity information', async () => {
      const response = await agent.get(`/events/${eventId}`);
      expect(response.text).toContain('200');
    });
  });

  // ── Event Not Found (Domain Error) ─────────────────────────────

  describe('Event Not Found', () => {
    beforeEach(async () => {
      await loginAs(agent, 'admin@app.test');
    });

    it('should return 404 for a non-existent event ID', async () => {
      const response = await agent.get('/events/9999');
      expect(response.status).toBe(404);
      expect(response.text).toContain('not found');
    });

    it('should return 400 for a non-numeric event ID', async () => {
      const response = await agent.get('/events/abc');
      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid event ID');
    });

    it('should return 400 for event ID zero', async () => {
      const response = await agent.get('/events/0');
      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid event ID');
    });
  });

  // ── Draft Event Visibility ─────────────────────────────────────

  describe('Draft Event Visibility', () => {
    let draftEventId: number;
    let staffAgent: any;
    let adminAgent: any;
    let userAgent: any;

    beforeEach(async () => {
      staffAgent = request.agent(app.getExpressApp());
      adminAgent = request.agent(app.getExpressApp());
      userAgent = request.agent(app.getExpressApp());

      await loginAs(staffAgent, 'staff@app.test');
      await loginAs(adminAgent, 'admin@app.test');
      await loginAs(userAgent, 'user@app.test');

      // Staff creates a draft event
      draftEventId = await createEventAs(staffAgent, {
        title: 'Secret Planning Session',
        description: 'Internal team planning',
        location: 'Meeting Room B',
        category: 'Internal',
        status: 'draft',
      });
    });

    it('should be visible to the organizer who created it', async () => {
      const response = await staffAgent.get(`/events/${draftEventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Secret Planning Session');
    });

    it('should be visible to admin users', async () => {
      const response = await adminAgent.get(`/events/${draftEventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Secret Planning Session');
    });

    it('should return 404 for regular users who are not the organizer', async () => {
      const response = await userAgent.get(`/events/${draftEventId}`);
      expect(response.status).toBe(404);
      expect(response.text).toContain('Event not found');
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should show cancelled events to all authenticated users', async () => {
      // Admin creates a published event, then cancels it
      const adminAgent: any = request.agent(app.getExpressApp());
      await loginAs(adminAgent, 'admin@app.test');

      const eventId = await createEventAs(adminAgent, { status: 'published' });
      await adminAgent.post(`/events/${eventId}/cancel`).expect(302);

      // Regular user views the cancelled event
      const userAgent: any = request.agent(app.getExpressApp());
      await loginAs(userAgent, 'user@app.test');

      const response = await userAgent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('cancelled');
    });

    it('should display "Unlimited" when the event has no capacity limit', async () => {
      await loginAs(agent, 'admin@app.test');
      const eventId = await createEventAs(agent, { capacity: '' });

      const response = await agent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Unlimited');
    });

    it('should show Edit and Cancel controls for the organizer of a published event', async () => {
      const staffAgent: any = request.agent(app.getExpressApp());
      await loginAs(staffAgent, 'staff@app.test');
      const eventId = await createEventAs(staffAgent, { status: 'published' });

      const response = await staffAgent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Edit Event');
      expect(response.text).toContain('Cancel Event');
    });

    it('should not show Edit or Cancel controls for regular users', async () => {
      // Staff creates the event
      const staffAgent: any = request.agent(app.getExpressApp());
      await loginAs(staffAgent, 'staff@app.test');
      const eventId = await createEventAs(staffAgent, { status: 'published' });

      // Regular user views it
      const userAgent = request.agent(app.getExpressApp());
      await loginAs(userAgent, 'user@app.test');

      const response = await userAgent.get(`/events/${eventId}`);
      expect(response.status).toBe(200);
      expect(response.text).not.toContain('Edit Event');
      expect(response.text).not.toContain('Cancel Event');
    });
  });
});