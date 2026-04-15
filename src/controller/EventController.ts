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
    handleUpdateEventTitle(res: Response, session: IAppBrowserSession, eventId: number, title: string): Promise<void>;
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
}

export function CreateController(service: IEventService, logger: ILoggingService): IEventController {
    return new EventController(service, logger);
}
