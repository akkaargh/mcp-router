import { Flow } from './flowTypes';

/**
 * Registry for flows
 */
export class FlowRegistry {
  private flows: Flow[] = [];

  /**
   * Add a flow to the registry
   */
  addFlow(flow: Flow): void {
    // Check if flow with this ID already exists
    const existingIndex = this.flows.findIndex(f => f.id === flow.id);
    if (existingIndex >= 0) {
      // Replace existing flow
      this.flows[existingIndex] = flow;
    } else {
      // Add new flow
      this.flows.push(flow);
    }
  }

  /**
   * Get all registered flows
   */
  getFlows(): Flow[] {
    return [...this.flows];
  }

  /**
   * Get a flow by ID
   */
  getFlowById(id: string): Flow | undefined {
    return this.flows.find(flow => flow.id === id);
  }

  /**
   * Remove a flow by ID
   */
  removeFlow(id: string): boolean {
    const initialLength = this.flows.length;
    this.flows = this.flows.filter(flow => flow.id !== id);
    return this.flows.length !== initialLength;
  }
}
