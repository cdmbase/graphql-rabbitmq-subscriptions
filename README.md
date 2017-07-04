# graphql-rabbitmq-subscriptions

This package implements the PusSubEngine Interface from the graphql-subscriptions package. 
It allows you to connect your subscriptions manger to a rabbitmq Pub Sub mechanism to support 
multiple subscription manager instances.

This package is copied from [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) originally and modified to work with RabbitMQ.
   
## Basic Usage

```javascript
import { AmqpPubSub } from 'graphql-rabbitmq-subscriptions';
const logger = <log function>;
const pubsub = new AmqpPubSub({logger});
const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,
  setupFunctions: {},
});
```

## Logging example

The `logger` need to be implementation of `bunyan`. You can use following example logger.

```javascript
import {ConsoleLogger,IConsoleLoggerSettings} from "@cdm-logger/server";
import * as Logger from "bunyan";

const settings: IConsoleLoggerSettings = {
  level: "info", // Optional: default 'info' ('trace'|'info'|'debug'|'warn'|'error'|'fatal')
  mode: "short" // Optional: default 'short' ('short'|'long'|'dev'|'raw')
}

const logger: Logger = ConsoleLogger.create("<app name>", settings);
```

Sample Logging trace file
```
[15:01:16.046Z] TRACE integration-test: trying to subscribe to queue 'testSubscription' (child=amqp-pubsub, class=AmqpPubSub)
[15:01:16.050Z] DEBUG integration-test: connecting to amqp://127.0.0.1:5672 (child=rabbitmq-pub-sub, class=RabbitMqConnectionFactory)
[15:01:16.109Z] TRACE integration-test: got channel for queue 'testSubscription' (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.110Z] TRACE integration-test: setup '{"name":"testSubscription","dlq":"","dlx":"testSubscription.DLQ.Exchange"}' (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.117Z] DEBUG integration-test: queue name generated for subscription queue '(testSubscription)' is '(amq.gen-0Nan220vcDjNVmnnXZOZxg)' (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.117Z] TRACE integration-test: subscribing to queue 'testSubscription' (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.119Z] TRACE integration-test: subscribed to queue 'testSubscription' (amq.ctag-nZJSNBvCUl2V_RGYF5ie5w) (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.119Z] TRACE integration-test: publishing for queue 'testSubscription' ("good") (child=amqp-pubsub, class=AmqpPubSub)
[15:01:16.120Z] DEBUG integration-test: connecting to amqp://127.0.0.1:5672 (child=rabbitmq-pub-sub, class=RabbitMqConnectionFactory)
[15:01:16.126Z] TRACE integration-test: got channel for exchange 'testSubscription.DLQ.Exchange' (child=rabbitmq-pub-sub, class=RabbitMqPublisher)
[15:01:16.127Z] TRACE integration-test: setup '{"name":"testSubscription","dlq":"","dlx":"testSubscription.DLQ.Exchange"}' (child=rabbitmq-pub-sub, class=RabbitMqPublisher)
[15:01:16.130Z] TRACE integration-test: message sent to exchange 'testSubscription.DLQ.Exchange' ("good") (child=rabbitmq-pub-sub, class=RabbitMqPublisher)
[15:01:16.132Z] TRACE integration-test: message arrived from queue 'testSubscription' ("good") (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.133Z] TRACE integration-test: sending message to subscriber callback function '("good")' (child=amqp-pubsub, class=AmqpPubSub)
[15:01:16.137Z] TRACE integration-test: disposing subscriber to queue 'testSubscription' (amq.ctag-nZJSNBvCUl2V_RGYF5ie5w) (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
[15:01:16.137Z] TRACE integration-test: list of subscriptions still available '({})' (child=amqp-pubsub, class=AmqpPubSub)
[15:01:16.138Z] TRACE integration-test: message processed from queue 'testSubscription' ("good") (child=rabbitmq-pub-sub, class=RabbitMqConsumer)
```
More details about [@cdm-logger/server](https://github.com/cdmbase/cdm-logger)

## Using Trigger Transform

Recently, graphql-subscriptions package added a way to pass in options to each call of subscribe.
Those options are constructed via the setupFunctions object you provide the Subscription Manager constructor.
The reason for graphql-subscriptions to add that feature is to allow pub sub engines a way to reduce their subscription set using the best method of said engine.
For example, meteor's live query could use mongo selector with arguments passed from the subscription like the subscribed entity id.

This is only the standard but I would like to present an example of creating a specific subscription using the channel options feature.

First I create a simple and generic trigger transform 
```javascript
const triggerTransform = (trigger, {path}) => [trigger, ...path].join('.');
```

Then I pass it to the `AmqpPubSub` constructor.
```javascript
const pubsub = new AmqpPubSub({
  triggerTransform,
});
```
Lastly, I provide a setupFunction for `commentsAdded` subscription field.
It specifies one trigger called `comments.added` and it is called with the channelOptions object that holds `repoName` path fragment.
```javascript
const subscriptionManager = new SubscriptionManager({
  schema,
  setupFunctions: {
    commentsAdded: (options, {repoName}) => ({
      'comments.added': {
        channelOptions: {path: [repoName]},
      },
    }),
  },
  pubsub,
});
```

When I call `subscribe` like this:
```javascript
const query = `
  subscription X($repoName: String!) {
    comments.added(repoName: $repoName)
  }
`;
const variables = {repoName: 'graphql-rabbitmq-subscriptions'};
subscriptionManager.subscribe({query, operationName: 'X', variables, callback});
```

The subscription string that RabbitMQ will receive will be `comments.added.graphql-rabbitmq-subscriptions`.
This subscription string is much more specific and means the the filtering required for this type of subscription is not needed anymore.
This is one step towards lifting the load off of the graphql api server regarding subscriptions.

## Passing rabbitmq options object

The basic usage is great for development and you will be able to connect to a rabbitmq server running on your system seamlessly.
But for any production usage you should probably pass in a rabbitmq options object
 
```javascript
import { AmqpPubSub } from 'graphql-rabbitmq-subscriptions';

const pubsub = new AmqpPubSub({
  config: {
    host: RABBITMQ_DOMAIN_NAME,
    port: PORT_NUMBER,
  },
  logger,
});
```
