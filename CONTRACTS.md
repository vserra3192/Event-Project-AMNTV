# SERVICE CONTRACTS

## EventService

### `createEvent(input, organizerId)`

Accepts:

```ts
input: CreateEventServiceInput
organizerId: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Validates required title, description, location, category, valid dates, end after start, positive capacity when provided, and RSVP policy.
- Defaults missing `rsvpPolicy` to `"anyone"`.

### `getAllEvents()`

Accepts: no arguments.

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

### `getEventByID(id)`

Accepts:

```ts
id: number
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Rejects non-integer or less-than-1 IDs with `ValidationError`.
- Repository may return `InvalidId` or `EventNotFound`.

### `getUserEvents(userId)`

Accepts:

```ts
userId: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Returns events organized by `userId`.

### `getEventsForUser(userId, userRole?)`

Accepts:

```ts
userId: string
userRole?: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Admins receive all events.
- Non-admins receive published events plus drafts they organize.

### `getActiveUserEvents(userId)`

Accepts:

```ts
userId: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Returns active events organized by `userId`.

### `getPastUserEvents(userId)`

Accepts:

```ts
userId: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Returns past or cancelled events organized by `userId`.

### `getEditableEvent(eventId, actingUserId, actingUserRole)`

Accepts:

```ts
eventId: number
actingUserId: string
actingUserRole: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Requires a valid positive integer event ID.
- Requires a logged-in acting user.
- Allows only the organizer or an admin.
- Rejects cancelled or concluded events with `InvalidEventState`.

### `updateEvent(eventId, actingUserId, actingUserRole, input)`

Accepts:

```ts
eventId: number
actingUserId: string
actingUserRole: string
input: CreateEventServiceInput
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Uses `getEditableEvent` authorization and state rules.
- Applies the same validation rules as `createEvent`.

### `publishEvent(eventId, actingUserId, actingUserRole)`

Accepts:

```ts
eventId: number
actingUserId: string
actingUserRole: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Allows only organizer or admin.
- Only draft events can be published.

### `cancelEvent(eventId, actingUserId, actingUserRole)`

Accepts:

```ts
eventId: number
actingUserId: string
actingUserRole: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Allows only organizer or admin.
- Only published events can be cancelled.

### `archiveExpiredEvents()`

Accepts: no arguments.

Returns:

```ts
Promise<Result<number, EventError>>
```

Notes:

- Finds events whose end time is before now and marks them `past`.
- Returns the number of events successfully archived.

### `getActiveEvents()`

Accepts: no arguments.

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Returns all events except `past` and `cancelled`.

### `getActiveEventsForUser(userId, userRole)`

Accepts:

```ts
userId: string
userRole: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Starts from active events and filters to events the user can join.
- Joinable means published and either organizer, admin, RSVP policy `anyone`, friend of organizer for `friends-only`, or invited for `invite-only`.

### `getPastEvents()`

Accepts: no arguments.

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Returns `past` and `cancelled` events.
- Sorts by `endDatetime` descending.

### `getEventsBySearch(query)`

Accepts:

```ts
query: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Trims the query.
- Requires 2 to 100 characters.

### `getEventsBySearchForUser(query, userId, userRole)`

Accepts:

```ts
query: string
userId: string
userRole: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

Notes:

- Runs search, then filters results to events the user can join.

### `rsvpEvent(eventId, userId, userRole?)`

Accepts:

```ts
eventId: number
userId: string
userRole?: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

Notes:

- Loads the event and verifies the user can join before adding RSVP.

### `rsvpCancelEvent(eventId, userId)`

Accepts:

```ts
eventId: number
userId: string
```

Returns:

```ts
Promise<Result<IEvent, EventError>>
```

### `getUsersRSVPedEvents(userId)`

Accepts:

```ts
userId: string
```

Returns:

```ts
Promise<Result<IEvent[], EventError>>
```

### `getAllRSVPedUserByEventId(eventId)`

Accepts:

```ts
eventId: number
```

Returns:

```ts
Promise<Result<string[], EventError>>
```

Notes:

- Returns user IDs for RSVPs on the event.

## CommentService

### `getCommentsByEventId(eventId)`

Accepts:

```ts
eventId: number
```

Returns:

```ts
Promise<Result<IComment[], CommentServiceError>>
```

Notes:

- Rejects non-integer or less-than-1 event IDs with `InvalidContent`.
- Verifies the event exists before returning comments.
- Comments are readable on `published`, `past`, and `cancelled` events.
- Returns `Forbidden` for `draft` events.

### `addComment(eventId, content, actor)`

Accepts:

```ts
eventId: number
content: string
actor: {
  userId: string;
  displayName: string;
  role: "admin" | "staff" | "user";
}
```

Returns:

```ts
Promise<Result<IComment, CommentServiceError>>
```

Notes:

- Rejects non-integer or less-than-1 event IDs with `InvalidContent`.
- Rejects empty or whitespace-only content with `InvalidContent`.
- Trims content before saving.
- Verifies the event exists before saving.
- Comments are available on `published` and `past` events.
- Returns `Forbidden` for `draft` or `cancelled` events.

### `deleteComment(commentId, actor)`

Accepts:

```ts
commentId: number
actor: {
  userId: string;
  displayName: string;
  role: "admin" | "staff" | "user";
}
```

Returns:

```ts
Promise<Result<void, CommentServiceError>>
```

Notes:

- Rejects non-integer or less-than-1 comment IDs with `InvalidContent`.
- Allows deletion by the comment author, an admin, or the event organizer.
- Comment deletion authorization applies on `published` and `past` events.
- Returns `Forbidden` for comments on `draft` or `cancelled` events.
