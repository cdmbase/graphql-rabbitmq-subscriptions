import { PubSubEngine } from 'graphql-subscriptions/dist/pubsub-engine';
import { IRabbitMqConnectionConfig } from 'rabbitmq-pub-sub';
import * as Logger from 'bunyan';
export interface PubSubRabbitMQBusOptions {
    config?: IRabbitMqConnectionConfig;
    connectionListener?: (err: Error) => void;
    triggerTransform?: TriggerTransform;
    logger?: Logger;
}
export declare class AmqpPubSub implements PubSubEngine {
    private consumer;
    private producer;
    private subscriptionMap;
    private subsRefsMap;
    private currentSubscriptionId;
    private triggerTransform;
    private unsubscribeChannelMap;
    private logger;
    constructor(options?: PubSubRabbitMQBusOptions);
    publish(trigger: string, payload: any): Promise<void>;
    subscribe(trigger: string, onMessage: Function, options?: Object): Promise<number>;
    unsubscribe(subId: number): void;
    asyncIterator<T>(triggers: string | string[]): AsyncIterator<T>;
    private onMessage;
}
export declare type Path = Array<string | number>;
export declare type Trigger = string | Path;
export declare type TriggerTransform = (trigger: Trigger, channelOptions?: Object) => string;
