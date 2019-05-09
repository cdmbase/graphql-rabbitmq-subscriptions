import { $$asyncIterator } from 'iterall';
import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub-engine';
import * as Logger from 'bunyan';
/**
 * A class for digesting PubSubEngine events via the new AsyncIterator interface.
 * This implementation is a generic version of the one located at
 * https://github.com/apollographql/graphql-subscriptions/blob/master/src/event-emitter-to-async-iterator.ts
 * @class
 *
 * @constructor
 *
 * @property pullQueue @type {Function[]}
 * A queue of resolve functions waiting for an incoming event which has not yet arrived.
 * This queue expands as next() calls are made without PubSubEngine events occurring in between.
 *
 * @property pushQueue @type {any[]}
 * A queue of PubSubEngine events waiting for next() calls to be made.
 * This queue expands as PubSubEngine events arrice without next() calls occurring in between.
 *
 * @property eventsArray @type {string[]}
 * An array of PubSubEngine event names which this PubSubAsyncIterator should watch.
 *
 * @property allSubscribed @type {Promise<number[]>}
 * A promise of a list of all subscription ids to the passed PubSubEngine.
 *
 * @property listening @type {boolean}
 * Whether or not the PubSubAsynIterator is in listening mode (responding to incoming PubSubEngine events and next() calls).
 * Listening begins as true and turns to false once the return method is called.
 *
 * @property pubsub @type {PubSubEngine}
 * The PubSubEngine whose events will be observed.
 */
export class PubSubAsyncIterator<T> implements AsyncIterator<T> {

  private pullQueue: Function[];
  private pushQueue: any[];
  private eventsArray: string[];
  private allSubscribed: Promise<number[]>;
  private listening: boolean;
  private pubsub: PubSubEngine;
  private logger: Logger;

  constructor(pubsub: PubSubEngine, eventNames: string | string[], logger?: Logger) {
    this.logger = logger.child({ className: 'pubsub-async-iterator' });
    this.pubsub = pubsub;
    this.pullQueue = [];
    this.pushQueue = [];
    this.listening = true;
    this.eventsArray = typeof eventNames === 'string' ? [eventNames] : eventNames;
    this.allSubscribed = this.subscribeAll();
  }

  public async next() {
    this.logger.trace('next has been called, current state [ pullQueue: (%j) pushQueue: (%j)]', this.pullQueue, this.pushQueue);
    await this.allSubscribed;
    return this.listening ? this.pullValue() : this.return();
  }

  public async return() {
    this.logger.trace('calling [return]');
    this.emptyQueue(await this.allSubscribed);
    return { value: undefined, done: true };
  }

  public async throw(error) {
    this.logger.trace('throwing error');
    this.emptyQueue(await this.allSubscribed);
    return Promise.reject(error);
  }

  public [$$asyncIterator]() {
    this.logger.trace('[$$asyncIterator]');
    return this;
  }

  private async pushValue(event) {
    this.logger.trace('[pushValue] with event (%j)', event);
    await this.allSubscribed;
    if (this.pullQueue.length !== 0) {
      this.logger.trace('pull event (%j) from pullQueue (%j)', event, this.pullQueue);
      this.pullQueue.shift()({ value: event, done: false });
    } else {
      this.pushQueue.push(event);
      this.logger.trace('push event (%j) to pushQueue (%j)', event, this.pullQueue);      
    }
  }

  private pullValue(): Promise<IteratorResult<any>> {
    this.logger.trace('[pullValue] ');
    return new Promise((resolve => {
      if (this.pushQueue.length !== 0) {
        this.logger.trace('pluck last event from pushQueue (%j)', this.pushQueue);
        resolve({ value: this.pushQueue.shift(), done: false });
      } else {
        this.pullQueue.push(resolve);
        this.logger.trace('push Promise.resolve into pullQueue (%j)', this.pullQueue);
      }
    }));
  }

  private emptyQueue(subscriptionIds: number[]) {
    this.logger.trace('[emptyQueue] ');
    if (this.listening) {
      this.logger.trace('listening is true, it will unsubscribeAll, will empty all elements in pullQueue (%j)', this.pullQueue);
      this.listening = false;
      this.unsubscribeAll(subscriptionIds);
      this.pullQueue.forEach(resolve => resolve({ value: undefined, done: true }));
      this.pullQueue.length = 0;
      this.pushQueue.length = 0;
    }
  }

  private subscribeAll() {
    this.logger.trace('[subscribeAll] ');
    return Promise.all(this.eventsArray.map(
      eventName => {
        this.logger.trace('subscribing to eventName (%j) with onMessage as this.pushValue', eventName);
        return this.pubsub.subscribe(eventName, this.pushValue.bind(this), {});
      },
    ));
  }

  private unsubscribeAll(subscriptionIds: number[]) {
    this.logger.trace('unsubscribeAll to all subIds (%j)', subscriptionIds);
    for (const subscriptionId of subscriptionIds) {
      this.pubsub.unsubscribe(subscriptionId);
    }
  }
}
