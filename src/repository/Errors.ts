export type EventError =
  | { name: 'EventNotFound'; message: string }
  | { name: 'InvalidId'; message: string }
  | { name: 'InvalidSearchInput'; message: string }
  | { name: 'UnexpectedRepositoryError'; message: string }
  | { name: 'ValidationError'; message: string}
  | { name: 'UnautherizedError'; message: string}
  | { name: 'InvalidEventState'; message: string }
  | { name: 'InvalidInput'; message: string };
 
export const EventNotFound = (message: string): EventError => ({
  name: 'EventNotFound',
  message,
});
 
export const InvalidId = (message: string): EventError => ({
  name: 'InvalidId',
  message,
});

export const ValidationError = (message: string): EventError => ({
    name: 'ValidationError',
    message,
});

export const InvalidSearchInput = (message: string): EventError => ({
  name: 'InvalidSearchInput',
  message,
});
 
export const UnexpectedRepositoryError = (message: string): EventError => ({
  name: 'UnexpectedRepositoryError',
  message,
});

export const UnautherizedError = (message: string): EventError => ({
  name: 'UnautherizedError',
  message,
})

export const InvalidInputError = (message: string): EventError => ({
  name: 'InvalidInput',
  message,
})

export const InvalidEventState = (message: string): EventError => ({
  name: 'InvalidEventState',
  message,
})