const warn = console.warn;

/**
 * constructor(initial_value)
 * subscribe(callback: (value) => any)
 * unsubscribe(callback: (value) => any)
 */
class BaseSubscribable<T> {
  // the following used to be readonly, but we needed to change it for ReplaceObjectSubscribable
  protected value: T;
  private readonly subscribers: ((value: T) => void)[] = [];

  constructor(initialValue: T) {
    if (!initialValue) warn('Subscribable: use NOT NULL initial values!');
    this.value = initialValue;
  }

  addSubscriber(listener: (value: T) => any) {
    if (this.subscribers.includes(listener)) return warn(`Subscribable.addSubscriber: ${listener} already registered`);
    this.subscribers.push(listener);

    // also immediately notify the current value to the subscriber
    listener(this.value);
  }

  removeSubscriber(listener: (value: T) => any) {
    if (!this.subscribers.includes(listener)) return warn(`Subscribable.removeSubscriber: ${listener} not present`);
    this.subscribers.splice(this.subscribers.indexOf(listener), 1);
  }

  protected notifySubscribers = () => this.subscribers.forEach(listener => listener(this.value));
}

/**
 * Subscribe to property changes in objects; typed
 *  - offers partial updates to the object
 *  - provides object replacement
 */
export class ObjectSubscribable<T extends object> extends BaseSubscribable<T> {
  partialUpdate(update: Partial<T>): void {
    Object.assign(this.value, update);
    this.notifySubscribers();
  }

  replace(item: T): void {
    this.value = item;
    this.notifySubscribers();
  }

  // returns a shallow copy of the object - not that referenced objects are still modifiable
  // shallowCopy(): T {
  //   return {...this.value};
  // }
}

/**
 * Subscribe to List[T, T, T, ..] changes
 *  - full content updates
 *  - per-item replacement
 */
export class ListSubscribable<T extends object> extends BaseSubscribable<T[]> {
  replaceListContent(newContents: T[]) {
    this.value.length = 0;
    this.value.push(...newContents);
    this.notifySubscribers();
  }

  updateListItem(item: T, findPredicate: (value: T, index: number) => boolean | unknown) {
    const index = this.value.findIndex(findPredicate);
    if (index === -1)
      return console.error(`ListSubscribable.updateItem: cannot find item`, item);
    this.value[index] = item;
    this.notifySubscribers();
  }
}


export class SubscribableObjectMap<T extends object> {
  private readonly entries: { [key: string]: ObjectSubscribable<T> } = {};

  /**
   * @param key the unique ID of this item
   * @param listener the listener to add as subscriber
   * @param initialValueCallback callback that returns the initial value for this subscriber
   */
  addSubscriber(key: string, listener: (value: T) => any, initialValueCallback: () => T): void {
    let entry = this.entries[key];
    if (!entry)
      entry = this.entries[key] = new ObjectSubscribable<T>(initialValueCallback());
    entry.addSubscriber(listener);
  }

  removeSubscriber = (key: string, listener) => this.get(key, 'removeSubscriber')?.removeSubscriber(listener);

  replaceValue = (key: string, newValue: T) => this.get(key, 'replaceValue')?.replace(newValue);

  private get(key: string, scope: string = 'get'): ObjectSubscribable<T> {
    const entry = this.entries[key];
    if (!entry)
      warn(`get-${scope}: cannot find subscribable for ${key}`);
    return entry;
  }
}