class StateManager {
    constructor() {
      this.state = {
        current: {
          client: null,
          delivery: null,
          products: []
        },
        history: {
          recentDeliveries: [],
          clientInteractions: new Map(),
          returns: new Map()
        },
        cache: {
          clients: new Map(),
          products: new Map()
        }
      };
    }
  
    getState() {
      return this.state;
    }
  
    updateState(partial) {
      console.log('Mise à jour état:', partial);
      this.state = { ...this.state, ...partial };
    }
  }
  
  module.exports = new StateManager();