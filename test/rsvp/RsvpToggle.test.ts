import request from "supertest";
import { createComposedApp } from "../../src/composition";

describe("RSVP Toggle", () => {
  let app: any;
  let agent: any;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret";
    app = createComposedApp();
    agent = request.agent(app.getExpressApp());
  });

  const login = async () => {
    return agent
      .post("/login")
      .type("form")
      .send({ email: "admin@app.test", password: "password123" })
      .expect(302);
  };

  const createEvent = async () => {
    return agent
      .post("/events/new")
      .type("form")
      .send({
        title: "RSVP Event",
        description: "test",
        location: "Room A",
        category: "Test",
        status: "published",
        capacity: "1",
        startDatetime: "2026-05-01T10:00",
        endDatetime: "2026-05-01T12:00",
      })
      .expect(302);
  };

  it("rejects unauthenticated RSVP", async () => {
    const res = await agent.post("/events/1/rsvp");
    expect(res.status).toBe(401);
  });

  it("rejects invalid event id", async () => {
    await login();
    const res = await agent.post("/events/abc/rsvp");
    expect(res.status).toBe(400);
  });

  it("creates RSVP and returns UI button (going state)", async () => {
    await login();
    await createEvent();

    const res = await agent.post("/events/1/rsvp");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Cancel RSVP");
    expect(res.text).toContain("hx-post");
  });

  it("cancels RSVP and returns RSVP button again", async () => {
    await login();
    await createEvent();

    await agent.post("/events/1/rsvp");

    const res = await agent.post("/events/1/rsvp");

    expect(res.status).toBe(200);
    expect(res.text).toContain("RSVP");
    expect(res.text).not.toContain("Cancel RSVP");
  });

  it("waitlists user when capacity is full", async () => {
    await login();
    await createEvent();

    await agent.post("/events/1/rsvp");

    const agent2 = request.agent(app.getExpressApp());

    await agent2
      .post("/login")
      .type("form")
      .send({ email: "user2@app.test", password: "password123" })
      .expect(302);

    const res = await agent2.post("/events/1/rsvp");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Waitlisted");
  });
});