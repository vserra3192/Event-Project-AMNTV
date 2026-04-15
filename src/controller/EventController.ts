import type { Response } from 'express';
import type { IEventService, CreateEventServiceInput } from '../service/EventService';
import type { ILoggingService } from '../service/LoggingService';
import type { IAppBrowserSession } from '../session/AppSession';
import type { EventError } from '../repository/Errors';
import type { EventStatus } from '../repository/EventRepository';



export interface IEventController {
    showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void>;
    handleCreateEvent(res: Response, session: IAppBrowserSession, body: Record<string, unknown>): Promise<void>;
    showEventDetail(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    showEventEdit(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
    showUserEvents(res: Response, session: IAppBrowserSession): Promise<void>;
}

const VALID_STATUSES: EventStatus[] = ['draft', 'published', 'cancelled', 'past'];

class EventController implements IEventController {
    private service: IEventService;
    private logger: ILoggingService;

    constructor(service: IEventService, logger: ILoggingService) {
        this.service = service;
        this.logger = logger;
    }

    private mapErrorStatus(error: EventError): number {
        if(error.name === 'ValidationError'){return 400;}
        if(error.name === 'EventNotFound'){return 404;}
        if(error.name === 'InvalidId'){return 400;}
        return 500;
    }
        

    async showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void> {
        const result = await this.service.getUserEvents(session.authenticatedUser?.userId ?? '');
        if (!result.ok) {
            this.logger.error('Error fetching dashboard data');
            res.status(500).send('Error fetching dashboard data');
            return;
        }
        res.status(200);
        this.logger.info('Dashboard data fetched successfully');
        res.render('dashboard', { data: result.value, session }); // will update this to send the actual data once we have it defined
    }

    async handleCreateEvent(res: Response, session: IAppBrowserSession, body: Record<string, unknown>): Promise<void> {
        const organizerId = session.authenticatedUser?.userId ?? '';
        const title = typeof body.title === 'string' ? body.title : '';
        const description = typeof body.description === 'string' ? body.description : '';
        const location = typeof body.location === 'string' ? body.location : '';
        const category = typeof body.category === 'string' ? body.category : '';
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
            res.status(httpStatus).render('events/create', { session, pageError: result.value.message });
            return;
        }

        this.logger.info('Created event ${result.value.id}: "${result.value.title}"');
        res.redirect(`/events/${result.value.id}`);
    }

    async showEventDetail(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.getEventByID(eventId);
        if (result.ok === false) {
            const status = this.mapErrorStatus(result.value);
            this.logger.warn(`Event detail fetch failed for id ${eventId}: ${result.value.message}`);
            res.status(status).render('partials/error', { message: result.value.message, layout: false });
            return;
        }
        this.logger.info(`Fetched event detail for id ${eventId}`);
        res.status(200);
        res.render('events/detail', { event: result.value, session, pageError: null });
    }
    
    async showEventEdit(res: Response, session: IAppBrowserSession, eventId: number): Promise<void> {
        const result = await this.service.getEventByID(eventId);
        if (!result.ok) {
            this.logger.error('Error fetching event data');
            res.status(500).send('Error fetching event data');
            return;
        }
        res.status(200);
        this.logger.info('Event data fetched successfully');
        res.render('event-edit', { data: result.value, session });
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
}

export function CreateController(service: IEventService, logger: ILoggingService): IEventController {
    return new EventController(service, logger);
}
