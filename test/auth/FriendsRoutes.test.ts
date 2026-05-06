import request from "supertest";
import { createComposedApp } from "../../src/composition";

const uniqueEmail = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@app.test`;

async function login(agent: request.SuperAgentTest, email: string): Promise<void> {
  await agent
    .post("/login")
    .type("form")
    .send({ email, password: "password123" })
    .expect(302);
}

async function createUser(
  adminAgent: request.SuperAgentTest,
  email: string,
  displayName: string,
): Promise<void> {
  await adminAgent
    .post("/admin/users")
    .type("form")
    .send({
      email,
      displayName,
      password: "password123",
      role: "user",
    })
    .expect(302);
}

describe("Friends routes", () => {
  it("lets users search, send, accept, and view friends", async () => {
    process.env.SESSION_SECRET = "test-secret";
    const app = createComposedApp();
    const adminAgent = request.agent(app.getExpressApp());
    const senderAgent = request.agent(app.getExpressApp());
    const recipientAgent = request.agent(app.getExpressApp());

    const senderEmail = uniqueEmail("friend-sender");
    const recipientEmail = uniqueEmail("friend-recipient");

    await login(adminAgent, "admin@app.test");
    await createUser(adminAgent, senderEmail, "Friend Sender");
    await createUser(adminAgent, recipientEmail, "Friend Recipient");

    await login(senderAgent, senderEmail);
    await login(recipientAgent, recipientEmail);

    const searchResponse = await senderAgent
      .get("/friends/search")
      .query({ q: recipientEmail })
      .set("HX-Request", "true")
      .expect(200);

    expect(searchResponse.text).toContain("Friend Recipient");
    const targetId = searchResponse.text.match(/name="userId" value="([^"]+)"/)?.[1];
    expect(targetId).toBeTruthy();

    await senderAgent
      .post("/friends/requests")
      .set("HX-Request", "true")
      .type("form")
      .send({ userId: targetId })
      .expect(200);

    const recipientFriendsPage = await recipientAgent.get("/friends").expect(200);
    expect(recipientFriendsPage.text).toContain("Incoming Requests");
    expect(recipientFriendsPage.text).toContain("Friend Sender");

    const requesterId = recipientFriendsPage.text.match(/\/friends\/requests\/([^/]+)\/accept/)?.[1];
    expect(requesterId).toBeTruthy();

    await recipientAgent
      .post(`/friends/requests/${requesterId}/accept`)
      .set("HX-Request", "true")
      .expect(200);

    const senderFriendsPage = await senderAgent.get("/friends").expect(200);
    expect(senderFriendsPage.text).toContain("Friends List");
    expect(senderFriendsPage.text).toContain("Friend Recipient");
  });

  it("lets users accept and decline friend requests from the inbox", async () => {
    process.env.SESSION_SECRET = "test-secret";
    const app = createComposedApp();
    const adminAgent = request.agent(app.getExpressApp());
    const acceptSenderAgent = request.agent(app.getExpressApp());
    const declineSenderAgent = request.agent(app.getExpressApp());
    const recipientAgent = request.agent(app.getExpressApp());

    const acceptSenderEmail = uniqueEmail("inbox-accept-sender");
    const declineSenderEmail = uniqueEmail("inbox-decline-sender");
    const recipientEmail = uniqueEmail("inbox-recipient");

    await login(adminAgent, "admin@app.test");
    await createUser(adminAgent, acceptSenderEmail, "Inbox Accept Sender");
    await createUser(adminAgent, declineSenderEmail, "Inbox Decline Sender");
    await createUser(adminAgent, recipientEmail, "Inbox Recipient");

    await login(acceptSenderAgent, acceptSenderEmail);
    await login(declineSenderAgent, declineSenderEmail);
    await login(recipientAgent, recipientEmail);

    const acceptSearch = await acceptSenderAgent
      .get("/friends/search")
      .query({ q: recipientEmail })
      .set("HX-Request", "true")
      .expect(200);
    const acceptTargetId = acceptSearch.text.match(/name="userId" value="([^"]+)"/)?.[1];
    expect(acceptTargetId).toBeTruthy();

    await acceptSenderAgent
      .post("/friends/requests")
      .set("HX-Request", "true")
      .type("form")
      .send({ userId: acceptTargetId })
      .expect(200);

    const declineSearch = await declineSenderAgent
      .get("/friends/search")
      .query({ q: recipientEmail })
      .set("HX-Request", "true")
      .expect(200);
    const declineTargetId = declineSearch.text.match(/name="userId" value="([^"]+)"/)?.[1];
    expect(declineTargetId).toBeTruthy();

    await declineSenderAgent
      .post("/friends/requests")
      .set("HX-Request", "true")
      .type("form")
      .send({ userId: declineTargetId })
      .expect(200);

    const inbox = await recipientAgent.get("/invites").expect(200);
    expect(inbox.text).toContain("Inbox Accept Sender");
    expect(inbox.text).toContain("Inbox Decline Sender");
    expect(inbox.text).toContain("Accept");
    expect(inbox.text).toContain("Decline");

    const acceptRequesterId = inbox.text.match(/\/friends\/requests\/([^/]+)\/accept\?inbox=true/)?.[1];
    expect(acceptRequesterId).toBeTruthy();

    await recipientAgent
      .post(`/friends/requests/${acceptRequesterId}/accept`)
      .query({ inbox: "true" })
      .set("HX-Request", "true")
      .expect(200, "");

    const inboxAfterAccept = await recipientAgent.get("/invites").expect(200);
    expect(inboxAfterAccept.text).not.toContain("Inbox Accept Sender");
    expect(inboxAfterAccept.text).toContain("Inbox Decline Sender");
    const declineRequesterId = inboxAfterAccept.text.match(/\/friends\/requests\/([^/]+)\/decline\?inbox=true/)?.[1];
    expect(declineRequesterId).toBeTruthy();

    await recipientAgent
      .post(`/friends/requests/${declineRequesterId}/decline`)
      .query({ inbox: "true" })
      .set("HX-Request", "true")
      .expect(200, "");

    const updatedInbox = await recipientAgent.get("/invites").expect(200);
    expect(updatedInbox.text).not.toContain("Inbox Accept Sender");
    expect(updatedInbox.text).not.toContain("Inbox Decline Sender");

    const recipientFriendsPage = await recipientAgent.get("/friends").expect(200);
    expect(recipientFriendsPage.text).toContain("Inbox Accept Sender");
    expect(recipientFriendsPage.text).not.toContain("Inbox Decline Sender");
  });
});
