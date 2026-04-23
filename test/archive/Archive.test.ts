import { CreateEventService } from "../../src/service/EventService";
import { CreateInMemoryEventRepository } from "../../src/repository/InMemoryEventRepository";
import type { CreateEventServiceInput } from "../../src/service/EventService";

test("archiveExpiredEvents transitions expired events to past", async () => {
  const repo = CreateInMemoryEventRepository();
  const service = CreateEventService(repo);

  const now = new Date();

  const input: CreateEventServiceInput = {
    title: "Expired Event",
    description: "desc",
    location: "loc",
    category: "cat",
    status: "published",
    capacity: null,
    startDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000 * 2),
    endDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };

  await service.createEvent(input, "user1");

  const result = await service.archiveExpiredEvents();

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value).toBe(1);

  const past = await service.getPastEvents();
  expect(past.ok).toBe(true);
  if (!past.ok) return;

  expect(past.value.length).toBe(1);
  expect(past.value[0].status).toBe("past");
});

test("archiveExpiredEvents does not modify non-expired events", async () => {
  const repo = CreateInMemoryEventRepository();
  const service = CreateEventService(repo);

  const now = new Date();

  const input: CreateEventServiceInput = {
    title: "Future Event",
    description: "desc",
    location: "loc",
    category: "cat",
    status: "published",
    capacity: null,
    startDatetime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    endDatetime: new Date(now.getTime() + 24 * 60 * 60 * 1000 * 2),
  };

  await service.createEvent(input, "user1");

  const result = await service.archiveExpiredEvents();

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value).toBe(0);

  const active = await service.getActiveEvents();
  expect(active.ok).toBe(true);
  if (!active.ok) return;

  expect(active.value.length).toBe(1);
  expect(active.value[0].status).toBe("published");
});

test("getPastEvents returns only past events sorted by end date", async () => {
  const repo = CreateInMemoryEventRepository();
  const service = CreateEventService(repo);

  const now = new Date();

  const oldEvent: CreateEventServiceInput = {
    title: "Old Event",
    description: "desc",
    location: "loc",
    category: "cat",
    status: "past",
    capacity: null,
    startDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000 * 10),
    endDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000 * 5),
  };

  const olderEvent: CreateEventServiceInput = {
    title: "Older Event",
    description: "desc",
    location: "loc",
    category: "cat",
    status: "past",
    capacity: null,
    startDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000 * 20),
    endDatetime: new Date(now.getTime() - 24 * 60 * 60 * 1000 * 15),
  };

  await service.createEvent(oldEvent, "user1");
  await service.createEvent(olderEvent, "user1");

  const result = await service.getPastEvents();

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.length).toBe(2);

  expect(result.value[0].title).toBe("Old Event");
  expect(result.value[1].title).toBe("Older Event");
});