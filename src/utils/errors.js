// Errors whose message is written for the user and is safe to show in the UI as-is.
export class UserFacingError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UserFacingError'
  }
}
