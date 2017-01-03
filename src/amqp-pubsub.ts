import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub';
import {RabbitMqConnectionFactory,RabbitMqConsumer,RabbitMqProducer,IRabbitMqConnectionConfig} from "rokot-mq-rabbit";
import logger from 'cdm-logger';

export interface PubSubRabbitMQBusOptions extends IRabbitMqConnectionConfig{
  connectionListener?: (err: Error) => void;
  host: 'localhost',
  port: 5672,
}

const logger: Logger = logger;

export class AmqpPubSub implements PubSubEngine {

  private consumer:any;
  private producer:any;
  private subscriptionMap: {[subId: number]: [string , Function]};
  private subsRefsMap: {[trigger: string]: Array<number>};
  private currentSubscriptionId: number;
  private triggerTransform: TriggerTransform;

  constructor(options: PubSubRabbitMQBusOptions) {
      const { host = 'localhost', port= 5672, logger } = options;
      const factory = new PubSubRabbitMQBusOptions(logger, {host, port});
     this.consumer = new RabbitMqConsumer(logger, factory);
     this.producer = new RabbitMqProducer(logger, factory);
  }

  public publish(trigger: string, payload: any): boolean {
    return this.producer.publish(trigger, JSON.stringify(payload));
  }

  public subscribe(trigger: string, onMessage: Function, options?: Object): Promise<number> {
    const triggerName: string = this.triggerTransform(trigger, options);
    const id = this.currentSubscriptionId++;
    this.subscriptionMap[id] = [triggerName, onMessage];

    let refs = this.subsRefsMap[triggerName];
    if (refs && refs.length > 0 ) {
      const newRefs = [...refs, id];
      this.subsRefsMap[triggerName] = newRefs;
      return Promise.resolve(id);
    } else {
      return new Promise<number>((resolve, reject) => {
        this.consumer.subscribe(trigger, m => {
          console.log("Message", m);
        }).then(disposer => {
          disposer().then(() => {
            // resolved when consumer subscription disposed
          });
        }).catch(err => {
          // failed to create consumer subscription!
        });
      })
    }
  }

  public unsubscribe(subId: number) {
    const [triggerName = null] = this.subscriptionMap[subId] || [];
    const refs = this.subsRefsMap[triggerName];

    if (!refs)
      throw new Error(`There is no subscription of id "{subId}"`);

    let newRefs;
    if (refs.length === 1) {

    } else {
      const index = refs.indexOf(subId);
      if (index != -1) {
        newRefs = [ ...refs.slice(0, index), ...refs.slice(index + 1)];
      }
    }

    this.subsRefsMap[triggerName] = newRefs;
    delete this.subscriptionMap[subId];
  }

private onMessage(channel: string, message: string) {
  const subscribers = this.subsRefsMap[channel];

  // Don't work for nothing..
  if (!subscribers || !subscribers.length)
    return;

  let parsedMessage;
  try {
    parsedMessage = JSON.parse(message);
  } catch (e) {
    parsedMessage = message;
  }

  each(subscribers, (subId, cb) => {
    // TODO Support pattern based subscriptions
    const [triggerName, listener] = this.subscriptionMap[subId];
    listener(parsedMessage);
    cb();
  })
}
}


