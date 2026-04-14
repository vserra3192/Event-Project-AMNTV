import type { Response } from 'express';
import { ok } from 'node:assert';
import type { IEventService } from '../service/EventService';
import type { ILoggingService } from '../service/LoggingService';
import type { IAppBrowserSession, AppSessionStore, touchAppSession } from '../session/AppSessionStore';



export interface IEventController {
    showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void>;
    showEventEdit(res: Response, session: IAppBrowserSession, eventId: number): Promise<void>;
}

class EventController implements IEventController {
    private service: IEventService;
    private logger: ILoggingService;

    constructor(service: IEventService, logger: ILoggingService) {
            this.service = service;
            this.logger = logger;
        }

    async showEventDashboard(res: Response, session: IAppBrowserSession): Promise<void> {
        const result = await this.service.getAllEvents();
        if (!result.ok) {
            this.logger.error('Error fetching dashboard data');
            res.status(500).send('Error fetching dashboard data');
            return;
        }
        res.status(200);
        this.logger.info('Dashboard data fetched successfully');
        res.render('dashboard', { data: result.value }); // will update this to send the actual data once we have it defined
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
        res.render('eventEdit', { data: result.value });
    }
}

export function CreateController(service: IEventService, logger: ILoggingService): IEventController {
    return new EventController(service, logger);
}
