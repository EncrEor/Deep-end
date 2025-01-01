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
    if (!partial || !partial.current) {
      console.warn('⚠️ Mise à jour d\'état invalide:', partial);
      return;
    }

    // Deep merge du state actuel avec le nouveau
    this.state = {
      ...this.state,
      current: {
        ...this.state.current,
        ...partial.current
      },
      history: {
        ...this.state.history,
        recentDeliveries: partial.current.delivery ? 
          [partial.current.delivery, ...this.state.history.recentDeliveries].slice(0, 10) : 
          this.state.history.recentDeliveries
      }
    };
  }
}

module.exports = new StateManager();