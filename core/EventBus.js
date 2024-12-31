class EventBus {
    constructor() {
      this.handlers = new Map();
    }
  
    publish(event, data) {
      console.log(`📢 Event: ${event}`, data);
      this.handlers.get(event)?.forEach(handler => handler(data));
    }
  
    subscribe(event, handler) {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, []);
      }
      this.handlers.get(event).push(handler);
    }
  
    unsubscribe(event, handler) {
      const handlers = this.handlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }
  
  module.exports = new EventBus();