import request from "supertest";
import { createComposedApp } from "../../src/composition";

describe("My RSVPs Dashboard", () => {
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

  it("redirects unauthenticated users", async () => {
    const res = await agent.get("/my-rsvps");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("loads dashboard for logged-in user", async () => {
    await login();

    const res = await agent.get("/my-rsvps");

    expect(res.status).toBe(200);
    expect(res.text).toContain("My RSVPs");
    expect(res.text).toContain("Upcoming Events");
    expect(res.text).toContain("Past / Cancelled");
  });

  it("blocks organizer access", async () => {
    await agent
      .post("/login")
      .type("form")
      .send({ email: "organizer@app.test", password: "password123" });

    const res = await agent.get("/my-rsvps");

    expect(res.status).toBe(403);
  });

  it("renders empty dashboard correctly", async () => {
    await login();

    const res = await agent.get("/my-rsvps");

    expect(res.status).toBe(200);
  });

  it("allows cancel RSVP via dashboard toggle", async () => {
    await login();

    await agent.post("/events/1/rsvp");

    const res = await agent.post("/events/1/rsvp");

    expect(res.status).toBe(200);
  });
});