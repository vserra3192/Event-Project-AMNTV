export type EventError = 
    | {'name': 'EventNotFound', 'message': string}
    | {'name': 'InvalidId', 'message': string}

export const EventNotFound = (message: string): EventError => ({
    name: 'EventNotFound',
    message,
});

export const InvalidId = (message: string): EventError => ({
    name: 'InvalidId',
    message,
});