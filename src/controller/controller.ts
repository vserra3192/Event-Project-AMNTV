import type { Response } from 'express';
import { ok } from 'node:assert';



export interface IController {
    showEventDashboard(res: Response): Promise<void>;
}

class Controller implements IController {
    private service: IService;

    constructor(service: IService) {
        this.service = service;
    }

    async showEventDashboard(res: Response): Promise<void> {
        const result = await this.service.getAllEvents();
        if (result != ok) {
            res.status(500).send('Error fetching dashboard data');
            return;
        }
        res.render('dashboard', { data: result });
    }
}


export function CreateController(service: IService): IController {
    return new Controller(service);
}