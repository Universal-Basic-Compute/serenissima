/**
 * Generic object pool for reusing Three.js objects
 * Helps reduce garbage collection and improve performance
 */
import * as THREE from 'three';

export interface Poolable {
  reset(): void;
  isActive(): boolean;
  setActive(active: boolean): void;
}

export class ObjectPool<T extends Poolable> {
  private pool: T[] = [];
  private factory: () => T;
  private maxSize: number;
  
  constructor(factory: () => T, initialSize: number = 0, maxSize: number = 1000) {
    this.factory = factory;
    this.maxSize = maxSize;
    
    // Pre-populate the pool with initial objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createObject());
    }
  }
  
  /**
   * Get an object from the pool or create a new one if none are available
   */
  public get(): T {
    // First try to find an inactive object in the pool
    const existingObject = this.pool.find(obj => !obj.isActive());
    
    if (existingObject) {
      existingObject.reset();
      existingObject.setActive(true);
      return existingObject;
    }
    
    // If no inactive objects are available and we haven't reached max size, create a new one
    if (this.pool.length < this.maxSize) {
      const newObject = this.createObject();
      newObject.setActive(true);
      this.pool.push(newObject);
      return newObject;
    }
    
    // If we've reached max size, reuse the oldest object
    const oldestObject = this.pool[0];
    oldestObject.reset();
    oldestObject.setActive(true);
    
    // Move to the end of the array to maintain age ordering
    this.pool.push(this.pool.shift()!);
    
    return oldestObject;
  }
  
  /**
   * Return an object to the pool
   */
  public release(object: T): void {
    object.setActive(false);
  }
  
  /**
   * Create a new object using the factory
   */
  private createObject(): T {
    const object = this.factory();
    object.setActive(false);
    return object;
  }
  
  /**
   * Get the current size of the pool
   */
  public size(): number {
    return this.pool.length;
  }
  
  /**
   * Get the number of active objects in the pool
   */
  public activeCount(): number {
    return this.pool.filter(obj => obj.isActive()).length;
  }
  
  /**
   * Clear the pool and release all objects
   */
  public clear(): void {
    this.pool.forEach(obj => obj.setActive(false));
  }
  
  /**
   * Dispose of all objects in the pool
   */
  public dispose(): void {
    this.pool = [];
  }
}
