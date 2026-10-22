/**
 * Headless, reactive state container independent of DOM or TUI runtime.
 */

export type Reducer<TState, TAction> = (state: TState, action: TAction) => TState
export type Listener<TState> = (state: TState) => void

export class HeadlessStore<TState, TAction> {
  private state: TState
  private reducer: Reducer<TState, TAction>
  private listeners: Set<Listener<TState>> = new Set()

  constructor(initialState: TState, reducer: Reducer<TState, TAction>) {
    this.state = initialState
    this.reducer = reducer
  }

  getState(): TState {
    return this.state
  }

  dispatch(action: TAction): TState {
    this.state = this.reducer(this.state, action)
    for (const listener of this.listeners) {
      try {
        listener(this.state)
      } catch (err) {
        console.error('Error in HeadlessStore listener:', err)
      }
    }
    return this.state
  }

  subscribe(listener: Listener<TState>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
