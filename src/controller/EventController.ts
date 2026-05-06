import type { Response, Request } from 'express';
import type { IEventService, CreateEventServiceInput } from '../service/EventService';
import type { ILoggingService } from '../service/LoggingService';
import type { IAppBrowserSession } from '../session/AppSession';
import type { Result } from '../lib/result';
import type { EventError } from '../repository/Errors';
import type { EventStatus, IEvent} from '../repository/InMemoryEventRepository';
import type { IAdminUserService } from '../auth/AdminUserService';

export interface IEditEventForm {
  title: string;
  category: string;
  emoji: string;
  location: string;
  description: string;
  status: string;
  capacity: string;
  startDatetime: string;
  endDatetime: string;
}

export interface IEventController {
    showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void>;
    showDashboardEventsList(res: Response, session: IAppBrowserSession, isArchive: boolean): Promise<void>;
    showAllEvents(res: Response, session: IAppBrowserSession): Promise<void>;
    showEventsList(res: Response, session: IAppBrowserSession, isArchive: boolean): Promise<void>;
    handleCreateEvent(res: Response, session: IAppBrowserSession, body: Record<string, unknown>, isHtmx: boolean): Promise<void>;
    showEventDetail(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    showEventEdit(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    submitEventEdit(res: Response, session: IAppBrowserSession, eventId: number, form: IEditEventForm): Promise<void>;
    handlePublishEvent(req: Request, res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    handleCancelEvent(req: Request, res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    showUserEvents(res: Response, session: IAppBrowserSession): Promise<void>;
    searchEvents(res: Response, session: IAppBrowserSession, query: string): Promise<void>;
    searchEventsPartial(res: Response, session: IAppBrowserSession, query: string): Promise<void>;
    showArchivedEvents(res: Response, session: IAppBrowserSession): Promise<void>;
    handleRsvpEvent(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    handleRsvpCancelEvent(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    showRSVPDashboard(res: Response, session: IAppBrowserSession): Promise<void>;
    showRSVPedUsers(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    handleRemoveRSVPedUser(res: Response, session: IAppBrowserSession, eventId: number, userId: string): Promise<void>;
}

const VALID_STATUSES: EventStatus[] = ['draft', 'published', 'cancelled', 'past'];

class EventController implements IEventController {
    private service: IEventService;
    private logger: ILoggingService;
    private adminUserService: IAdminUserService;

    constructor(service: IEventService, logger: ILoggingService, adminUserService: IAdminUserService) {
        this.service = service;
        this.logger = logger;
        this.adminUserService = adminUserService;
    }

    private mapErrorStatus(error: EventError): number {
        if(error.name === 'ValidationError'){return 400;}
        if(error.name === 'InvalidSearchInput'){return 400;}
        if(error.name === 'EventNotFound'){return 404;}
        if(error.name === 'InvalidId'){return 400;}
        if(error.name === 'UnautherizedError'){return 403;}
        if(error.name === 'InvalidEventState') {return 409;}
        if(error.name === 'InvalidInput') {return 400;}
        return 500;
    }
        
    private toDatetimeLocalValue(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    private eventToEditForm(event: IEvent): IEditEventForm {
        return {
            title: event.title,
            category: event.category,
            emoji: event.emoji ?? "",
            location: event.location,
            description: event.description,
            status: event.status,
            capacity: event.capacity === null ? "" : String(event.capacity),
            startDatetime: this.toDatetimeLocalValue(new Date(event.startDatetime)),
            endDatetime: this.toDatetimeLocalValue(new Date(event.endDatetime)),
        };
    }

    private parseEditInput(form: IEditEventForm): CreateEventServiceInput {
        const status: EventStatus = VALID_STATUSES.includes(form.status as EventStatus)
        ? (form.status as EventStatus)
        : "draft";

        const capacityText = form.capacity.trim();
        const capacity =
        capacityText.length === 0 ? null : Number.parseInt(capacityText, 10);
        const emoji = form.emoji.trim().length === 0 ? null : form.emoji;

        return {
            title: form.title,
            category: form.category,
            emoji,
            location: form.location,
            description: form.description,
            status,
            capacity,
            startDatetime: new Date(form.startDatetime),
            endDatetime: new Date(form.endDatetime),
        };
    }

    async handleRsvpEvent(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.rsvpEvent(eventId, session.authenticatedUser?.userId ?? '');
        if (!result.ok) {
            this.logger.error('Error RSVPing for event');
            const error = result.value as EventError;
            res.status(this.mapErrorStatus(error)).send(error.message);
            return;
        }
        res.status(200).render("events/partials/event-item", {
            event: result.value,
            session,
            layout: false,
        });
    }

    async handleRsvpCancelEvent(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.rsvpCancelEvent(eventId, session.authenticatedUser?.userId ?? '');
        if (!result.ok) {
            this.logger.error('Error cancelling RSVP for event');
            const error = result.value as EventError;
            res.status(this.mapErrorStatus(error)).send(error.message);
            return;
        }
        res.status(200).render("events/partials/event-item", {
            event: result.value,
            session,
            layout: false,
        });
    }

    async handleRemoveRSVPedUser(res: Response, session: IAppBrowserSession, eventId: number, userId: string): Promise<void> {
        const currentUser = session.authenticatedUser;
        if (!currentUser) {
            res.status(401).render('partials/error', { message: 'Authentication required.', layout: false });
            return;
        }

        const eventResult = await this.service.getEventByID(eventId);
        if (!eventResult.ok) {
            const error = eventResult.value as EventError;
            res.status(this.mapErrorStatus(error)).render('partials/error', { message: error.message, layout: false });
            return;
        }

        const isOwner = currentUser.userId === eventResult.value.organizerId;
        const isAdmin = currentUser.role === 'admin';
        if (!isOwner && !isAdmin) {
            res.status(403).render('partials/error', { message: 'You are not authorized to manage RSVPs for this event.', layout: false });
            return;
        }

        const result = await this.service.rsvpCancelEvent(eventId, userId);
        if (!result.ok) {
            const error = result.value as EventError;
            res.status(this.mapErrorStatus(error)).render('partials/error', { message: error.message, layout: false });
            return;
        }

        await this.showRSVPedUsers(res, session, eventId);
    }


    async showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void> {
        await this.service.archiveExpiredEvents();
        const currentUserId = session.authenticatedUser?.userId ?? '';
        const isAdmin = session.authenticatedUser?.role === 'admin';
        const result = await (isAdmin ? this.service.getActiveEvents() : this.service.getActiveUserEvents(currentUserId));
        
        if (!result.ok) {
            this.logger.error('Error fetching dashboard data');
            res.status(500).send('Error fetching dashboard data');
            return;
        }
        res.status(200);
        this.logger.info('Dashboard data fetched successfully');
        res.render('dashboard', { data: result.value, session, isArchive: false });
    }

    async showDashboardEventsList(res: Response, session: IAppBrowserSession, isArchive: boolean): Promise<void> {
        await this.service.archiveExpiredEvents();
        const currentUserId = session.authenticatedUser?.userId ?? '';
        const isAdmin = session.authenticatedUser?.role === 'admin';
        
        const result = isArchive
            ? (isAdmin ? await this.service.getPastEvents() : await this.service.getPastUserEvents(currentUserId))
            : (isAdmin ? await this.service.getActiveEvents() : await this.service.getActiveUserEvents(currentUserId));

        if (!result.ok) {
            this.logger.error('Error fetching dashboard event list');
            res.status(500).send('Error fetching dashboard event list');
            return;
        }

        res.status(200).render('dashboard/partials/dashboard-events-list-page', {
            data: result.value,
            session,
            isArchive,
            layout: false,
        });
    }

    private async renderEventsSection(
        res: Response,
        session: IAppBrowserSession,
        eventsResult: Result<IEvent[], EventError>,
        isArchive: boolean,
        partialOnly: boolean,
    ): Promise<void> {
        if (!eventsResult.ok) {
            this.logger.error('Error fetching event list data');
            res.status(500).send('Error fetching event list data');
            return;
        }

        if (partialOnly) {
            res.status(200).render('events/partials/events-list-page', {
                data: eventsResult.value,
                session,
                isArchive,
                layout: false,
            });
            return;
        }

        res.status(200);
        this.logger.info('All events data fetched successfully');
        res.render('events/index', {
            data: eventsResult.value,
            session,
            isArchive,
        });
    }

    async showAllEvents(res: Response, session: IAppBrowserSession): Promise<void> {
        await this.service.archiveExpiredEvents();
        const userId = session.authenticatedUser?.userId ?? '';
        const userRole = session.authenticatedUser?.role ?? '';
        const result = await this.service.getEventsForUser(userId, userRole);
        await this.renderEventsSection(res, session, result, false, false);
    }

    async showEventsList(res: Response, session: IAppBrowserSession, isArchive: boolean): Promise<void> {
        await this.service.archiveExpiredEvents();
        const userId = session.authenticatedUser?.userId ?? '';
        const userRole = session.authenticatedUser?.role ?? '';
        const result = isArchive
            ? await this.service.getPastEvents()
            : await this.service.getEventsForUser(userId, userRole);
        await this.renderEventsSection(res, session, result, isArchive, true);
    }

    async searchEvents(res: Response, session: IAppBrowserSession, query: string): Promise<void> {
        const result = await this.service.getEventsBySearch(query);
        if (result.ok === false) {
            const statusCode = this.mapErrorStatus(result.value);
            this.logger.warn(`Invalid search request with query "${query}": ${result.value.message}`);
            res.status(statusCode).render('events/search', { 
                data: [], 
                session, 
                query,
                error: result.value.message 
            });
            return;
        }
        res.status(200);
        this.logger.info(`Events found for query "${query}": ${result.value.length}`);
        res.render('events/search', { data: result.value, session, query });
    }

    async searchEventsPartial(res: Response, session: IAppBrowserSession, query: string): Promise<void> {
        const result = await this.service.getEventsBySearch(query);
        if (result.ok === false) {
            const statusCode = this.mapErrorStatus(result.value);
            this.logger.warn(`Invalid search request with query "${query}": ${result.value.message}`);
            res.status(statusCode).render('events/partials/search-results-page', { 
                data: [], 
                session, 
                query,
                error: result.value.message,
                layout: false 
            });
            return;
        }
        res.status(200);
        this.logger.info(`Events found for query "${query}": ${result.value.length}`);
        res.render('events/partials/search-results-page', { data: result.value, session, query, layout: false });
    }


    async handleCreateEvent(res: Response, session: IAppBrowserSession, body: Record<string, unknown>, isHtmx: boolean): Promise<void> {
        const organizerId = session.authenticatedUser?.userId ?? '';
        const title = typeof body.title === 'string' ? body.title : '';
        const description = typeof body.description === 'string' ? body.description : '';
        const location = typeof body.location === 'string' ? body.location : '';
        const category = typeof body.category === 'string' ? body.category : '';
        const emojiRaw = typeof body.emoji === 'string' ? body.emoji : '';
        const emoji = emojiRaw.trim().length === 0 ? null : emojiRaw;
        const statusRaw = typeof body.status === 'string' ? body.status : '';
        const status: EventStatus = VALID_STATUSES.includes(statusRaw as EventStatus)
            ? (statusRaw as EventStatus)
            : 'draft';
        const capacityRaw = typeof body.capacity === 'string' ? body.capacity.trim() : '';
        const capacity = capacityRaw === '' ? null : parseInt(capacityRaw, 10);
        const startDatetime = new Date(typeof body.startDatetime === 'string' ? body.startDatetime : '');
        const endDatetime = new Date(typeof body.endDatetime === 'string' ? body.endDatetime : '');

        const input: CreateEventServiceInput = {
            title,
            description,
            location,
            category,
            emoji,
            status,
            capacity,
            startDatetime,
            endDatetime,
        };

        const result = await this.service.createEvent(input, organizerId);
        if(result.ok === false){
            const httpStatus = this.mapErrorStatus(result.value);
            const log = httpStatus >= 500 ? this.logger.error : this.logger.warn;
            log.call(this.logger, `Create event failed: ${result.value.message}`);
            if(isHtmx){
                res.render('events/partials/create-form-response', {
                    pageError: result.value.message,
                    layout: false,
                });
            }else{
                res.status(httpStatus).render('events/create', { session, pageError: result.value.message });
            }
            return;
        }

        this.logger.info(`Created event ${result.value.id}: "${result.value.title}"`);
        if(isHtmx){
            res.setHeader('HX-Redirect', `/events/${result.value.id}`);
            res.status(200).send('');
        }else{
            res.redirect(`/events/${result.value.id}`);
        }
    }

    async showEventDetail(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.getEventByID(eventId);
        if (result.ok === false) {
            const status = this.mapErrorStatus(result.value);
            this.logger.warn(`Event detail fetch failed for id ${eventId}: ${result.value.message}`);
            res.status(status).render('partials/error', { message: result.value.message, layout: false });
            return;
        }
        const event = result.value;
        if (event.status === 'draft') {
            const currentUser = session.authenticatedUser;
            const isAdmin = currentUser?.role === 'admin';
            const isOwner = currentUser?.userId === event.organizerId;
            if (!isAdmin && !isOwner) {
                this.logger.warn(`Blocked draft event ${eventId} from user ${currentUser?.userId ?? 'unauthenticated'}`);
                res.status(404).render('partials/error', { message: 'Event not found.', layout: false });
                return;
            }
        }
        const organizerRes = await this.adminUserService.findUserById(event.organizerId);
        const organizerName = organizerRes.ok && organizerRes.value ? organizerRes.value.displayName : 'Unkown Organizer';
        this.logger.info(`Fetched event detail for id ${eventId}`);
        res.status(200);
        res.render('events/detail', { event, organizerName, session, pageError: null });
    }
    
    async showEventEdit(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const currentUser = session.authenticatedUser;

        if (!currentUser) {
        this.logger.warn("Blocked edit form for unauthenticated user");
        res.status(401).render("partials/error", {
            message: "Please log in to continue.",
            layout: false,
        });
        return;
        }

        const result = await this.service.getEditableEvent(
        eventId,
        currentUser.userId,
        String(currentUser.role ?? ""),
        );

        if (result.ok === false) {
            const status = this.mapErrorStatus(result.value);
            const log = status >= 500 ? this.logger.error : this.logger.warn;
            log.call(this.logger, `Show edit form failed for event ${eventId}: ${result.value.message}`);

            if (status === 404) {
                res.status(status).render("partials/error", {
                message: result.value.message,
                layout: false,
                });
                return;
            }

            res.status(status).render("events/edit", {
                session,
                eventId,
                pageError: result.value.message,
                formData: {
                title: "",
                category: "",
                emoji: "",
                location: "",
                description: "",
                status: "draft",
                capacity: "",
                startDatetime: "",
                endDatetime: "",
                },
            });
            return;
        }

        this.logger.info(`Editable event ${eventId} loaded successfully`);
        res.status(200).render("events/edit", {
        session,
        eventId,
        pageError: null,
        formData: this.eventToEditForm(result.value),
        });
    }

    async submitEventEdit(res: Response, session: IAppBrowserSession, eventId: number, form: IEditEventForm): Promise<void> {
        const currentUser = session.authenticatedUser;

        if (!currentUser) {
        this.logger.warn("Blocked event update for unauthenticated user");
        res.status(401).render("partials/error", {
            message: "Please log in to continue.",
            layout: false,
        });
        return;
        }

        const input = this.parseEditInput(form);

        const result = await this.service.updateEvent(
        eventId,
        currentUser.userId,
        String(currentUser.role ?? ""),
        input,
        );

        if (result.ok === false) {
            const status = this.mapErrorStatus(result.value);
            const log = status >= 500 ? this.logger.error : this.logger.warn;
            log.call(this.logger, `Update event failed for id ${eventId}: ${result.value.message}`);

            if (status === 404) {
                res.status(status).render("partials/error", {
                message: result.value.message,
                layout: false,
                });
                return;
            }

            res.status(status).render("events/edit", {
                session,
                eventId,
                pageError: result.value.message,
                formData: form,
            });
            return;
        }

        this.logger.info(`Event ${eventId} updated successfully`);
        res.redirect(`/events/${result.value.id}`);
    }

    async showUserEvents(res: Response, session: IAppBrowserSession): Promise<void> {
        const userId = session.authenticatedUser?.userId ?? '';
        const result = await this.service.getUserEvents(userId);
        if (result.ok === false) {
            this.logger.error(`Error fetching user events for ${userId}: ${result.value.message}`);
            res.status(500).render('partials/error', { message: 'Could not load your events.', layout: false });
            return;
        }
        this.logger.info(`Fetched ${result.value.length} events for user ${userId}`);
        res.status(200).render('events/my-events', { data: result.value, session, pageError: null });
    }

    async handlePublishEvent(req: Request, res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const currentUser = session.authenticatedUser;
        const isHtmx = req.get("HX-Request") === "true";

        if (!currentUser) {
          this.logger.warn("Blocked publish for unauthenticated user");
          res.status(401).render("partials/error", {
            message: "Please log in to continue.",
            layout: false,
          });
          return;
        }

        const result = await this.service.publishEvent(eventId, currentUser.userId, String(currentUser.role ?? ""));
        if (result.ok === false) {
          const status = this.mapErrorStatus(result.value);
          this.logger.warn(`Publish failed for event ${eventId}: ${result.value.message}`);

          const eventResult = await this.service.getEventByID(eventId);
          if (eventResult.ok === false) {
            res.status(status).render("partials/error", {
              message: result.value.message,
              layout: false,
            });
            return;
          }

          if (isHtmx) {
            res.status(status).render("dashboard/partials/dashboard-event-item", {
              event: eventResult.value,
              session,
              pageError: result.value.message,
              layout: false,
            });
            return;
          }

          res.status(status).render("events/detail", {
            event: eventResult.value,
            session,
            pageError: result.value.message,
          });
          return;
        }

        this.logger.info(`Event ${eventId} published successfully`);

        if (isHtmx) {
          res.status(200).render("dashboard/partials/dashboard-event-item", {
            event: result.value,
            session,
            pageError: null,
            layout: false,
          });
        } else {
          res.redirect(`/events/${result.value.id}`);
        }
    }

    async handleCancelEvent(req: Request, res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const currentUser = session.authenticatedUser;
        const isHtmx = req.get("HX-Request") === "true";

        if (!currentUser) {
          this.logger.warn("Blocked cancel for unauthenticated user");
          res.status(401).render("partials/error", {
            message: "Please log in to continue.",
            layout: false,
          });
          return;
        }

        const result = await this.service.cancelEvent(
          eventId,
          currentUser.userId,
          String(currentUser.role ?? ""),
        );

        if (result.ok === false) {
          const status = this.mapErrorStatus(result.value);
          this.logger.warn(`Cancel failed for event ${eventId}: ${result.value.message}`);

          const eventResult = await this.service.getEventByID(eventId);
          if (eventResult.ok === false) {
            res.status(status).render("partials/error", {
              message: result.value.message,
              layout: false,
            });
            return;
          }

          if (isHtmx) {
            res.status(status).render("dashboard/partials/dashboard-event-item", {
              event: eventResult.value,
              session,
              pageError: result.value.message,
              layout: false,
            });
            return;
          }

          res.status(status).render("events/detail", {
            event: eventResult.value,
            session,
            pageError: result.value.message,
          });
          return;
        }

        this.logger.info(`Event ${eventId} cancelled successfully`);

        if (isHtmx) {
          res.status(200).render("dashboard/partials/dashboard-event-item", {
            event: result.value,
            session,
            pageError: null,
            layout: false,
          });
        } else {
          res.redirect(`/events/${result.value.id}`);
        }
    }

    async showArchivedEvents(res: Response, session: IAppBrowserSession): Promise<void> {
        await this.service.archiveExpiredEvents();
        const result = await this.service.getPastEvents();

        if (!result.ok) {
            this.logger.error("Failed to load archive");
            res.status(500).send("Failed to load archive");
            return;
        }

        res.status(200).render("events/archive", {data: result.value, session, isArchive: true});
    }

    async showRSVPDashboard(res: Response, session: IAppBrowserSession): Promise<void> {
        const userId = session.authenticatedUser?.userId ?? '';
        const result = await this.service.getUsersRSVPedEvents(userId);
        if (!result.ok) {
            const error = result.value as EventError;
            this.logger.error(`Error fetching RSVP dashboard for user ${userId}: ${error.message}`);
            res.status(500).render('partials/error', { message: 'Could not load your RSVPs.', layout: false });
            return;
        }
        this.logger.info(`Fetched ${result.value.length} RSVPed events for user ${userId}`);
        res.status(200).render('events/rsvp-dashboard', { data: result.value, session, pageError: null });
    }   

    async showRSVPedUsers(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.getAllRSVPedUserByEventId(eventId);
        if (!result.ok) {
            const error = result.value as EventError;
            this.logger.error(`Error fetching RSVPed users for event ${eventId}: ${error.message}`);
            res.status(500).render('partials/error', { message: 'Could not load RSVPed users.', layout: false });
            return;
        }

        const attendees = await Promise.all(
            result.value.map(async (userId) => {
                const userResult = await this.adminUserService.findUserById(userId);
                return {
                    id: userId,
                    displayName: userResult.ok && userResult.value ? userResult.value.displayName : 'Unknown attendee',
                };
            }),
        );

        this.logger.info(`Fetched ${attendees.length} RSVPed users for event ${eventId}`);
        res.status(200).render('events/rsvped-users', {
            data: attendees,
            eventId,
            session,
            pageError: null,
            layout: false,
        });
    }
}

export function CreateController(service: IEventService, logger: ILoggingService, adminUserService: IAdminUserService): IEventController {
    return new EventController(service, logger, adminUserService);
}
